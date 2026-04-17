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
  degreeThreshold: number;  // Multiplier for mean degree to classify superspreader
  activityWindow: number;   // Window to compute activation
  baselineWindow: number;   // Window to establish baseline
}

export interface SuperspreaderResult {
  activationIndex: number;  // Normalized superspreader activity
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

export class SuperspreaderMetric {
  private nodeActivity: Map<string, number> = new Map(); // node -> activity count
  private nodeDegree: Map<string, number> = new Map();    // node -> degree
  private activityHistory: number[] = [];
  private params: SuperspreaderParams;

  constructor(params: Partial<SuperspreaderParams> = {}) {
    this.params = {
      degreeThreshold: params.degreeThreshold ?? 4,
      activityWindow: params.activityWindow ?? 100,   // ~100 slots
      baselineWindow: params.baselineWindow ?? 1000,  // ~1000 slots for baseline
    };
  }

  /**
   * Record activity from a node
   */
  addActivity(nodeId: string, degree: number, activity: number = 1): void {
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
  compute(): SuperspreaderResult {
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
  normalize(historicalMean: number, historicalStd: number): number {
    const result = this.compute();
    return (result.activationIndex - historicalMean) / historicalStd;
  }

  private emptyResult(): SuperspreaderResult {
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

  reset(): void {
    this.nodeActivity.clear();
    this.nodeDegree.clear();
    this.activityHistory = [];
  }
}
