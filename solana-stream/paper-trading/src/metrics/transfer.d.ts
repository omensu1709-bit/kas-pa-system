/**
 * Transfer Entropy Clustering (C_TE)
 *
 * Measures directional information flow between wallet clusters.
 * Rising TE clustering = herding behavior before crashes.
 *
 * Transfer Entropy: T(X→Y) = Σ p(y, x, x_p) log [p(y|x, x_p) / p(y|x_p)]
 * where x_p is the past state of X.
 */
export interface TransferEntropyParams {
    historyLength: number;
    clusterCount: number;
    windowSize: number;
}
export interface TransferEntropyResult {
    clustering: number;
    totalFlow: number;
    metadata: {
        clusters: number;
        avgClusterSize: number;
        dominantFlows: [string, string][];
    };
}
export declare class TransferEntropyMetric {
    private clusterStates;
    private flows;
    private params;
    constructor(params?: Partial<TransferEntropyParams>);
    /**
     * Record a transfer between two clusters
     */
    addTransfer(sourceCluster: number, targetCluster: number, value?: number): void;
    /**
     * Compute transfer entropy clustering
     *
     * High clustering = many flows concentrate on few clusters = herding
     */
    compute(): TransferEntropyResult;
    /**
     * Normalize clustering to z-score
     * Higher clustering = more herding = dangerous
     */
    normalize(historicalMean: number, historicalStd: number): number;
    private emptyResult;
    reset(): void;
}
//# sourceMappingURL=transfer.d.ts.map