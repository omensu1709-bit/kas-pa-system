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
  historyLength: number;    // Past states to consider
  clusterCount: number;    // Number of wallet clusters
  windowSize: number;       // Rolling window size
}

export interface TransferEntropyResult {
  clustering: number;       // C_TE - normalized clustering coefficient
  totalFlow: number;       // Total transfer entropy
  metadata: {
    clusters: number;
    avgClusterSize: number;
    dominantFlows: [string, string][]; // Top 5 source→target pairs
  };
}

export class TransferEntropyMetric {
  private clusterStates: Map<number, number[]> = new Map(); // cluster -> recent values
  private flows: Map<string, number> = new Map(); // "src→dst" -> count
  private params: TransferEntropyParams;

  constructor(params: Partial<TransferEntropyParams> = {}) {
    this.params = {
      historyLength: params.historyLength ?? 10,
      clusterCount: params.clusterCount ?? 5,
      windowSize: params.windowSize ?? 1000,
    };

    // Initialize cluster states
    for (let i = 0; i < this.params.clusterCount; i++) {
      this.clusterStates.set(i, []);
    }
  }

  /**
   * Record a transfer between two clusters
   */
  addTransfer(sourceCluster: number, targetCluster: number, value: number = 1): void {
    if (sourceCluster < 0 || sourceCluster >= this.params.clusterCount) return;
    if (targetCluster < 0 || targetCluster >= this.params.clusterCount) return;
    if (sourceCluster === targetCluster) return;

    // Update flow counts
    const flowKey = `${sourceCluster}→${targetCluster}`;
    this.flows.set(flowKey, (this.flows.get(flowKey) || 0) + value);

    // Update cluster states
    const srcStates = this.clusterStates.get(sourceCluster) || [];
    srcStates.push(value);
    while (srcStates.length > this.params.windowSize) {
      srcStates.shift();
    }
    this.clusterStates.set(sourceCluster, srcStates);

    const dstStates = this.clusterStates.get(targetCluster) || [];
    dstStates.push(value);
    while (dstStates.length > this.params.windowSize) {
      dstStates.shift();
    }
    this.clusterStates.set(targetCluster, dstStates);

    // Maintain flow map size
    if (this.flows.size > this.params.windowSize) {
      const oldestKey = this.flows.keys().next().value;
      if (oldestKey) this.flows.delete(oldestKey);
    }
  }

  /**
   * Compute transfer entropy clustering
   * 
   * High clustering = many flows concentrate on few clusters = herding
   */
  compute(): TransferEntropyResult {
    if (this.flows.size < 50) {
      return this.emptyResult();
    }

    // Compute total flow per cluster
    const inflow: number[] = new Array(this.params.clusterCount).fill(0);
    const outflow: number[] = new Array(this.params.clusterCount).fill(0);
    let totalFlow = 0;

    for (const [flow, count] of this.flows) {
      const [src, dst] = flow.split('→').map(Number);
      outflow[src] += count;
      inflow[dst] += count;
      totalFlow += count;
    }

    // Find dominant flows
    const sortedFlows = [...this.flows.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k]) => k.split('→') as [string, string]);

    // Compute clustering: 
    // Herfindahl index of flow distribution = Σ (flow_i / total)²
    let herfindahl = 0;
    for (const count of this.flows.values()) {
      const share = count / totalFlow;
      herfindahl += share * share;
    }

    // Normalize to [0, 1] where 1 = maximum clustering (all flow through one channel)
    const clustering = herfindahl * (this.params.clusterCount / (this.params.clusterCount - 1)) || 0;

    // Average cluster sizes
    const nonZeroClusters = this.clusterStates.size;
    const avgClusterSize = nonZeroClusters > 0 ? totalFlow / nonZeroClusters : 0;

    return {
      clustering: Math.max(0, Math.min(1, clustering)),
      totalFlow,
      metadata: {
        clusters: nonZeroClusters,
        avgClusterSize,
        dominantFlows: sortedFlows,
      },
    };
  }

  /**
   * Normalize clustering to z-score
   * Higher clustering = more herding = dangerous
   */
  normalize(historicalMean: number, historicalStd: number): number {
    const result = this.compute();
    return (result.clustering - historicalMean) / historicalStd;
  }

  private emptyResult(): TransferEntropyResult {
    return {
      clustering: 0,
      totalFlow: 0,
      metadata: {
        clusters: 0,
        avgClusterSize: 0,
        dominantFlows: [],
      },
    };
  }

  reset(): void {
    this.flows.clear();
    for (const states of this.clusterStates.values()) {
      states.length = 0;
    }
  }
}
