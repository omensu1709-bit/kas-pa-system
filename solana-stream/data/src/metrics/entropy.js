/**
 * Permutation Entropy (PE)
 *
 * Measures the complexity/ randomness of price returns.
 * Dropping entropy = increased determinism before crashes.
 *
 * Uses Bandt-Pompe permutation entropy approach.
 * For order d=4 (24 permutations), window size typically 100-1000.
 */
export class PermutationEntropyMetric {
    prices = [];
    params;
    constructor(params = {}) {
        this.params = {
            order: params.order ?? 4, // 4! = 24 permutations
            delay: params.delay ?? 1,
            windowSize: params.windowSize ?? 500,
        };
    }
    /**
     * Add a new price tick
     */
    addPrice(price, _slot) {
        this.prices.push(price);
        while (this.prices.length > this.params.windowSize * this.params.delay + this.params.order) {
            this.prices.shift();
        }
    }
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
    compute() {
        const { order, delay } = this.params;
        const n = order;
        // Minimum data requirement
        const minLength = n * delay + 1;
        if (this.prices.length < minLength) {
            return this.emptyResult();
        }
        // Build delay vectors and count permutations
        const permutationCounts = new Map();
        let totalVectors = 0;
        const maxIndex = this.prices.length - 1;
        for (let i = 0; i <= maxIndex - (n - 1) * delay; i++) {
            // Extract delay vector
            const vector = [];
            for (let j = 0; j < n; j++) {
                vector.push(this.prices[i + j * delay]);
            }
            // Encode permutation pattern
            // Create rank order (0=smallest, n-1=largest)
            const sorted = [...vector].sort((a, b) => a - b);
            const ranks = vector.map(v => sorted.indexOf(v));
            // Encode as number in base-n
            let pattern = 0;
            for (let j = 0; j < n; j++) {
                pattern = pattern * n + ranks[j];
            }
            permutationCounts.set(pattern, (permutationCounts.get(pattern) || 0) + 1);
            totalVectors++;
        }
        // Compute Shannon entropy
        let entropy = 0;
        const numPermutations = this.factorial(n);
        for (const count of permutationCounts.values()) {
            const p = count / totalVectors;
            if (p > 0) {
                entropy -= p * Math.log2(p);
            }
        }
        // Normalize by maximum entropy (uniform distribution)
        const maxEntropy = Math.log2(numPermutations);
        const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;
        return {
            entropy,
            normalizedEntropy: Math.max(0, Math.min(1, normalizedEntropy)),
            metadata: {
                permutations: numPermutations,
                windowSize: totalVectors,
                missingPatterns: numPermutations - permutationCounts.size,
            },
        };
    }
    /**
     * Get z-score normalized value
     */
    normalize(historicalMean, historicalStd) {
        const result = this.compute();
        // For PE, LOWER values are dangerous (more deterministic)
        // So we negate for z-score so that higher = more dangerous
        return -(result.normalizedEntropy - historicalMean) / historicalStd;
    }
    factorial(n) {
        if (n <= 1)
            return 1;
        if (n === 2)
            return 2;
        if (n === 3)
            return 6;
        if (n === 4)
            return 24;
        if (n === 5)
            return 120;
        if (n === 6)
            return 720;
        return 720; // 7! = 5040 but we cap at 6
    }
    emptyResult() {
        return {
            entropy: 0,
            normalizedEntropy: 0,
            metadata: {
                permutations: 0,
                windowSize: 0,
                missingPatterns: 0,
            },
        };
    }
    reset() {
        this.prices = [];
    }
}
//# sourceMappingURL=entropy.js.map