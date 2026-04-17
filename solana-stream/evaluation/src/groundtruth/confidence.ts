/**
 * KAS PA v4.3 - Confidence and Quality Model
 *
 * Definiert wie Label-Confidence berechnet wird.
 * Confidence ist NICHT willkürlich - sie wird aus nachvollziehbaren Faktoren abgeleitet.
 */

import { EventCandidate, PreliminaryLabel, HumanReview, FinalGroundTruthLabel } from './schema.js';

// ============================================================================
// CONFIDENCE FACTORS
// ============================================================================

export interface ConfidenceFactors {
  dataCompleteness: number;        // 0-1
  signalConsistency: number;      // 0-1
  evidenceSourceCount: number;     // 0-1
  reviewerCertainty: number;       // 0-1
  contradictionLevel: number;      // 0-1 (lower = more consistent)
}

export interface ConfidenceBand {
  level: 'HIGH' | 'MEDIUM' | 'LOW';
  numericValue: number;           // 0-1
  factors: ConfidenceFactors;
  reasoning: string;
}

// ============================================================================
// CONFIDENCE CALCULATOR
// ============================================================================

export class ConfidenceCalculator {
  /**
   * Berechne Confidence für ein finales Label
   */
  calculateFinalLabelConfidence(
    candidate: EventCandidate,
    autoLabel: PreliminaryLabel,
    review?: HumanReview
  ): ConfidenceBand {
    const factors = this.extractFactors(candidate, autoLabel, review);

    // Gewichtete Kombination
    const weightedScore =
      factors.dataCompleteness * 0.25 +
      factors.signalConsistency * 0.25 +
      factors.evidenceSourceCount * 0.15 +
      factors.reviewerCertainty * 0.20 +
      (1 - factors.contradictionLevel) * 0.15; // Invert contradiction (low = good)

    // Map zu Band
    let level: 'HIGH' | 'MEDIUM' | 'LOW';
    let reasoning: string;

    if (weightedScore >= 0.80) {
      level = 'HIGH';
      reasoning = 'Strong evidence from multiple consistent sources, complete data';
    } else if (weightedScore >= 0.60) {
      level = 'MEDIUM';
      reasoning = 'Moderate evidence, some data gaps or minor contradictions';
    } else {
      level = 'LOW';
      reasoning = 'Weak evidence, significant data gaps or high contradictions';
    }

    return {
      level,
      numericValue: weightedScore,
      factors,
      reasoning,
    };
  }

  /**
   * Berechne Data Completeness Score
   */
  calculateDataCompletenessScore(
    candidate: EventCandidate,
    autoLabel: PreliminaryLabel
  ): number {
    const criticalFields = [
      'priceChange24h',
      'priceChange4h',
      'priceChange1h',
      'volumeChange1h',
      'liquidityChange',
      'botActivityScore',
    ];

    const optionalFields = [
      'buySellImbalance',
      'smartMoneyActivity',
      'whaleConcentration',
      'transactionBurstScore',
    ];

    let criticalPresent = 0;
    let optionalPresent = 0;

    for (const field of criticalFields) {
      if (candidate[field as keyof EventCandidate] !== undefined) {
        criticalPresent++;
      }
    }

    for (const field of optionalFields) {
      if (candidate[field as keyof EventCandidate] !== undefined) {
        optionalPresent++;
      }
    }

    const criticalScore = criticalPresent / criticalFields.length;
    const optionalScore = optionalPresent / optionalFields.length;

    // Kritische Felder haben höheres Gewicht
    return criticalScore * 0.7 + optionalScore * 0.3;
  }

  /**
   * Berechne Signal Consistency Score
   */
  calculateSignalConsistencyScore(
    candidate: EventCandidate,
    autoLabel: PreliminaryLabel
  ): number {
    // Prüfe ob Metriken konsistent sind
    // z.B. wenn priceChange4h und priceChange24h beide negativ sind = konsistent
    // wenn priceChange4h negativ aber priceChange24h positiv = inkonsistent

    const priceMetrics = [
      candidate.priceChange5m,
      candidate.priceChange15m,
      candidate.priceChange1h,
      candidate.priceChange4h,
      candidate.priceChange24h,
    ].filter(v => v !== undefined);

    if (priceMetrics.length < 2) return 0.5; // Can't determine

    // Zähle negative vs positive
    const negatives = priceMetrics.filter(v => v < 0).length;
    const ratio = negatives / priceMetrics.length;

    // Konsistent wenn >= 80% in gleiche Richtung
    if (ratio >= 0.8 || ratio <= 0.2) return 0.9;

    // Moderat konsistent
    if (ratio >= 0.6 || ratio <= 0.4) return 0.7;

    // Inkonsistent
    return 0.4;
  }

  /**
   * Berechne Evidence Source Count Score
   */
  calculateEvidenceSourceCountScore(autoLabel: PreliminaryLabel): number {
    // Mehr unterstützende Evidenz = höherer Score
    const count = autoLabel.supportingEvidence.length;

    if (count >= 5) return 1.0;
    if (count >= 3) return 0.8;
    if (count >= 2) return 0.6;
    if (count >= 1) return 0.4;
    return 0.2;
  }

  /**
   * Berechne Reviewer Certainty Score
   */
  calculateReviewerCertaintyScore(review?: HumanReview): number {
    if (!review) return 0.5; // No review = medium confidence

    // Reviewer Confidence directly
    return review.reviewerConfidence;
  }

  /**
   * Berechne Contradiction Level
   */
  calculateContradictionLevel(
    candidate: EventCandidate,
    autoLabel: PreliminaryLabel
  ): number {
    let contradictions = 0;

    // Check for contradictions between metrics and label
    if (autoLabel.labelClass === 'MASSIVE_DUMP') {
      // MASSIVE_DUMP aber positive oder neutrale Metriken = contradiction
      if (candidate.priceChange24h && candidate.priceChange24h > -0.15) contradictions++;
      if (candidate.botActivityScore && candidate.botActivityScore < 0.30) contradictions++;
    }

    if (autoLabel.labelClass === 'NORMAL_VOLATILITY') {
      // NORMAL aber sehr negative Metriken = contradiction
      if (candidate.priceChange24h && candidate.priceChange24h < -0.25) contradictions++;
      if (candidate.volumeSpikeMultiplier && candidate.volumeSpikeMultiplier > 4) contradictions++;
    }

    // Add contradictions from auto-label
    contradictions += autoLabel.expectedFalsePositives.length * 0.2;

    // Normalize to 0-1 (higher = more contradictions)
    return Math.min(contradictions / 3, 1.0);
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private extractFactors(
    candidate: EventCandidate,
    autoLabel: PreliminaryLabel,
    review?: HumanReview
  ): ConfidenceFactors {
    return {
      dataCompleteness: this.calculateDataCompletenessScore(candidate, autoLabel),
      signalConsistency: this.calculateSignalConsistencyScore(candidate, autoLabel),
      evidenceSourceCount: this.calculateEvidenceSourceCountScore(autoLabel),
      reviewerCertainty: this.calculateReviewerCertaintyScore(review),
      contradictionLevel: this.calculateContradictionLevel(candidate, autoLabel),
    };
  }
}

// ============================================================================
// DATA COMPLETENESS SCORER
// ============================================================================

export interface DataCompletenessResult {
  status: 'complete' | 'partial' | 'insufficient';
  score: number;
  missingCritical: string[];
  missingOptional: string[];
  coverageByCategory: {
    price: number;
    volume: number;
    liquidity: number;
    bot: number;
    whale: number;
  };
}

/**
 * Berechne detaillierte Data Completeness
 */
export function calculateDataCompleteness(
  candidate: EventCandidate
): DataCompletenessResult {
  const criticalFields = {
    price: ['priceChange24h', 'priceChange4h', 'priceChange1h'],
    volume: ['volumeChange1h', 'volumeSpikeMultiplier'],
    liquidity: ['liquidityChange'],
    bot: ['botActivityScore'],
    whale: ['whaleConcentration', 'whaleVolumeSol'],
  };

  const optionalFields = {
    price: ['priceChange5m', 'priceChange15m', 'maxDrawdownDuringEvent'],
    volume: ['volumeChange5m'],
    liquidity: [],
    bot: ['smartMoneyActivity'],
    whale: ['transactionBurstScore', 'clusterScore'],
  };

  const missingCritical: string[] = [];
  const missingOptional: string[] = [];

  const coverageByCategory: DataCompletenessResult['coverageByCategory'] = {
    price: 0,
    volume: 0,
    liquidity: 0,
    bot: 0,
    whale: 0,
  };

  // Check critical fields
  for (const [category, fields] of Object.entries(criticalFields)) {
    let present = 0;
    for (const field of fields) {
      if (candidate[field as keyof EventCandidate] !== undefined) {
        present++;
      } else {
        missingCritical.push(field);
      }
    }
    coverageByCategory[category as keyof typeof coverageByCategory] = present / fields.length;
  }

  // Check optional fields
  for (const [category, fields] of Object.entries(optionalFields)) {
    let present = 0;
    for (const field of fields) {
      if (candidate[field as keyof EventCandidate] !== undefined) {
        present++;
      } else {
        missingOptional.push(field);
      }
    }
    const cat = category as keyof typeof coverageByCategory;
    coverageByCategory[cat] = (coverageByCategory[cat] + present / Math.max(fields.length, 1)) / 2;
  }

  // Determine status
  let status: 'complete' | 'partial' | 'insufficient';
  const avgCoverage = Object.values(coverageByCategory).reduce((a, b) => a + b, 0) /
    Object.keys(coverageByCategory).length;

  if (missingCritical.length >= 3) {
    status = 'insufficient';
  } else if (missingCritical.length >= 1 || avgCoverage < 0.7) {
    status = 'partial';
  } else {
    status = 'complete';
  }

  return {
    status,
    score: avgCoverage,
    missingCritical,
    missingOptional,
    coverageByCategory,
  };
}

// Export singleton
export const confidenceCalculator = new ConfidenceCalculator();