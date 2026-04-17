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
    windowSize: number;
    impactCoefficient: number;
    binCount: number;
}
export interface LiquidityResult {
    deviation: number;
    normalizedDeviation: number;
    isStressed: boolean;
    metadata: {
        avgImpact: number;
        predictedImpact: number;
        avgSize: number;
        avgAdv: number;
        numTrades: number;
    };
}
export declare class LiquidityImpactMetric {
    private observations;
    private params;
    private recentVolumes;
    private adv;
    constructor(params?: Partial<LiquidityParams>);
    /**
     * Add a trade observation
     */
    addTrade(size: number, priceImpact: number, _timestamp: number, volume: number): void;
    /**
     * Compute liquidity impact deviation
     */
    compute(): LiquidityResult;
    /**
     * Normalize LFI to z-score
     * Higher deviation = more liquidity stress = dangerous
     */
    normalize(historicalMean: number, historicalStd: number): number;
    private emptyResult;
    reset(): void;
}
//# sourceMappingURL=liquidity.d.ts.map