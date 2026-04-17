/**
 * Permutation Entropy (PE)
 *
 * Measures the complexity/ randomness of price returns.
 * Dropping entropy = increased determinism before crashes.
 *
 * Uses Bandt-Pompe permutation entropy approach.
 * For order d=4 (24 permutations), window size typically 100-1000.
 */
export interface PermutationEntropyParams {
    order: number;
    delay: number;
    windowSize: number;
}
export interface PermutationEntropyResult {
    entropy: number;
    normalizedEntropy: number;
    metadata: {
        permutations: number;
        windowSize: number;
        missingPatterns: number;
    };
}
export declare class PermutationEntropyMetric {
    private prices;
    private params;
    constructor(params?: Partial<PermutationEntropyParams>);
    /**
     * Add a new price tick
     */
    addPrice(price: number, _slot?: number): void;
    /**
     * Compute permutation entropy using Bandt-Pole method
     *
     * Algorithm:
     * 1. Build delay vectors of length `order`
     * 2. Sort each vector and record permutation pattern
     * 3. Count pattern frequencies
     * 4. Compute Shannon entropy of pattern distribution
     * 5. Normalize by max entropy (uniform distribution)
     */
    compute(): PermutationEntropyResult;
    /**
     * Get z-score normalized value
     */
    normalize(historicalMean: number, historicalStd: number): number;
    private factorial;
    private emptyResult;
    reset(): void;
}
//# sourceMappingURL=entropy.d.ts.map