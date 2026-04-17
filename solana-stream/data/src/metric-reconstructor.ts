/**
 * Metric Reconstruction Engine
 * 
 * Computes all 9 crash detection metrics from historical data
 * for the validation events.
 * 
 * Week 3-4 implementation.
 */

import {
  HawkesMetric,
  PermutationEntropyMetric,
  GraphMetric,
  EpidemicMetric,
  GutenbergRichterMetric,
  TransferEntropyMetric,
  SuperspreaderMetric,
  LiquidityImpactMetric,
  CrashMetrics,
  computeCrashProbability,
  METRIC_COEFFICIENTS,
} from './metrics/index.js';

import type { ValidationEvent } from './validation/loader.js';
import type { PriceRecord, TransactionRecord } from './historical-client.js';

export interface ReconstructionConfig {
  hawkesWindow: number;
  entropyWindow: number;
  graphMaxNodes: number;
  graphTtlMs: number;
  epidemicWindow: number;
  seismicWindow: number;
  transferWindow: number;
  superspreaderWindow: number;
  liquidityWindow: number;
}

export const DEFAULT_CONFIG: ReconstructionConfig = {
  hawkesWindow: 5000,
  entropyWindow: 500,
  graphMaxNodes: 50000,
  graphTtlMs: 30 * 60 * 1000, // 30 minutes
  epidemicWindow: 1000,
  seismicWindow: 1000,
  transferWindow: 1000,
  superspreaderWindow: 100,
  liquidityWindow: 500,
};

export class MetricReconstructor {
  private config: ReconstructionConfig;
  
  // Metric instances
  private hawkes: HawkesMetric;
  private entropy: PermutationEntropyMetric;
  private graph: GraphMetric;
  private epidemic: EpidemicMetric;
  private seismic: GutenbergRichterMetric;
  private transfer: TransferEntropyMetric;
  private superspreader: SuperspreaderMetric;
  private liquidity: LiquidityImpactMetric;
  
  // Rolling statistics for z-score normalization
  private rollingStats: Map<string, { sum: number; sumSq: number; count: number }> = new Map();
  
  // Wallet cluster mapping (simplified - based on transaction size)
  private walletClusters: Map<string, number> = new Map();
  private nextCluster: number = 0;

  constructor(config: Partial<ReconstructionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    this.hawkes = new HawkesMetric({ windowSize: this.config.hawkesWindow });
    this.entropy = new PermutationEntropyMetric({ windowSize: this.config.entropyWindow });
    this.graph = new GraphMetric(this.config.graphTtlMs, this.config.graphMaxNodes);
    this.epidemic = new EpidemicMetric({ windowSize: this.config.epidemicWindow });
    this.seismic = new GutenbergRichterMetric({ windowSize: this.config.seismicWindow });
    this.transfer = new TransferEntropyMetric({ windowSize: this.config.transferWindow });
    this.superspreader = new SuperspreaderMetric({ windowSize: this.config.superspreaderWindow });
    this.liquidity = new LiquidityImpactMetric({ windowSize: this.config.liquidityWindow });
  }

  /**
   * Process a single transaction
   */
  processTransaction(tx: TransactionRecord): void {
    const timestamp = tx.timestamp * 1000; // Convert to ms
    
    // 1. Hawkes metric: add transaction event
    this.hawkes.addEvent(tx.slot, timestamp);
    
    // 2. Graph metric: add edges between account keys
    // Connect first account to all others (simplified graph construction)
    if (tx.accountKeys.length >= 2) {
      const primary = tx.accountKeys[0];
      for (let i = 1; i < tx.accountKeys.length; i++) {
        this.graph.addEdge(primary, tx.accountKeys[i], timestamp);
      }
    }
    
    // 3. Epidemic metric: add transmissions
    // Simplified: each instruction is a "transmission"
    for (let i = 0; i < tx.instructions.length - 1; i++) {
      this.epidemic.addTransmission(
        tx.slot - (tx.instructions.length - i),
        tx.slot - i,
        1
      );
    }
    
    // 4. Seismic metric: transaction size as "magnitude"
    const magnitude = Math.log1p(tx.fee) / 10; // Normalize fee to magnitude-like scale
    this.seismic.addMagnitude(magnitude);
    
    // 5. Transfer entropy: cluster wallets by activity level
    for (const account of tx.accountKeys) {
      const cluster = this.getOrCreateCluster(account);
      // Simplified: small transactions go to lower clusters
      if (tx.fee > 5000 && cluster > 0) { // High fee = larger wallet
        const targetCluster = Math.min(cluster + 1, 4);
        this.transfer.addTransfer(cluster, targetCluster, 1);
      }
    }
    
    // 6. Superspreader metric: track high-activity nodes
    for (const account of tx.accountKeys) {
      const degree = tx.accountKeys.length;
      this.superspreader.addActivity(account, degree, 1);
    }
    
    // Update rolling stats
    this.updateRollingStats('n', this.hawkes.compute().branchingRatio);
    this.updateRollingStats('PE', this.entropy.compute().normalizedEntropy);
    this.updateRollingStats('kappa', this.graph.compute().molloyReedRatio);
    this.updateRollingStats('fragmentation', this.graph.compute().fragmentationRatio);
    this.updateRollingStats('rt', this.epidemic.compute().rt);
    this.updateRollingStats('bValue', this.seismic.compute().bValue);
    this.updateRollingStats('CTE', this.transfer.compute().clustering);
    this.updateRollingStats('SSI', this.superspreader.compute().activationIndex);
    this.updateRollingStats('LFI', this.liquidity.compute().deviation);
  }

  /**
   * Process a price tick for entropy calculation
   */
  processPrice(price: PriceRecord): void {
    this.entropy.addPrice(price.close, price.slot);
    this.updateRollingStats('PE', this.entropy.compute().normalizedEntropy);
  }

  /**
   * Process a trade for liquidity impact
   */
  processTrade(
    size: number,
    priceImpactBps: number,
    slot: number,
    volume: number
  ): void {
    this.liquidity.addTrade(size, priceImpactBps, slot, volume);
    this.updateRollingStats('LFI', this.liquidity.compute().deviation);
  }

  /**
   * Get current metric state as z-scores
   */
  getCurrentMetrics(): CrashMetrics {
    const hawkesResult = this.hawkes.compute();
    const entropyResult = this.entropy.compute();
    const graphResult = this.graph.compute();
    const epidemicResult = this.epidemic.compute();
    const seismicResult = this.seismic.compute();
    const transferResult = this.transfer.compute();
    const superspreaderResult = this.superspreader.compute();
    const liquidityResult = this.liquidity.compute();
    
    // Raw values
    const raw = {
      n: hawkesResult.branchingRatio,
      PE: entropyResult.normalizedEntropy,
      kappa: graphResult.molloyReedRatio,
      fragmentation: graphResult.fragmentationRatio,
      rt: epidemicResult.rt,
      bValue: seismicResult.bValue,
      CTE: transferResult.clustering,
      SSI: superspreaderResult.activationIndex,
      LFI: liquidityResult.deviation,
    };
    
    // Z-scores
    const z = {
      n: this.normalizeZScore('n', raw.n),
      PE: this.normalizeZScore('PE', raw.PE),
      kappa: this.normalizeZScore('kappa', raw.kappa),
      fragmentation: this.normalizeZScore('fragmentation', raw.fragmentation),
      rt: this.normalizeZScore('rt', raw.rt),
      bValue: this.normalizeZScore('bValue', raw.bValue),
      CTE: this.normalizeZScore('CTE', raw.CTE),
      SSI: this.normalizeZScore('SSI', raw.SSI),
      LFI: this.normalizeZScore('LFI', raw.LFI),
    };
    
    // Crash probability
    const { probability, confirmingMetrics } = computeCrashProbability(z);
    
    return {
      ...raw,
      ...z,
      crashProbability: probability,
      confirmingMetrics: confirmingMetrics.length,
      slot: 0, // Would be set from actual data
      timestamp: Date.now(),
    };
  }

  /**
   * Update rolling statistics for z-score computation
   */
  private updateRollingStats(metric: string, value: number): void {
    if (isNaN(value) || !isFinite(value)) return;
    
    let stats = this.rollingStats.get(metric);
    if (!stats) {
      stats = { sum: 0, sumSq: 0, count: 0 };
      this.rollingStats.set(metric, stats);
    }
    
    stats.sum += value;
    stats.sumSq += value * value;
    stats.count++;
    
    // Keep only last 30 days worth of data (simplified)
    if (stats.count > 100000) {
      // Reset periodically to simulate rolling window
      stats.sum = stats.sum * 0.9;
      stats.sumSq = stats.sumSq * 0.9;
      stats.count = stats.count * 0.9;
    }
  }

  /**
   * Normalize a value to z-score using rolling statistics
   */
  private normalizeZScore(metric: string, value: number): number {
    const stats = this.rollingStats.get(metric);
    if (!stats || stats.count < 30) {
      return 0; // Not enough data
    }
    
    const mean = stats.sum / stats.count;
    const variance = (stats.sumSq / stats.count) - (mean * mean);
    const std = Math.sqrt(Math.max(0, variance));
    
    if (std < 0.001) return 0; // Avoid division by zero
    
    return (value - mean) / std;
  }

  /**
   * Get or create a cluster for a wallet
   */
  private getOrCreateCluster(wallet: string): number {
    if (!this.walletClusters.has(wallet)) {
      this.walletClusters.set(wallet, this.nextCluster);
      this.nextCluster = (this.nextCluster + 1) % 5; // 5 clusters
    }
    return this.walletClusters.get(wallet)!;
  }

  /**
   * Reset all metrics (for processing new time periods)
   */
  reset(): void {
    this.hawkes.reset();
    this.entropy.reset();
    this.graph.reset();
    this.epidemic.reset();
    this.seismic.reset();
    this.transfer.reset();
    this.superspreader.reset();
    this.liquidity.reset();
    this.walletClusters.clear();
    this.nextCluster = 0;
  }

  /**
   * Get the current rolling statistics
   */
  getRollingStats(): Map<string, { mean: number; std: number; count: number }> {
    const result = new Map<string, { mean: number; std: number; count: number }>();
    
    for (const [metric, stats] of this.rollingStats) {
      const mean = stats.sum / stats.count;
      const variance = (stats.sumSq / stats.count) - (mean * mean);
      const std = Math.sqrt(Math.max(0, variance));
      
      result.set(metric, { mean, std, count: stats.count });
    }
    
    return result;
  }
}

/**
 * Reconstruct metrics for a validation event
 */
export async function reconstructEventMetrics(
  event: ValidationEvent,
  transactions: TransactionRecord[],
  prices: PriceRecord[]
): Promise<CrashMetrics[]> {
  const reconstructor = new MetricReconstructor();
  const metrics: CrashMetrics[] = [];
  
  // Sort by timestamp
  const sortedTxs = [...transactions].sort((a, b) => a.timestamp - b.timestamp);
  const sortedPrices = [...prices].sort((a, b) => a.timestamp - b.timestamp);
  
  let txIndex = 0;
  let priceIndex = 0;
  
  // Process in chronological order
  while (txIndex < sortedTxs.length || priceIndex < sortedPrices.length) {
    const nextTx = sortedTxs[txIndex];
    const nextPrice = sortedPrices[priceIndex];
    
    // Determine which to process next
    if (nextTx && (!nextPrice || nextTx.timestamp < nextPrice.timestamp)) {
      reconstructor.processTransaction(nextTx);
      txIndex++;
    } else if (nextPrice) {
      reconstructor.processPrice(nextPrice);
      priceIndex++;
    }
    
    // Record metrics every 100 slots (simplified)
    if (nextTx && nextTx.slot % 100 === 0) {
      metrics.push(reconstructor.getCurrentMetrics());
    }
  }
  
  return metrics;
}
