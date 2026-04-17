/**
 * Superspreader Activation (SSI)
 *
 * Tracks activation of high-influence nodes (whales).
 * Superspreader activation precedes cascades.
 *
 * Superspreader threshold: nodes with degree > k × mean(degree)
 * where k is typically 3-5 in financial networks.
 */
export interface SuperspreaderParams {
    degreeThreshold: number;
    activityWindow: number;
    baselineWindow: number;
}
export interface SuperspreaderResult {
    activationIndex: number;
    activeSuperspreaders: number;
    totalSuperspreaders: number;
    isActivated: boolean;
    metadata: {
        threshold: number;
        meanDegree: number;
        recentActivity: number;
        baselineActivity: number;
    };
}
export declare class SuperspreaderMetric {
    private nodeActivity;
    private nodeDegree;
    private activityHistory;
    private params;
    constructor(params?: Partial<SuperspreaderParams>);
    /**
     * Record activity from a node
     */
    addActivity(nodeId: string, degree: number, activity?: number): void;
    /**
     * Compute superspreader activation index
     */
    compute(): SuperspreaderResult;
    /**
     * Normalize SSI to z-score
     * Higher SSI = more whale activity = potentially dangerous
     */
    normalize(historicalMean: number, historicalStd: number): number;
    private emptyResult;
    reset(): void;
}
//# sourceMappingURL=superspreader.d.ts.map