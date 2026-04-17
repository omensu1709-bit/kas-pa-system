/**
 * Molloy-Reed Ratio (κ) and Giant Component Fragmentation (S₂/S₁)
 *
 * Molloy-Reed ratio: κ = (2 * E) / N * (VARIANCE_degree / MEAN_degree)
 * κ < 2 indicates network cannot sustain a giant component
 *
 * Giant component fragmentation: S₂/S₁ = |C₂| / |C₁|
 * Rising ratio signals percolation phase transition
 */
export class GraphMetric {
    nodes = new Map();
    edges = new Set(); // "node1:node2" sorted pairs
    adjacency = new Map();
    nodeList = [];
    ttlMs;
    maxNodes;
    constructor(ttlMs = 30 * 60 * 1000, maxNodes = 50000) {
        this.ttlMs = ttlMs;
        this.maxNodes = maxNodes;
    }
    /**
     * Add an edge between two nodes
     */
    addEdge(from, to, timestamp) {
        // Evict old nodes
        this.evictOldNodes(timestamp);
        // Evict if at capacity
        if (this.nodes.size >= this.maxNodes && !this.nodes.has(from)) {
            this.evictOldestNode();
        }
        if (this.nodes.size >= this.maxNodes && !this.nodes.has(to)) {
            this.evictOldestNode();
        }
        // Add nodes
        this.addNode(from, timestamp);
        this.addNode(to, timestamp);
        // Add edge
        const edgeKey = from < to ? `${from}:${to}` : `${to}:${from}`;
        this.edges.add(edgeKey);
        // Update adjacency
        if (!this.adjacency.has(from))
            this.adjacency.set(from, new Set());
        if (!this.adjacency.has(to))
            this.adjacency.set(to, new Set());
        this.adjacency.get(from).add(to);
        this.adjacency.get(to).add(from);
    }
    addNode(nodeId, timestamp) {
        if (!this.nodes.has(nodeId)) {
            this.nodeList.push(nodeId);
        }
        this.nodes.set(nodeId, {
            id: nodeId,
            degree: this.adjacency.get(nodeId)?.size || 0,
            timestamp,
        });
    }
    evictOldNodes(currentTime) {
        const cutoff = currentTime - this.ttlMs;
        for (const [nodeId, node] of this.nodes) {
            if (node.timestamp < cutoff) {
                this.removeNode(nodeId);
            }
        }
    }
    evictOldestNode() {
        if (this.nodeList.length === 0)
            return;
        const oldestId = this.nodeList.shift();
        if (oldestId) {
            this.removeNode(oldestId);
        }
    }
    removeNode(nodeId) {
        this.nodes.delete(nodeId);
        this.nodeList = this.nodeList.filter(id => id !== nodeId);
        const neighbors = this.adjacency.get(nodeId);
        if (neighbors) {
            for (const neighbor of neighbors) {
                this.adjacency.get(neighbor)?.delete(nodeId);
            }
        }
        this.adjacency.delete(nodeId);
    }
    /**
     * Compute graph metrics
     */
    compute() {
        if (this.nodes.size < 10) {
            return this.emptyResult();
        }
        // Compute degree statistics
        let totalDegree = 0;
        const degrees = [];
        for (const node of this.nodes.values()) {
            const degree = this.adjacency.get(node.id)?.size || 0;
            degrees.push(degree);
            totalDegree += degree;
        }
        const N = this.nodes.size;
        const E = this.edges.size;
        const meanDegree = totalDegree / N;
        // Variance of degree distribution
        let variance = 0;
        for (const d of degrees) {
            variance += Math.pow(d - meanDegree, 2);
        }
        variance /= N;
        // Molloy-Reed ratio: κ = (2E/N) * (VAR(degree) / MEAN(degree))
        // Simplified: κ = meanDegree * (1 + VAR(degree) / MEAN(degree))
        const molloyReedRatio = meanDegree * (1 + variance / (meanDegree || 1));
        // Find connected components using BFS
        const components = this.findConnectedComponents();
        components.sort((a, b) => b.length - a.length); // Largest first
        const giantComponentSize = components[0]?.length || 0;
        const secondComponentSize = components[1]?.length || 0;
        const fragmentationRatio = giantComponentSize > 0 ? secondComponentSize / giantComponentSize : 0;
        return {
            molloyReedRatio,
            giantComponentSize,
            secondComponentSize,
            fragmentationRatio,
            metadata: {
                totalNodes: N,
                totalEdges: E,
                meanDegree,
                degreeVariance: variance,
                numComponents: components.length,
            },
        };
    }
    findConnectedComponents() {
        const visited = new Set();
        const components = [];
        for (const nodeId of this.nodes.keys()) {
            if (visited.has(nodeId))
                continue;
            const component = [];
            const queue = [nodeId];
            while (queue.length > 0) {
                const current = queue.shift();
                if (visited.has(current))
                    continue;
                visited.add(current);
                component.push(current);
                const neighbors = this.adjacency.get(current);
                if (neighbors) {
                    for (const neighbor of neighbors) {
                        if (!visited.has(neighbor)) {
                            queue.push(neighbor);
                        }
                    }
                }
            }
            components.push(component);
        }
        return components;
    }
    /**
     * Normalize κ (Molloy-Reed) to z-score
     * κ → 2 is dangerous, so we normalize: z = (2 - κ) / σ
     */
    normalizeKappa(_historicalMean, historicalStd) {
        const result = this.compute();
        // κ approaching 2 from above is dangerous
        return (2 - result.molloyReedRatio) / historicalStd;
    }
    /**
     * Normalize fragmentation ratio to z-score
     */
    normalizeFragmentation(historicalMean, historicalStd) {
        const result = this.compute();
        return (result.fragmentationRatio - historicalMean) / historicalStd;
    }
    emptyResult() {
        return {
            molloyReedRatio: 0,
            giantComponentSize: 0,
            secondComponentSize: 0,
            fragmentationRatio: 0,
            metadata: {
                totalNodes: 0,
                totalEdges: 0,
                meanDegree: 0,
                degreeVariance: 0,
                numComponents: 0,
            },
        };
    }
    reset() {
        this.nodes.clear();
        this.edges.clear();
        this.adjacency.clear();
        this.nodeList = [];
    }
}
//# sourceMappingURL=graph.js.map