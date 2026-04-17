/**
 * Hawkes Branching Ratio (n)
 *
 * Measures self-excitation in the transaction stream.
 * n → 1 precedes flash crashes (Filimonov & Sornette 2012).
 *
 * Formula: n = μ / (1 - ρ) where μ = base rate, ρ = autocorrelation
 * Or estimated via: n = sum(kernel) over all past events
 */
export class HawkesMetric {
    events = []; // timestamps in slot numbers
    slots = [];
    params;
    constructor(params = {}) {
        this.params = {
            decay: params.decay ?? 0.1,
            maxLag: params.maxLag ?? 1000,
            windowSize: params.windowSize ?? 5000,
        };
    }
    /**
     * Add a new event (transaction)
     */
    addEvent(slot, timestamp) {
        this.events.push(timestamp);
        this.slots.push(slot);
        // Maintain window size
        while (this.events.length > this.params.windowSize) {
            this.events.shift();
            this.slots.shift();
        }
    }
    /**
     * Compute the Hawkes branching ratio
     * Uses the method of moments estimator
     */
    compute() {
        if (this.events.length < 100) {
            return this.emptyResult();
        }
        // Compute inter-event times
        const interEventTimes = [];
        for (let i = 1; i < this.events.length; i++) {
            interEventTimes.push(this.events[i] - this.events[i - 1]);
        }
        const meanInterEventTime = interEventTimes.reduce((a, b) => a + b, 0) / interEventTimes.length;
        // Compute autocorrelation at lag 1
        const n = interEventTimes.length;
        const mean = meanInterEventTime;
        let covariance = 0;
        let variance = 0;
        for (let i = 0; i < n - 1; i++) {
            covariance += (interEventTimes[i] - mean) * (interEventTimes[i + 1] - mean);
        }
        covariance /= (n - 1);
        for (let i = 0; i < n; i++) {
            variance += Math.pow(interEventTimes[i] - mean, 2);
        }
        variance /= n;
        const autocorrelation = variance > 0 ? covariance / variance : 0;
        // Branching ratio via method of moments
        // n = (1) / (1 - ρ) for simple exponential kernel
        // But we use the more robust: n = sum of expected children / expected parents
        const branchingRatio = Math.max(0, Math.min(10, 1 / (1 - Math.max(-0.99, Math.min(0.99, autocorrelation)))));
        // Current intensity: λ(t) = μ + ∑ α * exp(-β * (t - t_i))
        let intensity = 1 / meanInterEventTime; // Base intensity
        const now = this.events[this.events.length - 1];
        for (const pastEvent of this.events) {
            const lag = now - pastEvent;
            if (lag > 0 && lag < this.params.maxLag) {
                intensity += this.params.decay * Math.exp(-this.params.decay * lag);
            }
        }
        return {
            branchingRatio,
            intensity,
            metadata: {
                totalEvents: this.events.length,
                meanInterEventTime,
                autocorrelation,
            },
        };
    }
    /**
     * Normalize to z-score using rolling 30-day statistics
     */
    normalize(historicalMean, historicalStd) {
        const result = this.compute();
        return (result.branchingRatio - historicalMean) / historicalStd;
    }
    emptyResult() {
        return {
            branchingRatio: 0,
            intensity: 0,
            metadata: {
                totalEvents: 0,
                meanInterEventTime: 0,
                autocorrelation: 0,
            },
        };
    }
    /**
     * Reset the metric state
     */
    reset() {
        this.events = [];
        this.slots = [];
    }
}
//# sourceMappingURL=hawkes.js.map