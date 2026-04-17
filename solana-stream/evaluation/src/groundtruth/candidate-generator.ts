/**
 * KAS PA v4.3 - Event Candidate Generator
 *
 * Generiert Event-Kandidaten aus historischen Daten.
 * Kandidaten sind NICHT Ground Truth - sie sind nur Vorstufen.
 */

import { EventCandidate, EvidenceRef, RawObservation } from './schema.js';

// ============================================================================
// CANDIDATE TRIGGER CONFIGURATION
// ============================================================================

export interface CandidateTrigger {
  id: string;
  name: string;
  type: 'price_drop' | 'volume_spike' | 'liquidity_drop' | 'bot_activity' |
        'orderflow_imbalance' | 'transaction_burst' | 'structural_break' | 'combined';
  conditions: TriggerCondition[];
  windowMinutes: number;
  priority: number;
  description: string;
}

export interface TriggerCondition {
  field: keyof EventCandidateFeatures;
  operator: '>' | '<' | '>=' | '<=';
  threshold: number;
  unit?: string;
}

export interface EventCandidateFeatures {
  priceChange5m?: number;
  priceChange15m?: number;
  priceChange1h?: number;
  priceChange4h?: number;
  priceChange24h?: number;
  volumeChange5m?: number;
  volumeChange1h?: number;
  volumeSpikeMultiplier?: number;
  liquidityChange?: number;
  buySellImbalance?: number;
  botActivityScore?: number;
  smartMoneyActivity?: number;
  whaleConcentration?: number;
  whaleVolumeSol?: number;
  holderFragmentation?: number;
  transactionBurstScore?: number;
  clusterScore?: number;
  structuralBreakScore?: number;
}

// ============================================================================
// CONFIGURED TRIGGERS
// ============================================================================

export const CANDIDATE_TRIGGERS: CandidateTrigger[] = [
  {
    id: 'TRIGGER_PRICE_DROP_30PCT_24H',
    name: 'Price Drop >= 30% in 24h',
    type: 'price_drop',
    conditions: [
      { field: 'priceChange24h', operator: '<=', threshold: -0.30 },
    ],
    windowMinutes: 1440, // 24h
    priority: 1,
    description: 'Starker Preisverlust über 24 Stunden',
  },

  {
    id: 'TRIGGER_PRICE_DROP_20PCT_4H',
    name: 'Price Drop >= 20% in 4h',
    type: 'price_drop',
    conditions: [
      { field: 'priceChange4h', operator: '<=', threshold: -0.20 },
    ],
    windowMinutes: 240, // 4h
    priority: 2,
    description: 'Schneller Preisverlust über 4 Stunden',
  },

  {
    id: 'TRIGGER_PRICE_DROP_10PCT_1H',
    name: 'Price Drop >= 10% in 1h',
    type: 'price_drop',
    conditions: [
      { field: 'priceChange1h', operator: '<=', threshold: -0.10 },
    ],
    windowMinutes: 60, // 1h
    priority: 3,
    description: 'Kurzfristiger Preisverlust',
  },

  {
    id: 'TRIGGER_VOLUME_SPIKE_3X',
    name: 'Volume Spike >= 3x Average',
    type: 'volume_spike',
    conditions: [
      { field: 'volumeSpikeMultiplier', operator: '>=', threshold: 3.0 },
    ],
    windowMinutes: 60,
    priority: 3,
    description: 'Ungewöhnlich hohes Volumen',
  },

  {
    id: 'TRIGGER_LIQUIDITY_DROP_50PCT',
    name: 'Liquidity Drop >= 50%',
    type: 'liquidity_drop',
    conditions: [
      { field: 'liquidityChange', operator: '<=', threshold: -0.50 },
    ],
    windowMinutes: 60,
    priority: 2,
    description: 'Signifikanter Liquiditätsverlust',
  },

  {
    id: 'TRIGGER_BOT_ACTIVITY_HIGH',
    name: 'High Bot Activity (>= 70%)',
    type: 'bot_activity',
    conditions: [
      { field: 'botActivityScore', operator: '>=', threshold: 0.70 },
    ],
    windowMinutes: 30,
    priority: 4,
    description: 'Erhöhte Bot-Aktivität',
  },

  {
    id: 'TRIGGER_ORDERFLOW_SKEW',
    name: 'Order Flow Imbalance >= 0.3',
    type: 'orderflow_imbalance',
    conditions: [
      { field: 'buySellImbalance', operator: '<=', threshold: -0.30 },
    ],
    windowMinutes: 30,
    priority: 4,
    description: 'Starkes Sell-Ungleichgewicht',
  },

  {
    id: 'TRIGGER_WHALE_CONCENTRATION',
    name: 'High Whale Concentration (>= 80%)',
    type: 'combined',
    conditions: [
      { field: 'whaleConcentration', operator: '>=', threshold: 0.80 },
      { field: 'whaleVolumeSol', operator: '>=', threshold: 50 },
    ],
    windowMinutes: 120,
    priority: 3,
    description: 'Whale-Dominanz im Orderflow',
  },

  {
    id: 'TRIGGER_STRUCTURAL_BREAK',
    name: 'Structural Break Detected',
    type: 'structural_break',
    conditions: [
      { field: 'structuralBreakScore', operator: '>=', threshold: 0.70 },
    ],
    windowMinutes: 60,
    priority: 2,
    description: 'Struktureller Bruch in Graph/Netzwerk',
  },

  {
    id: 'TRIGGER_COMBINED_CASCADE',
    name: 'Combined: Price Drop + Volume + Bot',
    type: 'combined',
    conditions: [
      { field: 'priceChange4h', operator: '<=', threshold: -0.15 },
      { field: 'volumeSpikeMultiplier', operator: '>=', threshold: 2.0 },
      { field: 'botActivityScore', operator: '>=', threshold: 0.60 },
    ],
    windowMinutes: 240,
    priority: 1,
    description: 'Kaskade aus mehreren anomalen Signalen',
  },
];

// ============================================================================
// CANDIDATE GENERATOR
// ============================================================================

export class CandidateGenerator {
  private triggers: Map<string, CandidateTrigger> = new Map();
  private candidates: Map<string, EventCandidate> = new Map();
  private candidateIdCounter: number = 0;

  constructor() {
    for (const trigger of CANDIDATE_TRIGGERS) {
      this.triggers.set(trigger.id, trigger);
    }
  }

  /**
   * Generiere Kandidaten aus Rohdaten-Snapshots
   */
  generateCandidates(
    snapshots: RawObservation[],
    options: {
      mergeWindowMs?: number;  // Wie nah müssen Trigger sein um zusammengeführt zu werden
      minTriggers?: number;      // Mindestanzahl Trigger für einen Candidate
    } = {}
  ): EventCandidate[] {
    const mergeWindowMs = options.mergeWindowMs || 3600000; // 1 Stunde
    const minTriggers = options.minTriggers || 1;

    const detectedCandidates: Map<string, DetectedTrigger[]> = new Map();

    // Phase 1: Finde alle Trigger in den Daten
    for (const snapshot of snapshots) {
      const features = this.extractFeatures(snapshot);

      for (const [triggerId, trigger] of this.triggers) {
        if (this.evaluateTrigger(trigger, features)) {
          const key = this.getTokenWindowKey(snapshot.tokenAddress, snapshot.timestamp, trigger.windowMinutes);

          if (!detectedCandidates.has(key)) {
            detectedCandidates.set(key, []);
          }

          detectedCandidates.get(key)!.push({
            triggerId,
            timestamp: snapshot.timestamp,
            snapshotId: snapshot.id,
            features,
          });
        }
      }
    }

    // Phase 2: Gruppiere und fusioniere Trigger zu Candidates
    const candidates: EventCandidate[] = [];
    const mergedKeys: Set<string> = new Set();

    for (const [key, triggers] of detectedCandidates) {
      if (triggers.length < minTriggers) continue;
      if (mergedKeys.has(key)) continue;

      // Finde den dominanten Trigger (höchste Priorität)
      const sortedTriggers = triggers.sort((a, b) => {
        const triggerA = this.triggers.get(a.triggerId)!;
        const triggerB = this.triggers.get(b.triggerId)!;
        return triggerA.priority - triggerB.priority;
      });

      const primaryTrigger = sortedTriggers[0];
      const triggerDef = this.triggers.get(primaryTrigger.triggerId)!;

      // Erstelle Candidate
      const candidateId = `cand_${Date.now()}_${++this.candidateIdCounter}`;
      const windowStart = primaryTrigger.timestamp - (triggerDef.windowMinutes * 60000);
      const windowEnd = primaryTrigger.timestamp;

      const candidate: EventCandidate = {
        candidateId,
        tokenAddress: this.extractTokenAddress(key),
        tokenSymbol: this.extractTokenSymbol(key),
        pairAddress: '',
        chain: 'solana',
        marketType: 'memecoin',
        detectionTimestamp: Date.now(),
        candidateWindowStart: windowStart,
        candidateWindowEnd: windowEnd,
        triggerTime: primaryTrigger.timestamp,
        detectionRule: triggerDef.id,
        detectionConfidence: this.calculateCandidateConfidence(triggers),
        preliminaryEvidence: this.buildEvidenceRefs(triggers),
        status: 'candidate',
        version: 1,
        sourceObservationIds: triggers.map(t => t.snapshotId),
        priceChange5m: primaryTrigger.features.priceChange5m,
        priceChange15m: primaryTrigger.features.priceChange15m,
        priceChange1h: primaryTrigger.features.priceChange1h,
        priceChange4h: primaryTrigger.features.priceChange4h,
        priceChange24h: primaryTrigger.features.priceChange24h,
        volumeChange5m: primaryTrigger.features.volumeChange5m,
        volumeChange1h: primaryTrigger.features.volumeChange1h,
        liquidityChange: primaryTrigger.features.liquidityChange,
        buySellImbalance: primaryTrigger.features.buySellImbalance,
        botActivityScore: primaryTrigger.features.botActivityScore,
        smartMoneyActivity: primaryTrigger.features.smartMoneyActivity,
        whaleConcentration: primaryTrigger.features.whaleConcentration,
        transactionBurstScore: primaryTrigger.features.transactionBurstScore,
        clusterScore: primaryTrigger.features.clusterScore,
        structuralBreakScore: primaryTrigger.features.structuralBreakScore,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: 'system',
      };

      candidates.push(candidate);
      this.candidates.set(candidateId, candidate);
      mergedKeys.add(key);
    }

    // Sortiere nach Detection Confidence (absteigend)
    candidates.sort((a, b) => b.detectionConfidence - a.detectionConfidence);

    return candidates;
  }

  /**
   * Extrahiere Features aus einem Raw Observation
   */
  private extractFeatures(snapshot: RawObservation): EventCandidateFeatures {
    return {
      priceChange5m: snapshot.priceChange5m,
      priceChange15m: snapshot.priceChange15m,
      priceChange1h: snapshot.priceChange1h,
      priceChange4h: snapshot.priceChange4h,
      priceChange24h: snapshot.priceChange24h,
      volumeChange5m: snapshot.volumeChange5m,
      volumeChange1h: snapshot.volumeChange1h,
      volumeSpikeMultiplier: snapshot.volumeSpikeMultiplier,
      liquidityChange: snapshot.liquidityChange,
      buySellImbalance: snapshot.buySellImbalance,
      botActivityScore: snapshot.botProbability,
      smartMoneyActivity: snapshot.smartMoneyFlow,
      whaleConcentration: snapshot.whaleVolumeSol ? 0.7 : 0.3, // Placeholder
      whaleVolumeSol: snapshot.whaleVolumeSol,
      holderFragmentation: snapshot.holderFragmentation,
      transactionBurstScore: snapshot.txBurstScore,
      clusterScore: snapshot.clusterScore,
      structuralBreakScore: snapshot.structuralBreakScore,
    };
  }

  /**
   * Evaluiere ob ein Trigger für gegebene Features auslöst
   */
  private evaluateTrigger(trigger: CandidateTrigger, features: EventCandidateFeatures): boolean {
    for (const condition of trigger.conditions) {
      const value = features[condition.field];
      if (value === undefined || value === null) return false;

      switch (condition.operator) {
        case '>': if (!(value > condition.threshold)) return false; break;
        case '<': if (!(value < condition.threshold)) return false; break;
        case '>=': if (!(value >= condition.threshold)) return false; break;
        case '<=': if (!(value <= condition.threshold)) return false; break;
      }
    }
    return true;
  }

  /**
   * Generiere einen eindeutigen Key für Token+Window Kombination
   */
  private getTokenWindowKey(tokenAddress: string, timestamp: number, windowMinutes: number): string {
    const windowStart = Math.floor(timestamp / (windowMinutes * 60000)) * (windowMinutes * 60000);
    return `${tokenAddress}:${windowStart}`;
  }

  private extractTokenAddress(key: string): string {
    return key.split(':')[0];
  }

  private extractTokenSymbol(key: string): string {
    // Placeholder - würde normalerweise aus Mapping kommen
    return key.split(':')[0].substring(0, 8);
  }

  /**
   * Berechne Candidate Confidence basierend auf Anzahl der Trigger
   */
  private calculateCandidateConfidence(triggers: DetectedTrigger[]): number {
    if (triggers.length === 0) return 0;

    // Basis-Confidence steigt mit Anzahl der Trigger
    let confidence = 0.5 + (triggers.length * 0.1);

    // Bonus für wichtigere Trigger (niedrigere Priorität = wichtiger)
    for (const t of triggers) {
      const trigger = this.triggers.get(t.triggerId);
      if (trigger && trigger.priority <= 2) {
        confidence += 0.1;
      }
    }

    return Math.min(confidence, 0.95);
  }

  /**
   * Baue Evidence References für Candidate
   */
  private buildEvidenceRefs(triggers: DetectedTrigger[]): EvidenceRef[] {
    return triggers.map(t => ({
      type: this.getEvidenceType(t.triggerId),
      sourceId: t.snapshotId,
      weight: 0.8,
      timestamp: t.timestamp,
      details: { triggerId: t.triggerId },
    }));
  }

  private getEvidenceType(triggerId: string): EvidenceRef['type'] {
    const trigger = this.triggers.get(triggerId);
    if (!trigger) return 'manual';

    const typeMap: Record<string, EvidenceRef['type']> = {
      'price_drop': 'price_drop',
      'volume_spike': 'volume_spike',
      'liquidity_drop': 'liquidity_drop',
      'bot_activity': 'bot_activity',
      'orderflow_imbalance': 'orderflow_imbalance',
      'transaction_burst': 'transaction_burst',
      'structural_break': 'structural_break',
      'combined': 'price_drop',
    };

    return typeMap[trigger.type] || 'manual';
  }

  /**
   * Hole alle generierten Kandidaten
   */
  getAllCandidates(): EventCandidate[] {
    return Array.from(this.candidates.values());
  }

  /**
   * Hole Kandidaten mit bestimmtem Status
   */
  getCandidatesByStatus(status: EventCandidate['status']): EventCandidate[] {
    return this.getAllCandidates().filter(c => c.status === status);
  }

  /**
   * Aktualisiere Candidate Status
   */
  updateCandidateStatus(candidateId: string, status: EventCandidate['status']): boolean {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) return false;

    candidate.status = status;
    candidate.updatedAt = Date.now();
    candidate.version++;
    return true;
  }

  /**
   * Statistiken
   */
  getStats(): {
    totalCandidates: number;
    byStatus: Record<string, number>;
    byTrigger: Record<string, number>;
  } {
    const byStatus: Record<string, number> = {};
    const byTrigger: Record<string, number> = {};

    for (const candidate of this.candidates.values()) {
      byStatus[candidate.status] = (byStatus[candidate.status] || 0) + 1;

      // Extrahiere primären Trigger aus detectionRule
      const primaryTrigger = candidate.detectionRule.split('_')[0] + '_' + candidate.detectionRule.split('_')[1];
      byTrigger[primaryTrigger] = (byTrigger[primaryTrigger] || 0) + 1;
    }

    return {
      totalCandidates: this.candidates.size,
      byStatus,
      byTrigger,
    };
  }

  /**
   * Exportiere Kandidaten als JSONL
   */
  exportToJSONL(path: string): number {
    const candidates = this.getAllCandidates();
    const jsonl = candidates.map(c => JSON.stringify(c)).join('\n');
    // writeFileSync(path, jsonl + '\n');
    console.log(`Would export ${candidates.length} candidates to ${path}`);
    return candidates.length;
  }

  /**
   * Reset Generator
   */
  reset(): void {
    this.candidates.clear();
    this.candidateIdCounter = 0;
  }
}

interface DetectedTrigger {
  triggerId: string;
  timestamp: number;
  snapshotId: string;
  features: EventCandidateFeatures;
}

// Export singleton
export const candidateGenerator = new CandidateGenerator();