/**
 * Square-Root Impact Deviation (LFI)
 * 
 * Market impact typically follows √-impact law: price_impact ∝ √(order_size / ADV)
 * Deviation from this law = liquidity stress or manipulation.
 * 
 * LFI = |actual_impact - predicted_impact| / predicted_impact
 * where predicted_impact = k × √(size / ADV)
 */

export interface LiquidityParams {
  windowSize: number;        // Window for ADV calculation
  impactCoefficient: number; // k in impact formula
  binCount: number;          // Number of size bins for comparison
}

export interface LiquidityResult {
  deviation: number;         // LFI - absolute deviation from √-impact
  normalizedDeviation: number;
  isStressed: boolean;       // deviation > 1.5
  metadata: {
    avgImpact: number;
    predictedImpact: number;
    avgSize: number;
    avgAdv: number;
    numTrades: number;
  };
}

interface ImpactObservation {
  size: number;
  actualImpact: number;  // Price impact in bps
  predictedImpact: number;
}

export class LiquidityImpactMetric {
  private observations: ImpactObservation[] = [];
  private params: LiquidityParams;
  private recentVolumes: number[] = [];
  private adv: number = 0;

  constructor(params: Partial<LiquidityParams> = {}) {
    this.params = {
      windowSize: params.windowSize ?? 500,
      impactCoefficient: params.impactCoefficient ?? 1,
      binCount: params.binCount ?? 10,
    };
  }

  /**
   * Add a trade observation
   */
  addTrade(size: number, priceImpact: number, _timestamp: number, volume: number): void {
    // Update ADV (Average Daily Volume) estimate
    this.recentVolumes.push(volume);
    while (this.recentVolumes.length > this.params.windowSize) {
      this.recentVolumes.shift();
    }
    this.adv = this.recentVolumes.reduce((a, b) => a + b, 0) / this.recentVolumes.length;

    // Compute predicted impact using √-impact law
    let predictedImpact = 0;
    if (this.adv > 0 && size > 0) {
      predictedImpact = this.params.impactCoefficient * Math.sqrt(size / this.adv) * 10000; // in bps
    }

    this.observations.push({
      size,
      actualImpact: priceImpact,
      predictedImpact,
    });

    while (this.observations.length > this.params.windowSize) {
      this.observations.shift();
    }
  }

  /**
   * Compute liquidity impact deviation
   */
  compute(): LiquidityResult {
    if (this.observations.length < 50) {
      return this.emptyResult();
    }

    let totalActual = 0;
    let totalPredicted = 0;
    let totalSize = 0;
    let count = 0;

    const validObservations = this.observations.filter(o => o.predictedImpact > 0);
    
    for (const obs of validObservations) {
      totalActual += obs.actualImpact;
      totalPredicted += obs.predictedImpact;
      totalSize += obs.size;
      count++;
    }

    if (count === 0) {
      return this.emptyResult();
    }

    const avgActual = totalActual / count;
    const avgPredicted = totalPredicted / count;
    const avgSize = totalSize / count;

    // Deviation: |actual - predicted| / predicted
    const deviation = avgPredicted > 0 ? Math.abs(avgActual - avgPredicted) / avgPredicted : 0;

    // Normalized by historical standard deviation
    let variance = 0;
    for (const obs of validObservations) {
      const obsDeviation = obs.predictedImpact > 0 
        ? Math.abs(obs.actualImpact - obs.predictedImpact) / obs.predictedImpact
        : 0;
      variance += Math.pow(obsDeviation - deviation, 2);
    }
    variance /= count;
    const std = Math.sqrt(variance);

    const normalizedDeviation = std > 0 ? (deviation - 0) / std : 0;

    return {
      deviation,
      normalizedDeviation: Math.max(0, Math.min(10, normalizedDeviation)),
      isStressed: deviation > 1.5 || normalizedDeviation > 2,
      metadata: {
        avgImpact: avgActual,
        predictedImpact: avgPredicted,
        avgSize,
        avgAdv: this.adv,
        numTrades: count,
      },
    };
  }

  /**
   * Normalize LFI to z-score
   * Higher deviation = more liquidity stress = dangerous
   */
  normalize(historicalMean: number, historicalStd: number): number {
    const result = this.compute();
    return (result.deviation - historicalMean) / historicalStd;
  }

  private emptyResult(): LiquidityResult {
    return {
      deviation: 0,
      normalizedDeviation: 0,
      isStressed: false,
      metadata: {
        avgImpact: 0,
        predictedImpact: 0,
        avgSize: 0,
        avgAdv: 0,
        numTrades: 0,
      },
    };
  }

  reset(): void {
    this.observations = [];
    this.recentVolumes = [];
    this.adv = 0;
  }
}
