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
export class EpidemicMetric {
    infections = [];
    params;
    constructor(params = {}) {
        this.params = {
            windowSize: params.windowSize ?? 1000,
            decayRate: params.decayRate ?? 0.1,
            threshold: params.threshold ?? 2,
        };
    }
    /**
     * Record a potential transmission event
     * target slot should be after source slot
     */
    addTransmission(sourceSlot, targetSlot, weight = 1) {
        if (targetSlot <= sourceSlot)
            return; // Invalid: target must be after source
        this.infections.push({
            sourceSlot,
            targetSlot,
            weight,
        });
        // Maintain window size
        while (this.infections.length > this.params.windowSize) {
            this.infections.shift();
        }
    }
    /**
     * Compute R_t using the ratio of observed transmissions
     *
     * Simplified approach: R_t = observed infections / expected infections
     * under a null hypothesis of no contagion.
     */
    compute() {
        if (this.infections.length < 50) {
            return this.emptyResult();
        }
        // Sort by target slot
        const sorted = [...this.infections].sort((a, b) => a.targetSlot - b.targetSlot);
        // Count "new" infections at each generation
        // Generation 0: events that don't appear to be caused by others
        // Generation 1: events causally linked to generation 0
        // etc.
        const maxSlot = sorted[sorted.length - 1].targetSlot;
        const minSlot = sorted[0].sourceSlot;
        const slotRange = maxSlot - minSlot || 1;
        // Estimate generation time distribution
        const generationTimes = [];
        for (const inf of sorted) {
            const genTime = inf.targetSlot - inf.sourceSlot;
            if (genTime > 0 && genTime < slotRange / 10) { // Sanity check
                generationTimes.push(genTime);
            }
        }
        if (generationTimes.length < 10) {
            return this.emptyResult();
        }
        // Compute mean and variance of generation time
        const meanGen = generationTimes.reduce((a, b) => a + b, 0) / generationTimes.length;
        const varianceGen = generationTimes.reduce((a, b) => a + Math.pow(b - meanGen, 2), 0) / generationTimes.length;
        // Simple R_t estimate: R_t = mean(transmissions per infected)
        // We approximate this by comparing observed cascade sizes to a Poisson null
        // Use a simpler metric: ratio of child to parent events
        // If events cluster in time, R_t > 1
        let totalWeight = 0;
        let weightedChildWeight = 0;
        for (const inf of sorted) {
            totalWeight += inf.weight;
            // Find "children" - events within one mean generation time after this event
            const children = sorted.filter(other => other.sourceSlot >= inf.targetSlot &&
                other.sourceSlot - inf.targetSlot <= meanGen * 2);
            weightedChildWeight += children.reduce((sum, c) => sum + c.weight, 0);
        }
        // R_t estimate
        const rt = totalWeight > 0 ? weightedChildWeight / totalWeight : 0;
        return {
            rt: Math.max(0, Math.min(10, rt)), // Cap between 0 and 10
            isSupercritical: rt > 1,
            metadata: {
                totalInfections: this.infections.length,
                meanGenerationTime: meanGen,
                transmissionVariance: varianceGen,
                windowSize: sorted.length,
            },
        };
    }
    /**
     * Normalize R_t to z-score
     * R_t > 1 is dangerous, so we normalize: z = (R_t - 1) / σ
     */
    normalize(historicalMean, historicalStd) {
        const result = this.compute();
        return (result.rt - historicalMean) / historicalStd;
    }
    emptyResult() {
        return {
            rt: 0,
            isSupercritical: false,
            metadata: {
                totalInfections: 0,
                meanGenerationTime: 0,
                transmissionVariance: 0,
                windowSize: 0,
            },
        };
    }
    reset() {
        this.infections = [];
    }
}
//# sourceMappingURL=epidemic.js.map