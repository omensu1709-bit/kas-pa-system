/**
 * Molloy-Reed Ratio (κ) and Giant Component Fragmentation (S₂/S₁)
 *
 * Molloy-Reed ratio: κ = (2 * E) / N * (VARIANCE_degree / MEAN_degree)
 * κ < 2 indicates network cannot sustain a giant component
 *
 * Giant component fragmentation: S₂/S₁ = |C₂| / |C₁|
 * Rising ratio signals percolation phase transition
 */
export interface GraphNode {
    id: string;
    degree: number;
    timestamp: number;
}
export interface GraphMetricsResult {
    molloyReedRatio: number;
    giantComponentSize: number;
    secondComponentSize: number;
    fragmentationRatio: number;
    metadata: {
        totalNodes: number;
        totalEdges: number;
        meanDegree: number;
        degreeVariance: number;
        numComponents: number;
    };
}
export declare class GraphMetric {
    private nodes;
    private edges;
    private adjacency;
    private nodeList;
    private ttlMs;
    private maxNodes;
    constructor(ttlMs?: number, maxNodes?: number);
    /**
     * Add an edge between two nodes
     */
    addEdge(from: string, to: string, timestamp: number): void;
    private addNode;
    private evictOldNodes;
    private evictOldestNode;
    private removeNode;
    /**
     * Compute graph metrics
     */
    compute(): GraphMetricsResult;
    private findConnectedComponents;
    /**
     * Normalize κ (Molloy-Reed) to z-score
     * κ → 2 is dangerous, so we normalize: z = (2 - κ) / σ
     */
    normalizeKappa(_historicalMean: number, historicalStd: number): number;
    /**
     * Normalize fragmentation ratio to z-score
     */
    normalizeFragmentation(historicalMean: number, historicalStd: number): number;
    private emptyResult;
    reset(): void;
}
//# sourceMappingURL=graph.d.ts.map