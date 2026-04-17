/**
 * Superspreader Activation (SSI)
 *
 * Tracks activation of high-influence nodes (whales).
 * Superspreader activation precedes cascades.
 *
 * Superspreader threshold: nodes with degree > k × mean(degree)
 * where k is typically 3-5 in financial networks.
 */
export class SuperspreaderMetric {
    nodeActivity = new Map(); // node -> activity count
    nodeDegree = new Map(); // node -> degree
    activityHistory = [];
    params;
    constructor(params = {}) {
        this.params = {
            degreeThreshold: params.degreeThreshold ?? 4,
            activityWindow: params.activityWindow ?? 100, // ~100 slots
            baselineWindow: params.baselineWindow ?? 1000, // ~1000 slots for baseline
        };
    }
    /**
     * Record activity from a node
     */
    addActivity(nodeId, degree, activity = 1) {
        this.nodeActivity.set(nodeId, (this.nodeActivity.get(nodeId) || 0) + activity);
        this.nodeDegree.set(nodeId, degree);
        // Maintain activity history
        this.activityHistory.push(activity);
        while (this.activityHistory.length > this.params.activityWindow) {
            this.activityHistory.shift();
        }
    }
    /**
     * Compute superspreader activation index
     */
    compute() {
        if (this.nodeActivity.size < 10 || this.activityHistory.length < 20) {
            return this.emptyResult();
        }
        // Compute mean degree
        let totalDegree = 0;
        for (const deg of this.nodeDegree.values()) {
            totalDegree += deg;
        }
        const meanDegree = totalDegree / this.nodeDegree.size;
        // Superspreader threshold
        const threshold = meanDegree * this.params.degreeThreshold;
        // Identify superspreaders and their activity
        let superspreaderCount = 0;
        let activeSuperspreaderCount = 0;
        let superspreaderActivity = 0;
        let totalSuperspreaderActivity = 0;
        const baselineActivity = this.nodeActivity.size > 0
            ? [...this.nodeActivity.values()].reduce((a, b) => a + b, 0) / this.nodeActivity.size
            : 0;
        for (const [nodeId, activity] of this.nodeActivity) {
            const degree = this.nodeDegree.get(nodeId) || 0;
            if (degree >= threshold) {
                superspreaderCount++;
                superspreaderActivity += activity;
                totalSuperspreaderActivity += activity;
                if (activity > baselineActivity * 2) { // 2x baseline = activated
                    activeSuperspreaderCount++;
                }
            }
        }
        // Activation index: ratio of current superspreader activity to baseline
        const recentActivity = this.activityHistory.reduce((a, b) => a + b, 0) / this.activityHistory.length;
        let activationIndex = 0;
        if (superspreaderActivity > 0 && baselineActivity > 0) {
            activationIndex = superspreaderActivity / (superspreaderCount * baselineActivity);
        }
        return {
            activationIndex: Math.max(0, Math.min(10, activationIndex)),
            activeSuperspreaders: activeSuperspreaderCount,
            totalSuperspreaders: superspreaderCount,
            isActivated: activeSuperspreaderCount > 0 && activationIndex > 1.5,
            metadata: {
                threshold,
                meanDegree,
                recentActivity,
                baselineActivity,
            },
        };
    }
    /**
     * Normalize SSI to z-score
     * Higher SSI = more whale activity = potentially dangerous
     */
    normalize(historicalMean, historicalStd) {
        const result = this.compute();
        return (result.activationIndex - historicalMean) / historicalStd;
    }
    emptyResult() {
        return {
            activationIndex: 0,
            activeSuperspreaders: 0,
            totalSuperspreaders: 0,
            isActivated: false,
            metadata: {
                threshold: 0,
                meanDegree: 0,
                recentActivity: 0,
                baselineActivity: 0,
            },
        };
    }
    reset() {
        this.nodeActivity.clear();
        this.nodeDegree.clear();
        this.activityHistory = [];
    }
}
//# sourceMappingURL=superspreader.js.map