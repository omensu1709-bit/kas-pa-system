/**
 * Gutenberg-Richter b-value
 *
 * From seismology: log₁₀(N) = a - b·M
 * where N = number of events ≥ magnitude M
 *
 * In our context: magnitude = transaction size / mean transaction size
 * Declining b = stress buildup (fewer small events, more large ones)
 *
 * b < 1.0 indicates regime with potentially destructive large events
 */
export interface SeismicParams {
    windowSize: number;
    minMagnitude: number;
    bins: number;
}
export interface SeismicResult {
    bValue: number;
    isStressed: boolean;
    metadata: {
        totalEvents: number;
        meanMagnitude: number;
        maxMagnitude: number;
        aValue: number;
    };
}
export declare class GutenbergRichterMetric {
    private magnitudes;
    private params;
    constructor(params?: Partial<SeismicParams>);
    /**
     * Add a magnitude estimate (e.g., transaction size / mean size)
     */
    addMagnitude(magnitude: number): void;
    /**
     * Compute Gutenberg-Richter b-value using maximum likelihood
     *
     * b = log₁₀(e) / (mean(M) - M_min)
     *    ≈ 0.4343 / (mean(M) - M_min)
     */
    compute(): SeismicResult;
    /**
     * Normalize b-value to z-score
     * b < 1 is dangerous, so we normalize: z = (1 - b) / σ
     */
    normalize(_historicalMean: number, historicalStd: number): number;
    private emptyResult;
    reset(): void;
}
//# sourceMappingURL=seismic.d.ts.map