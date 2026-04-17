/**
 * KAS PA v4.3 - Review Workflow
 *
 * Manueller Review-Workflow für Ground-Truth-Label-Erstellung.
 * Jedes finale Label erfordert menschliche Bestätigung.
 */

import {
  EventCandidate,
  PreliminaryLabel,
  HumanReview,
  FinalGroundTruthLabel,
  AmbiguityFlag,
  ReviewHistoryEntry,
  LabelClass,
} from './schema.js';

// ============================================================================
// REVIEW WORKFLOW
// ============================================================================

export interface ReviewRequest {
  candidateId: string;
  autoLabel: PreliminaryLabel;
  candidate: EventCandidate;
  reviewInstructions: string;
}

export interface ReviewDecision {
  finalLabel: LabelClass;
  confidence: number;
  notes: string;
  evidenceSummary: string;
  ambiguityFlags: AmbiguityFlag[];
  overrideAutoLabel: boolean;
  needsSecondaryReview: boolean;
  secondaryReviewReason?: string;
}

// ============================================================================
// SECONDARY REVIEW RULES
// ============================================================================

export const SECONDARY_REVIEW_RULES = {
  minConfidenceThreshold: 0.70,
  requiredForLabels: ['MASSIVE_DUMP', 'WHALE_SELL_NO_CASCADE', 'BOT_ACTIVITY_NO_PRICE_IMPACT'],
  ambiguitySeverities: ['high'] as const,
  dataGapThresholds: {
    maxAllowedGaps: 3,
    criticalFields: ['priceChange24h', 'priceChange4h', 'botActivityScore'],
  },
};

/**
 * Prüfe ob Secondary Review erforderlich ist
 */
export function requiresSecondaryReview(
  decision: ReviewDecision,
  autoLabel: PreliminaryLabel,
  candidate: EventCandidate
): { required: boolean; reason: string } {
  // Confidence zu niedrig
  if (decision.confidence < SECONDARY_REVIEW_RULES.minConfidenceThreshold) {
    return {
      required: true,
      reason: `Confidence ${decision.confidence} < ${SECONDARY_REVIEW_RULES.minConfidenceThreshold}`,
    };
  }

  // Label ist kritisch
  if (SECONDARY_REVIEW_RULES.requiredForLabels.includes(decision.finalLabel)) {
    return {
      required: true,
      reason: `Label ${decision.finalLabel} requires secondary review`,
    };
  }

  // Hohe Ambiguität
  const highSeverityFlags = decision.ambiguityFlags.filter(f => f.severity === 'high');
  if (highSeverityFlags.length > 0) {
    return {
      required: true,
      reason: `High severity ambiguity flags: ${highSeverityFlags.map(f => f.type).join(', ')}`,
    };
  }

  // Zu viele Datenlücken
  if (autoLabel.dataGaps.length > SECONDARY_REVIEW_RULES.dataGapThresholds.maxAllowedGaps) {
    return {
      required: true,
      reason: `${autoLabel.dataGaps.length} data gaps exceed threshold`,
    };
  }

  // Kritische Daten fehlen
  const criticalMissing = SECONDARY_REVIEW_RULES.dataGapThresholds.criticalFields.filter(
    field => !hasField(candidate, field)
  );
  if (criticalMissing.length > 0) {
    return {
      required: true,
      reason: `Critical fields missing: ${criticalMissing.join(', ')}`,
    };
  }

  // Auto-Label wurde überschrieben
  if (decision.overrideAutoLabel && decision.finalLabel !== autoLabel.labelClass) {
    return {
      required: true,
      reason: `Auto-label ${autoLabel.labelClass} overridden to ${decision.finalLabel}`,
    };
  }

  return { required: false, reason: '' };
}

function hasField(obj: Record<string, unknown>, field: string): boolean {
  return obj[field] !== undefined && obj[field] !== null;
}

// ============================================================================
// REVIEW WORKFLOW EXECUTOR
// ============================================================================

export class ReviewWorkflow {
  private reviews: Map<string, HumanReview> = new Map();
  private finalLabels: Map<string, FinalGroundTruthLabel> = new Map();
  private reviewIdCounter: number = 0;

  /**
   * Erzeuge Review Request für einen Candidate
   */
  createReviewRequest(
    candidate: EventCandidate,
    autoLabel: PreliminaryLabel
  ): ReviewRequest {
    return {
      candidateId: candidate.candidateId,
      autoLabel,
      candidate,
      reviewInstructions: this.generateReviewInstructions(candidate, autoLabel),
    };
  }

  /**
   * Führe Review durch und erstelle finales Label
   */
  submitReview(
    request: ReviewRequest,
    decision: ReviewDecision
  ): { review: HumanReview; finalLabel: FinalGroundTruthLabel } {
    const reviewId = `review_${Date.now()}_${++this.reviewIdCounter}`;

    // Prüfe ob Secondary Review nötig
    const secondaryRequired = requiresSecondaryReview(
      decision,
      request.autoLabel,
      request.candidate
    );

    // Erstelle Review
    const review: HumanReview = {
      candidateId: request.candidateId,
      reviewId,
      finalLabelClass: decision.finalLabel,
      reviewerConfidence: decision.confidence,
      reviewNotes: decision.notes,
      evidenceSummary: decision.evidenceSummary,
      ambiguityFlags: decision.ambiguityFlags,
      disagreementWithAutoLabel: decision.overrideAutoLabel,
      disagreementReason: decision.overrideAutoLabel
        ? `Auto-label ${request.autoLabel.labelClass} -> Manual ${decision.finalLabel}`
        : undefined,
      status: secondaryRequired.required ? 'secondary_review' : 'primary_review',
      needsSecondaryReview: secondaryRequired.required,
      secondaryReviewReason: secondaryRequired.required ? secondaryRequired.reason : undefined,
      primaryReviewerId: 'analyst', // Would come from auth in real system
      reviewTimestamp: Date.now(),
      autoLabelOverridden: decision.overrideAutoLabel,
      originalAutoLabel: decision.overrideAutoLabel ? request.autoLabel.labelClass : undefined,
    };

    this.reviews.set(reviewId, review);

    // Erstelle finales Label
    const finalLabel = this.createFinalLabel(request.candidate, request.autoLabel, review);
    this.finalLabels.set(request.candidateId, finalLabel);

    return { review, finalLabel };
  }

  /**
   * Führe Secondary Review durch
   */
  submitSecondaryReview(
    primaryReviewId: string,
    secondaryDecision: ReviewDecision,
    secondaryReviewerId: string
  ): FinalGroundTruthLabel | null {
    const primaryReview = this.reviews.get(primaryReviewId);
    if (!primaryReview) return null;

    // Update primary review
    primaryReview.secondaryReviewerId = secondaryReviewerId;
    primaryReview.status = 'approved';

    // Update final label
    const candidateId = primaryReview.candidateId;
    const finalLabel = this.finalLabels.get(candidateId);
    if (!finalLabel) return null;

    // Überprüfe ob Secondary Review die Entscheidung ändert
    if (secondaryDecision.finalLabel !== primaryReview.finalLabelClass) {
      // Entscheidung wurde geändert
      primaryReview.finalLabelClass = secondaryDecision.finalLabel;
      primaryReview.reviewerConfidence = secondaryDecision.confidence;
      primaryReview.disagreementWithAutoLabel = true;
      primaryReview.disagreementReason = `Secondary review changed label to ${secondaryDecision.finalLabel}`;

      // Update final label
      finalLabel.labelClass = secondaryDecision.finalLabel;
      finalLabel.labelConfidence = this.mapConfidenceToBand(secondaryDecision.confidence);
    }

    finalLabel.reviewStatus = 'secondary_reviewed';
    finalLabel.reviewTimestamp = Date.now();
    finalLabel.reviewerId = secondaryReviewerId;

    // Füge zur Review History hinzu
    finalLabel.reviewHistory.push({
      timestamp: Date.now(),
      action: 'secondary_review',
      actor: secondaryReviewerId,
      details: `Secondary review ${secondaryDecision.finalLabel !== primaryReview.finalLabelClass ? 'changed' : 'confirmed'} decision`,
      previousValue: primaryReview.finalLabelClass,
      newValue: secondaryDecision.finalLabel,
    });

    return finalLabel;
  }

  /**
   * Hole Review für ID
   */
  getReview(reviewId: string): HumanReview | undefined {
    return this.reviews.get(reviewId);
  }

  /**
   * Hole finales Label für Candidate
   */
  getFinalLabel(candidateId: string): FinalGroundTruthLabel | undefined {
    return this.finalLabels.get(candidateId);
  }

  /**
   * Hole alle Reviews
   */
  getAllReviews(): HumanReview[] {
    return Array.from(this.reviews.values());
  }

  /**
   * Hole alle finalen Labels
   */
  getAllFinalLabels(): FinalGroundTruthLabel[] {
    return Array.from(this.finalLabels.values());
  }

  /**
   * Hole Reviews die Secondary Review benötigen
   */
  getPendingSecondaryReviews(): HumanReview[] {
    return this.getAllReviews().filter(r => r.status === 'secondary_review');
  }

  /**
   * Statistiken
   */
  getStats(): {
    totalReviews: number;
    byStatus: Record<string, number>;
    byLabelClass: Record<string, number>;
    secondaryReviewRequired: number;
    autoLabelOverrides: number;
    avgConfidence: number;
  } {
    const reviews = this.getAllReviews();
    const byStatus: Record<string, number> = {};
    const byLabelClass: Record<string, number> = {};
    let autoLabelOverrides = 0;
    let totalConfidence = 0;

    for (const review of reviews) {
      byStatus[review.status] = (byStatus[review.status] || 0) + 1;
      byLabelClass[review.finalLabelClass] = (byLabelClass[review.finalLabelClass] || 0) + 1;
      if (review.autoLabelOverridden) autoLabelOverrides++;
      totalConfidence += review.reviewerConfidence;
    }

    return {
      totalReviews: reviews.length,
      byStatus,
      byLabelClass,
      secondaryReviewRequired: byStatus['secondary_review'] || 0,
      autoLabelOverrides,
      avgConfidence: reviews.length > 0 ? totalConfidence / reviews.length : 0,
    };
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private generateReviewInstructions(candidate: EventCandidate, autoLabel: PreliminaryLabel): string {
    return `
## Review Instructions for Candidate ${candidate.candidateId}

### Auto-Label Summary
- Label: ${autoLabel.labelClass}
- Confidence: ${(autoLabel.labelConfidence * 100).toFixed(1)}%
- Rule: ${autoLabel.labelingRule}

### Key Metrics
${this.formatMetric('Price Change 24h', candidate.priceChange24h, '%')}
${this.formatMetric('Price Change 4h', candidate.priceChange4h, '%')}
${this.formatMetric('Price Change 1h', candidate.priceChange1h, '%')}
${this.formatMetric('Volume Change', candidate.volumeChange1h, 'x')}
${this.formatMetric('Bot Activity', candidate.botActivityScore, '')}
${this.formatMetric('Liquidity Change', candidate.liquidityChange, '%')}

### Known Weaknesses of Auto-Label
${autoLabel.knownWeaknesses.map(w => `- ${w}`).join('\n')}

### Data Gaps
${autoLabel.dataGaps.map(g => `- ${g}`).join('\n') || 'None'}

### Instructions
1. Review the evidence carefully
2. Consider if the auto-label is appropriate
3. Check for ambiguities and flag them
4. Override if necessary with clear justification
5. Set appropriate confidence level
    `.trim();
  }

  private formatMetric(name: string, value: number | undefined, unit: string): string {
    if (value === undefined) return `${name}: N/A`;
    return `${name}: ${value > 0 ? '+' : ''}${value.toFixed(2)}${unit}`;
  }

  private createFinalLabel(
    candidate: EventCandidate,
    autoLabel: PreliminaryLabel,
    review: HumanReview
  ): FinalGroundTruthLabel {
    const labelConfidence = this.mapConfidenceToBand(review.reviewerConfidence);

    return {
      eventId: `gt_${candidate.candidateId}`,
      candidateId: candidate.candidateId,
      tokenAddress: candidate.tokenAddress,
      tokenSymbol: candidate.tokenSymbol,
      pairAddress: candidate.pairAddress,
      chain: candidate.chain,
      marketType: candidate.marketType,
      startTime: candidate.candidateWindowStart,
      triggerTime: candidate.triggerTime,
      endTime: candidate.candidateWindowEnd,

      labelClass: review.finalLabelClass,
      labelVersion: '1.0.0',
      labelStatus: review.needsSecondaryReview ? 'reviewed' : 'approved',
      labelConfidence,

      reviewStatus: review.needsSecondaryReview ? 'primary_reviewed' : 'final',
      reviewerId: review.primaryReviewerId,
      reviewTimestamp: review.reviewTimestamp,

      dataCompleteness: this.estimateDataCompleteness(candidate, autoLabel),
      dataGaps: autoLabel.dataGaps,

      priceChange5m: candidate.priceChange5m,
      priceChange15m: candidate.priceChange15m,
      priceChange1h: candidate.priceChange1h,
      priceChange4h: candidate.priceChange4h,
      priceChange24h: candidate.priceChange24h,
      maxDrawdownDuringEvent: candidate.maxDrawdownDuringEvent,
      volumeChange5m: candidate.volumeChange5m,
      volumeChange1h: candidate.volumeChange1h,
      liquidityChange: candidate.liquidityChange,
      buySellImbalance: candidate.buySellImbalance,
      botActivityScore: candidate.botActivityScore,
      smartMoneyActivity: candidate.smartMoneyActivity,
      whaleConcentration: candidate.whaleConcentration,
      holderFragmentation: candidate.holderFragmentation,
      transactionBurstScore: candidate.transactionBurstScore,
      clusterScore: candidate.clusterScore,
      structuralBreakScore: candidate.structuralBreakScore,

      notes: review.reviewNotes,
      evidenceSummary: review.evidenceSummary,

      sourceSet: ['dexscreener', 'chainstack', 'helius'], // Placeholder
      rawEvidenceRefs: candidate.sourceObservationIds,
      featureSnapshotRefs: [candidate.candidateId],
      reviewHistory: [
        {
          timestamp: Date.now(),
          action: 'created',
          actor: 'system',
          details: 'Candidate created from detection',
        },
        {
          timestamp: autoLabel.labeledAt,
          action: 'auto_labeled',
          actor: 'system',
          details: `Auto-labeled as ${autoLabel.labelClass} with confidence ${autoLabel.labelConfidence}`,
        },
        {
          timestamp: review.reviewTimestamp,
          action: review.needsSecondaryReview ? 'primary_review' : 'approved',
          actor: review.primaryReviewerId,
          details: `Primary review: ${review.finalLabelClass}`,
          previousValue: autoLabel.labelClass,
          newValue: review.finalLabelClass,
        },
      ],

      ambiguityFlags: review.ambiguityFlags,

      isGroundTruth: !review.needsSecondaryReview, // Only final if no secondary needed
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: 'groundtruth-workflow',
      derivedFrom: [autoLabel.labelId, review.reviewId],
    };
  }

  private mapConfidenceToBand(confidence: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (confidence >= 0.85) return 'HIGH';
    if (confidence >= 0.65) return 'MEDIUM';
    return 'LOW';
  }

  private estimateDataCompleteness(
    candidate: EventCandidate,
    autoLabel: PreliminaryLabel
  ): 'complete' | 'partial' | 'insufficient' {
    const criticalFields = ['priceChange24h', 'priceChange4h', 'volumeChange1h'];
    let missing = 0;

    for (const field of criticalFields) {
      if (candidate[field as keyof EventCandidate] === undefined) {
        missing++;
      }
    }

    if (missing >= 2) return 'insufficient';
    if (missing >= 1 || autoLabel.dataGaps.length > 2) return 'partial';
    return 'complete';
  }

  /**
   * Reset Workflow
   */
  reset(): void {
    this.reviews.clear();
    this.finalLabels.clear();
    this.reviewIdCounter = 0;
  }
}

// Export singleton
export const reviewWorkflow = new ReviewWorkflow();