/**
 * KAS PA v4.3 - Auto-Labeler
 *
 * Erzeugt vorläufige Labels für Event-Kandidaten.
 * WICHTIG: Auto-Labels sind VORSTUFEN, nicht Ground Truth.
 * Jedes Auto-Label muss als 'pending_review' markiert werden.
 */

import {
  EventCandidate,
  PreliminaryLabel,
  LabelClass,
  EvidenceRef,
} from './schema.js';
import { labelingRuleEngine, LabelingRuleEngine } from './labeling-rules.js';

// ============================================================================
// AUTO-LABELING RESULT
// ============================================================================

export interface AutoLabelingResult {
  candidateId: string;
  preliminaryLabel: PreliminaryLabel;
  labelingMetadata: {
    systemVersion: string;
    labeledAt: number;
    labeledBy: 'system';
    autoLabelId: string;
    processingTimeMs: number;
  };
  documentation: {
    ruleDocumentation: string;
    knownWeaknesses: string[];
    expectedFalsePositives: string[];
    expectedFalseNegatives: string[];
  };
}

// ============================================================================
// AUTO-LABELER
// ============================================================================

export class AutoLabeler {
  private labels: Map<string, PreliminaryLabel> = new Map();
  private ruleEngine: LabelingRuleEngine;
  private autoLabelIdCounter: number = 0;
  private systemVersion: string = 'v4.3.0-gt-auto';

  constructor() {
    this.ruleEngine = labelingRuleEngine;
  }

  /**
   * Label einen einzelnen Candidate
   */
  labelCandidate(candidate: EventCandidate): AutoLabelingResult {
    const startTime = Date.now();

    // Extrahiere Features aus Candidate
    const features = this.extractCandidateFeatures(candidate);

    // Evaluiere gegen Regelwerk
    const ruleResult = this.ruleEngine.evaluateCandidate(features);

    // Baue vorläufiges Label
    const autoLabelId = `auto_${Date.now()}_${++this.autoLabelIdCounter}`;

    const preliminaryLabel: PreliminaryLabel = {
      candidateId: candidate.candidateId,
      labelId: autoLabelId,
      labelClass: ruleResult.label,
      labelConfidence: ruleResult.confidence,
      labelingRule: ruleResult.matchedRules.join(', ') || 'NO_RULE_MATCH',
      labelingReasons: ruleResult.evidence.map(e => e.reason),
      supportingEvidence: ruleResult.matchedRules.map(ruleId => ({
        type: this.getEvidenceTypeFromRule(ruleId),
        sourceId: candidate.candidateId,
        weight: 0.8,
        timestamp: candidate.detectionTimestamp,
      })),
      contradictingEvidence: [],
      dataGaps: ruleResult.dataGaps,
      status: 'pending_review',
      version: 1,
      labeledAt: Date.now(),
      labeledBy: 'system',
      systemVersion: this.systemVersion,
      knownWeaknesses: this.getKnownWeaknesses(ruleResult.matchedRules),
      expectedFalsePositives: this.getExpectedFPs(ruleResult.label),
      expectedFalseNegatives: this.getExpectedFNs(ruleResult.label),
    };

    // Speichere
    this.labels.set(autoLabelId, preliminaryLabel);

    // Dokumentation
    const documentation = this.ruleEngine.documentDecision(ruleResult);

    return {
      candidateId: candidate.candidateId,
      preliminaryLabel,
      labelingMetadata: {
        systemVersion: this.systemVersion,
        labeledAt: preliminaryLabel.labeledAt,
        labeledBy: 'system',
        autoLabelId,
        processingTimeMs: Date.now() - startTime,
      },
      documentation: {
        ruleDocumentation: documentation,
        knownWeaknesses: preliminaryLabel.knownWeaknesses,
        expectedFalsePositives: preliminaryLabel.expectedFalsePositives,
        expectedFalseNegatives: preliminaryLabel.expectedFalseNegatives,
      },
    };
  }

  /**
   * Label mehrere Kandidaten
   */
  labelCandidates(candidates: EventCandidate[]): AutoLabelingResult[] {
    return candidates.map(c => this.labelCandidate(c));
  }

  /**
   * Hole alle Auto-Labels
   */
  getAllLabels(): PreliminaryLabel[] {
    return Array.from(this.labels.values());
  }

  /**
   * Hole Labels nach Status
   */
  getLabelsByStatus(status: PreliminaryLabel['status']): PreliminaryLabel[] {
    return this.getAllLabels().filter(l => l.status === status);
  }

  /**
   * Hole Labels für bestimmten Candidate
   */
  getLabelsForCandidate(candidateId: string): PreliminaryLabel[] {
    return this.getAllLabels().filter(l => l.candidateId === candidateId);
  }

  /**
   * Update Label Status
   */
  updateLabelStatus(labelId: string, status: PreliminaryLabel['status']): boolean {
    const label = this.labels.get(labelId);
    if (!label) return false;

    label.status = status;
    return true;
  }

  /**
   * Hole Statistiken
   */
  getStats(): {
    totalLabels: number;
    byStatus: Record<string, number>;
    byLabelClass: Record<string, number>;
    avgConfidence: number;
    pendingReviewCount: number;
  } {
    const labels = this.getAllLabels();
    const byStatus: Record<string, number> = {};
    const byLabelClass: Record<string, number> = {};
    let totalConfidence = 0;

    for (const label of labels) {
      byStatus[label.status] = (byStatus[label.status] || 0) + 1;
      byLabelClass[label.labelClass] = (byLabelClass[label.labelClass] || 0) + 1;
      totalConfidence += label.labelConfidence;
    }

    return {
      totalLabels: labels.length,
      byStatus,
      byLabelClass,
      avgConfidence: labels.length > 0 ? totalConfidence / labels.length : 0,
      pendingReviewCount: byStatus['pending_review'] || 0,
    };
  }

  /**
   * Exportiere Auto-Labels als JSONL
   */
  exportToJSONL(path: string): number {
    const labels = this.getAllLabels();
    const jsonl = labels.map(l => JSON.stringify(l)).join('\n');
    // writeFileSync(path, jsonl + '\n');
    console.log(`Would export ${labels.length} auto-labels to ${path}`);
    return labels.length;
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private extractCandidateFeatures(candidate: EventCandidate): Record<string, unknown> {
    return {
      priceChange5m: candidate.priceChange5m,
      priceChange15m: candidate.priceChange15m,
      priceChange1h: candidate.priceChange1h,
      priceChange4h: candidate.priceChange4h,
      priceChange24h: candidate.priceChange24h,
      maxDrawdownDuringEvent: candidate.maxDrawdownDuringEvent,
      volumeChange5m: candidate.volumeChange5m,
      volumeChange1h: candidate.volumeChange1h,
      volumeSpikeMultiplier: candidate.volumeChange1h ?
        (candidate.volumeChange1h > 0 ? candidate.volumeChange1h + 1 : 1) : undefined,
      liquidityChange: candidate.liquidityChange,
      buySellImbalance: candidate.buySellImbalance,
      botActivityScore: candidate.botActivityScore,
      smartMoneyActivity: candidate.smartMoneyActivity,
      whaleConcentration: candidate.whaleConcentration,
      whaleVolumeSol: candidate.whaleConcentration ? candidate.whaleConcentration * 100 : undefined,
      transactionBurstScore: candidate.transactionBurstScore,
      clusterScore: candidate.clusterScore,
      structuralBreakScore: candidate.structuralBreakScore,
      holderFragmentation: candidate.holderFragmentation,
      dataCompleteness: this.estimateDataCompleteness(candidate),
    };
  }

  private estimateDataCompleteness(candidate: EventCandidate): 'complete' | 'partial' | 'insufficient' {
    const requiredFields = [
      'priceChange24h', 'priceChange4h', 'volumeChange1h', 'botActivityScore'
    ];

    let missingCount = 0;
    for (const field of requiredFields) {
      if (candidate[field as keyof EventCandidate] === undefined) {
        missingCount++;
      }
    }

    if (missingCount >= 3) return 'insufficient';
    if (missingCount >= 1) return 'partial';
    return 'complete';
  }

  private getEvidenceTypeFromRule(ruleId: string): EvidenceRef['type'] {
    const typeMap: Record<string, EvidenceRef['type']> = {
      'AUTO_MASSIVE_DUMP_24H': 'price_drop',
      'AUTO_MASSIVE_DUMP_4H': 'price_drop',
      'AUTO_NORMAL_VOLATILITY': 'volume_spike',
      'AUTO_ILLIQUID_RANDOM': 'liquidity_drop',
      'AUTO_WHALE_SELL': 'whale_activity',
      'AUTO_BOT_NO_IMPACT': 'bot_activity',
      'AUTO_UNCERTAIN': 'manual',
      'AUTO_DATA_INSUFFICIENT': 'manual',
    };
    return typeMap[ruleId] || 'manual';
  }

  private getKnownWeaknesses(ruleIds: string[]): string[] {
    const weaknesses: string[] = [];
    for (const ruleId of ruleIds) {
      switch (ruleId) {
        case 'AUTO_MASSIVE_DUMP_24H':
          weaknesses.push('Kann illiquide Moves als Dump missinterpretieren');
          break;
        case 'AUTO_MASSIVE_DUMP_4H':
          weaknesses.push('Kurze Dumps可能被遗漏');
          break;
        case 'AUTO_BOT_NO_IMPACT':
          weaknesses.push('Bot-Aktivität kann Vorläufer von Dump sein');
          break;
      }
    }
    return weaknesses;
  }

  private getExpectedFPs(label: LabelClass): string[] {
    switch (label) {
      case 'MASSIVE_DUMP':
        return ['NORMAL_VOLATILITY被误标记为MASSIVE_DUMP', 'Illiquider Move mit temporärem Preisverlust'];
      case 'NORMAL_VOLATILITY':
        return ['Langsamer Dump als normal fehlinterpretiert'];
      case 'BOT_ACTIVITY_NO_PRICE_IMPACT':
        return ['Bot-Aktivität vor echtem Dump'];
      default:
        return [];
    }
  }

  private getExpectedFNs(label: LabelClass): string[] {
    switch (label) {
      case 'MASSIVE_DUMP':
        return ['Langsame продолжительный Dumps werden nicht erkannt'];
      case 'NORMAL_VOLATILITY':
        return ['Schnelle kleine Dumps werden als normal fehlinterpretiert'];
      default:
        return [];
    }
  }

  /**
   * Reset Auto-Labeler
   */
  reset(): void {
    this.labels.clear();
    this.autoLabelIdCounter = 0;
  }
}

// Export singleton
export const autoLabeler = new AutoLabeler();