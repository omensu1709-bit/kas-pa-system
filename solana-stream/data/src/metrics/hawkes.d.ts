/**
 * Hawkes Branching Ratio (n)
 *
 * Measures self-excitation in the transaction stream.
 * n → 1 precedes flash crashes (Filimonov & Sornette 2012).
 *
 * Formula: n = μ / (1 - ρ) where μ = base rate, ρ = autocorrelation
 * Or estimated via: n = sum(kernel) over all past events
 */
export interface HawkesParams {
    decay: number;
    maxLag: number;
    windowSize: number;
}
export interface HawkesResult {
    branchingRatio: number;
    intensity: number;
    metadata: {
        totalEvents: number;
        meanInterEventTime: number;
        autocorrelation: number;
    };
}
export declare class HawkesMetric {
    private events;
    private slots;
    private params;
    constructor(params?: Partial<HawkesParams>);
    /**
     * Add a new event (transaction)
     */
    addEvent(slot: number, timestamp: number): void;
    /**
     * Compute the Hawkes branching ratio
     * Uses the method of moments estimator
     */
    compute(): HawkesResult;
    /**
     * Normalize to z-score using rolling 30-day statistics
     */
    normalize(historicalMean: number, historicalStd: number): number;
    private emptyResult;
    /**
     * Reset the metric state
     */
    reset(): void;
}
//# sourceMappingURL=hawkes.d.ts.map