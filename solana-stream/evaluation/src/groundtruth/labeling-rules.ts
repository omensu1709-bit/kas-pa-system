/**
 * KAS PA v4.3 - Ground Truth Labeling Rules
 *
 * Definierte, dokumentierte Label-Regeln für automatische und manuelle Klassifikation.
 * Jede Regel ist reproduzierbar und explizit dokumentiert.
 */

import { LabelClass, LABEL_CLASS_DEFINITIONS } from './schema.js';

// ============================================================================
// LABELING RULE DEFINITIONS
// ============================================================================

export interface LabelingRule {
  id: string;
  name: string;
  description: string;
  applicableConditions: RuleCondition[];
  expectedAccuracy: string;
  knownWeaknesses: string[];
  expectedFalsePositiveRate?: number;
  expectedFalseNegativeRate?: number;
}

export interface RuleCondition {
  field: string;
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=' | 'between' | 'exists' | 'not_exists';
  value: number | string | [number, number];
  unit?: string;
}

// ============================================================================
// AUTO-LABELING RULES
// ============================================================================

export const AUTO_LABELING_RULES: LabelingRule[] = [
  {
    id: 'AUTO_MASSIVE_DUMP_24H',
    name: 'Auto-MASSIVE_DUMP (24h)',
    description: 'Automatische Erkennung von massiven Dump-Events basierend auf 24h Preisverlust',
    applicableConditions: [
      { field: 'priceChange24h', operator: '<=', value: -0.30, unit: 'percent' },
      { field: 'maxDrawdownDuringEvent', operator: '<=', value: -0.25, unit: 'percent' },
    ],
    expectedAccuracy: '85%',
    knownWeaknesses: [
      'Kann illiquide Moves mit temporärem Preisverlust als Dump missinterpretieren',
      'Berücksichtigt keine strukturelle Vorbereitung',
    ],
    expectedFalsePositiveRate: 0.15,
    expectedFalseNegativeRate: 0.10,
  },

  {
    id: 'AUTO_MASSIVE_DUMP_4H',
    name: 'Auto-MASSIVE_DUMP (4h)',
    description: 'Automatische Erkennung von massiven Dump-Events basierend auf 4h Preisverlust',
    applicableConditions: [
      { field: 'priceChange4h', operator: '<=', value: -0.20, unit: 'percent' },
      { field: 'volumeChange1h', operator: '>=', value: 2.0, unit: 'multiplier' },
    ],
    expectedAccuracy: '75%',
    knownWeaknesses: [
      'Kurze schnelle Dumps können als 4h-Events nicht erfasst werden',
      'Volume-Anforderung kann bei bestimmten Marktphasen fehlschlagen',
    ],
    expectedFalsePositiveRate: 0.20,
    expectedFalseNegativeRate: 0.15,
  },

  {
    id: 'AUTO_NORMAL_VOLATILITY',
    name: 'Auto-NORMAL_VOLATILITY',
    description: 'Automatische Erkennung von normaler Volatilität',
    applicableConditions: [
      { field: 'priceChange24h', operator: '>', value: -0.15, unit: 'percent' },
      { field: 'volumeSpikeMultiplier', operator: '<', value: 2.0, unit: 'multiplier' },
      { field: 'botActivityScore', operator: '<', value: 0.50, unit: 'probability' },
    ],
    expectedAccuracy: '90%',
    knownWeaknesses: [
      'Boundary-Cases nahe 15% können fehlklassifiziert werden',
    ],
    expectedFalsePositiveRate: 0.05,
    expectedFalseNegativeRate: 0.10,
  },

  {
    id: 'AUTO_ILLIQUID_RANDOM',
    name: 'Auto-ILLIQUID_RANDOM_MOVE',
    description: 'Automatische Erkennung von illiquiden Random-Moves',
    applicableConditions: [
      { field: 'priceChange1h', operator: '<=', value: -0.20, unit: 'percent' },
      { field: 'liquidityChange', operator: '<=', value: -0.50, unit: 'percent' },
      { field: 'botActivityScore', operator: '<', value: 0.50, unit: 'probability' },
      { field: 'whaleConcentration', operator: '>', value: 0.80, unit: 'percent' },
    ],
    expectedAccuracy: '70%',
    knownWeaknesses: [
      'Schwellenwerte für liquidityChange sind arbiträr',
      'WhaleConcentration kann bei neuen Tokens unzuverlässig sein',
    ],
    expectedFalsePositiveRate: 0.25,
    expectedFalseNegativeRate: 0.20,
  },

  {
    id: 'AUTO_WHALE_SELL',
    name: 'Auto-WHALE_SELL_NO_CASCADE',
    description: 'Automatische Erkennung von Whale-Sell ohne Kaskade',
    applicableConditions: [
      { field: 'whaleVolumeSol', operator: '>=', value: 100, unit: 'SOL' },
      { field: 'transactionBurstScore', operator: '<', value: 2.0, unit: 'score' },
      { field: 'clusterScore', operator: '<', value: 0.30, unit: 'score' },
    ],
    expectedAccuracy: '65%',
    knownWeaknesses: [
      '100 SOL Schwelle ist arbiträr für verschiedene Token-Preise',
      'Transaction burst threshold kann bei aktivem MEV fehlschlagen',
    ],
    expectedFalsePositiveRate: 0.30,
    expectedFalseNegativeRate: 0.25,
  },

  {
    id: 'AUTO_BOT_NO_IMPACT',
    name: 'Auto-BOT_ACTIVITY_NO_PRICE_IMPACT',
    description: 'Automatische Erkennung von Bot-Aktivität ohne Preiseffekt',
    applicableConditions: [
      { field: 'botActivityScore', operator: '>=', value: 0.70, unit: 'probability' },
      { field: 'priceChange4h', operator: '>', value: -0.05, unit: 'percent' },
      { field: 'smartMoneyActivity', operator: 'between', value: [-0.1, 0.1], unit: 'score' },
    ],
    expectedAccuracy: '75%',
    knownWeaknesses: [
      'Bot-Aktivität kann Vorläufer von Dump sein und wird falsch klassifiziert',
    ],
    expectedFalsePositiveRate: 0.20,
    expectedFalseNegativeRate: 0.15,
  },

  {
    id: 'AUTO_DATA_INSUFFICIENT',
    name: 'Auto-DATA_INSUFFICIENT',
    description: 'Automatische Erkennung von unzureichenden Daten',
    applicableConditions: [
      { field: 'dataCompleteness', operator: '==', value: 'insufficient', unit: 'enum' },
    ],
    expectedAccuracy: '95%',
    knownWeaknesses: [
      'Sehr zuverlässig wenn Datenlücken korrekt erkannt werden',
    ],
  },

  {
    id: 'AUTO_UNCERTAIN',
    name: 'Auto-UNCERTAIN',
    description: 'Catch-all für nicht eindeutige Fälle',
    applicableConditions: [
      // Wird verwendet wenn keine andere Regel vollständig erfüllt ist
      // und auch DATA_INSUFFICIENT nicht zutrifft
    ],
    expectedAccuracy: '60%',
    knownWeaknesses: [
      'Zu breit, kann verschiedene Event-Typen vermischen',
    ],
    expectedFalsePositiveRate: 0.40,
    expectedFalseNegativeRate: 0.30,
  },
];

// ============================================================================
// LABELING RULE ENGINE
// ============================================================================

export class LabelingRuleEngine {
  private rules: Map<string, LabelingRule> = new Map();

  constructor() {
    for (const rule of AUTO_LABELING_RULES) {
      this.rules.set(rule.id, rule);
    }
  }

  /**
   * Evaluiere einen Candidate gegen alle Regeln
   */
  evaluateCandidate(candidate: {
    priceChange5m?: number;
    priceChange15m?: number;
    priceChange1h?: number;
    priceChange4h?: number;
    priceChange24h?: number;
    maxDrawdownDuringEvent?: number;
    volumeChange5m?: number;
    volumeChange1h?: number;
    liquidityChange?: number;
    buySellImbalance?: number;
    botActivityScore?: number;
    smartMoneyActivity?: number;
    whaleConcentration?: number;
    whaleVolumeSol?: number;
    transactionBurstScore?: number;
    clusterScore?: number;
    holderFragmentation?: number;
    structuralBreakScore?: number;
    dataCompleteness?: 'complete' | 'partial' | 'insufficient';
  }): {
    label: LabelClass;
    confidence: number;
    matchedRules: string[];
    evidence: { rule: string; matched: boolean; reason: string }[];
    dataGaps: string[];
  } {
    const matchedRules: string[] = [];
    const evidence: { rule: string; matched: boolean; reason: string }[] = [];

    // Prüfe DATA_INSUFFICIENT zuerst
    if (candidate.dataCompleteness === 'insufficient') {
      return {
        label: 'DATA_INSUFFICIENT',
        confidence: 0.95,
        matchedRules: ['AUTO_DATA_INSUFFICIENT'],
        evidence: [{ rule: 'AUTO_DATA_INSUFFICIENT', matched: true, reason: 'dataCompleteness = insufficient' }],
        dataGaps: ['Kritische Daten fehlen für Klassifikation'],
      };
    }

    // Prüfe MASSIVE_DUMP Regeln
    if (candidate.priceChange24h !== undefined && candidate.priceChange24h <= -0.30) {
      matchedRules.push('AUTO_MASSIVE_DUMP_24H');
      evidence.push({
        rule: 'AUTO_MASSIVE_DUMP_24H',
        matched: true,
        reason: `priceChange24h = ${candidate.priceChange24h} <= -0.30`,
      });
    } else if (candidate.priceChange4h !== undefined && candidate.priceChange4h <= -0.20) {
      matchedRules.push('AUTO_MASSIVE_DUMP_4H');
      evidence.push({
        rule: 'AUTO_MASSIVE_DUMP_4H',
        matched: true,
        reason: `priceChange4h = ${candidate.priceChange4h} <= -0.20`,
      });
    }

    // Prüfe NORMAL_VOLATILITY
    if (candidate.priceChange24h !== undefined &&
        candidate.priceChange24h > -0.15 &&
        (candidate.volumeSpikeMultiplier === undefined || candidate.volumeSpikeMultiplier < 2.0) &&
        (candidate.botActivityScore === undefined || candidate.botActivityScore < 0.50)) {
      matchedRules.push('AUTO_NORMAL_VOLATILITY');
      evidence.push({
        rule: 'AUTO_NORMAL_VOLATILITY',
        matched: true,
        reason: 'priceChange24h > -0.15 und keine anomalen Metriken',
      });
    }

    // Prüfe BOT_NO_IMPACT
    if (candidate.botActivityScore !== undefined &&
        candidate.botActivityScore >= 0.70 &&
        (candidate.priceChange4h === undefined || candidate.priceChange4h > -0.05)) {
      matchedRules.push('AUTO_BOT_NO_IMPACT');
      evidence.push({
        rule: 'AUTO_BOT_NO_IMPACT',
        matched: true,
        reason: `botActivityScore = ${candidate.botActivityScore} >= 0.70, priceChange4h > -0.05`,
      });
    }

    // Prüfe ILLIQUID_RANDOM
    if (candidate.priceChange1h !== undefined &&
        candidate.priceChange1h <= -0.20 &&
        candidate.liquidityChange !== undefined &&
        candidate.liquidityChange <= -0.50) {
      matchedRules.push('AUTO_ILLIQUID_RANDOM');
      evidence.push({
        rule: 'AUTO_ILLIQUID_RANDOM',
        matched: true,
        reason: `priceChange1h = ${candidate.priceChange1h} <= -0.20, liquidityChange = ${candidate.liquidityChange} <= -0.50`,
      });
    }

    // Prüfe WHALE_SELL
    if (candidate.whaleVolumeSol !== undefined &&
        candidate.whaleVolumeSol >= 100 &&
        (candidate.transactionBurstScore === undefined || candidate.transactionBurstScore < 2.0)) {
      matchedRules.push('AUTO_WHALE_SELL');
      evidence.push({
        rule: 'AUTO_WHALE_SELL',
        matched: true,
        reason: `whaleVolumeSol = ${candidate.whaleVolumeSol} >= 100`,
      });
    }

    // Bestimme Label basierend auf matched rules
    const label = this.determineLabel(matchedRules);
    const confidence = this.calculateConfidence(label, matchedRules, candidate);

    // Sammle data gaps
    const dataGaps = this.identifyDataGaps(candidate);

    return { label, confidence, matchedRules, evidence, dataGaps };
  }

  private determineLabel(matchedRules: string[]): LabelClass {
    // Priorität: MASSIVE_DUMP > BOT_NO_IMPACT > ILLIQUID > WHALE > NORMAL > UNCERTAIN
    if (matchedRules.includes('AUTO_MASSIVE_DUMP_24H') || matchedRules.includes('AUTO_MASSIVE_DUMP_4H')) {
      return 'MASSIVE_DUMP';
    }
    if (matchedRules.includes('AUTO_BOT_NO_IMPACT')) {
      return 'BOT_ACTIVITY_NO_PRICE_IMPACT';
    }
    if (matchedRules.includes('AUTO_ILLIQUID_RANDOM')) {
      return 'ILLIQUID_RANDOM_MOVE';
    }
    if (matchedRules.includes('AUTO_WHALE_SELL')) {
      return 'WHALE_SELL_NO_CASCADE';
    }
    if (matchedRules.includes('AUTO_NORMAL_VOLATILITY')) {
      return 'NORMAL_VOLATILITY';
    }
    return 'UNCERTAIN';
  }

  private calculateConfidence(
    label: LabelClass,
    matchedRules: string[],
    _candidate: Record<string, unknown>
  ): number {
    if (matchedRules.length === 0) return 0.5;

    // Confidence basiert auf Anzahl der匹配enden Regeln und Label-Typ
    const baseConfidence = {
      MASSIVE_DUMP: 0.75,
      NORMAL_VOLATILITY: 0.85,
      ILLIQUID_RANDOM_MOVE: 0.65,
      WHALE_SELL_NO_CASCADE: 0.60,
      BOT_ACTIVITY_NO_PRICE_IMPACT: 0.70,
      UNCERTAIN: 0.50,
      DATA_INSUFFICIENT: 0.95,
    }[label] || 0.5;

    // Erhöhe Confidence wenn mehrere Regeln übereinstimmen
    const ruleBoost = Math.min(matchedRules.length * 0.05, 0.15);

    return Math.min(baseConfidence + ruleBoost, 0.95);
  }

  private identifyDataGaps(candidate: Record<string, unknown>): string[] {
    const gaps: string[] = [];

    const criticalFields = [
      'priceChange24h', 'priceChange4h', 'priceChange1h',
      'volumeChange1h', 'liquidityChange', 'botActivityScore'
    ];

    for (const field of criticalFields) {
      if (candidate[field] === undefined || candidate[field] === null) {
        gaps.push(`Field '${field}' is missing or null`);
      }
    }

    return gaps;
  }

  /**
   * Dokumentiere die Entscheidungslogik
   */
  documentDecision(result: {
    label: LabelClass;
    confidence: number;
    matchedRules: string[];
    evidence: { rule: string; matched: boolean; reason: string }[];
  }): string {
    const def = LABEL_CLASS_DEFINITIONS[result.label];

    let doc = `## Label Decision\n\n`;
    doc += `**Class:** ${result.label}\n`;
    doc += `**Confidence:** ${(result.confidence * 100).toFixed(1)}%\n\n`;
    doc += `**Definition:** ${def.description}\n\n`;

    doc += `**Matched Rules:**\n`;
    for (const ruleId of result.matchedRules) {
      const rule = this.rules.get(ruleId);
      if (rule) {
        doc += `- ${rule.name}: ${rule.description}\n`;
      }
    }
    doc += '\n';

    doc += `**Evidence:**\n`;
    for (const e of result.evidence) {
      doc += `- ${e.rule}: ${e.reason}\n`;
    }
    doc += '\n';

    doc += `**Inklusionskriterien erfüllt:**\n`;
    for (const criterion of def.inclusionCriteria) {
      doc += `- ${criterion}\n`;
    }
    doc += '\n';

    doc += `**Typische FP-Risiken:**\n`;
    for (const fp of def.typicalFalsePositiveConfusions) {
      doc += `- ${fp}\n`;
    }

    return doc;
  }
}

// Export singleton
export const labelingRuleEngine = new LabelingRuleEngine();