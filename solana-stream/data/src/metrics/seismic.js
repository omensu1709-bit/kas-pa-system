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
export class GutenbergRichterMetric {
    magnitudes = [];
    params;
    constructor(params = {}) {
        this.params = {
            windowSize: params.windowSize ?? 1000,
            minMagnitude: params.minMagnitude ?? 0,
            bins: params.bins ?? 20,
        };
    }
    /**
     * Add a magnitude estimate (e.g., transaction size / mean size)
     */
    addMagnitude(magnitude) {
        if (magnitude < this.params.minMagnitude)
            return;
        this.magnitudes.push(magnitude);
        while (this.magnitudes.length > this.params.windowSize) {
            this.magnitudes.shift();
        }
    }
    /**
     * Compute Gutenberg-Richter b-value using maximum likelihood
     *
     * b = log₁₀(e) / (mean(M) - M_min)
     *    ≈ 0.4343 / (mean(M) - M_min)
     */
    compute() {
        if (this.magnitudes.length < 50) {
            return this.emptyResult();
        }
        const M = [...this.magnitudes].sort((a, b) => a - b);
        const n = M.length;
        const mMin = M[0];
        const mMax = M[n - 1];
        const meanM = M.reduce((a, b) => a + b, 0) / n;
        // Maximum likelihood estimator for b
        // b = 1 / (mean(M - M_min) * ln(10))
        const meanDeviation = M.reduce((sum, m) => sum + (m - mMin), 0) / n;
        let b;
        if (meanDeviation > 0.001) {
            b = 1 / (meanDeviation * Math.LN10);
        }
        else {
            b = 10; // Extremely high b (all events same size)
        }
        // Cap b reasonable range
        b = Math.max(0.1, Math.min(10, b));
        // Activity rate a = log₁₀(N) + b·M_min
        const a = Math.log10(n) + b * mMin;
        return {
            bValue: b,
            isStressed: b < 1.0,
            metadata: {
                totalEvents: n,
                meanMagnitude: meanM,
                maxMagnitude: mMax,
                aValue: a,
            },
        };
    }
    /**
     * Normalize b-value to z-score
     * b < 1 is dangerous, so we normalize: z = (1 - b) / σ
     */
    normalize(_historicalMean, historicalStd) {
        const result = this.compute();
        return (1 - result.bValue) / historicalStd;
    }
    emptyResult() {
        return {
            bValue: 0,
            isStressed: false,
            metadata: {
                totalEvents: 0,
                meanMagnitude: 0,
                maxMagnitude: 0,
                aValue: 0,
            },
        };
    }
    reset() {
        this.magnitudes = [];
    }
}
//# sourceMappingURL=seismic.js.map