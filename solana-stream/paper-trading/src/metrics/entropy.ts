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
  order: number;           // Permutation order (3-7 typically)
  delay: number;           // Time delay τ
  windowSize: number;      // Rolling window size
}

export interface PermutationEntropyResult {
  entropy: number;         // Normalized entropy 0-1
  normalizedEntropy: number;
  metadata: {
    permutations: number;  // Number of possible permutations (d!)
    windowSize: number;
    missingPatterns: number;
  };
}

export class PermutationEntropyMetric {
  private prices: number[] = [];
  private params: PermutationEntropyParams;

  constructor(params: Partial<PermutationEntropyParams> = {}) {
    this.params = {
      order: params.order ?? 4,    // 4! = 24 permutations
      delay: params.delay ?? 1,
      windowSize: params.windowSize ?? 500,
    };
  }

  /**
   * Add a new price tick
   */
  addPrice(price: number, _slot?: number): void {
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
  compute(): PermutationEntropyResult {
    const { order, delay } = this.params;
    const n = order;
    
    // Minimum data requirement
    const minLength = n * delay + 1;
    if (this.prices.length < minLength) {
      return this.emptyResult();
    }

    // Build delay vectors and count permutations
    // CRITICAL: Only use backward-looking vectors to avoid lookahead leakage
    // At time t, we can only use prices up to index t-1 (strictly past), not future prices
    const permutationCounts: Map<number, number> = new Map();
    let totalVectors = 0;
    // Last valid start index: i + (n-1)*delay <= (N-1)-1 = N-2
    // => i <= N - (n-1)*delay - 2
    const maxStartIndex = this.prices.length - (n - 1) * delay - 2;

    for (let i = 0; i <= maxStartIndex; i++) {
      // Extract delay vector - only uses prices up to current index
      // Vector contains: prices[i], prices[i+delay], ..., prices[i+(n-1)*delay]
      // Last element is at index i+(n-2)*delay <= maxStartIndex+(n-2)*delay < maxIndex
      // This ensures all data is at or before "current" time
      const vector: number[] = [];
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
  normalize(historicalMean: number, historicalStd: number): number {
    const result = this.compute();
    // For PE, LOWER values are dangerous (more deterministic)
    // So we negate for z-score so that higher = more dangerous
    return -(result.normalizedEntropy - historicalMean) / historicalStd;
  }

  private factorial(n: number): number {
    if (n <= 1) return 1;
    if (n === 2) return 2;
    if (n === 3) return 6;
    if (n === 4) return 24;
    if (n === 5) return 120;
    if (n === 6) return 720;
    return 720; // 7! = 5040 but we cap at 6
  }

  private emptyResult(): PermutationEntropyResult {
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

  reset(): void {
    this.prices = [];
  }
}
