/**
 * Epidemic R_t (Reproduction Number)
 *
 * Estimates the effective reproduction number of cascading failures.
 * R_t > 1 indicates supercritical contagion regime.
 *
 * Uses a simplified Wallinga-Lipsitch framework:
 * R_t = 1 / M(−r) where M is the moment generating function
 * of the serial interval distribution.
 */
export interface EpidemicParams {
    windowSize: number;
    decayRate: number;
    threshold: number;
}
export interface EpidemicResult {
    rt: number;
    isSupercritical: boolean;
    metadata: {
        totalInfections: number;
        meanGenerationTime: number;
        transmissionVariance: number;
        windowSize: number;
    };
}
export declare class EpidemicMetric {
    private infections;
    private params;
    constructor(params?: Partial<EpidemicParams>);
    /**
     * Record a potential transmission event
     * target slot should be after source slot
     */
    addTransmission(sourceSlot: number, targetSlot: number, weight?: number): void;
    /**
     * Compute R_t using the ratio of observed transmissions
     *
     * Simplified approach: R_t = observed infections / expected infections
     * under a null hypothesis of no contagion.
     */
    compute(): EpidemicResult;
    /**
     * Normalize R_t to z-score
     * R_t > 1 is dangerous, so we normalize: z = (R_t - 1) / σ
     */
    normalize(historicalMean: number, historicalStd: number): number;
    private emptyResult;
    reset(): void;
}
//# sourceMappingURL=epidemic.d.ts.map