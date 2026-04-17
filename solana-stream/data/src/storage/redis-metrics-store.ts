/**
 * Redis Metrics Store - Real-time metric storage and retrieval
 * 
 * Provides:
 * - Real-time metric append (via Redis streams)
 * - Historical metric queries
 * - Z-score computation
 * - Aggregation windows (1m, 5m, 1h, 24h)
 */

import { Redis } from 'ioredis';

export interface StoredMetric {
  slot: number;
  timestamp: number;
  token: string;
  
  // Z-scores
  z_n: number;
  z_PE: number;
  z_kappa: number;
  z_fragmentation: number;
  z_rt: number;
  z_bValue: number;
  z_CTE: number;
  z_SSI: number;
  z_LFI: number;
  
  // Raw values
  raw_n: number;
  raw_PE: number;
  raw_kappa: number;
  raw_fragmentation: number;
  raw_rt: number;
  raw_bValue: number;
  raw_CTE: number;
  raw_SSI: number;
  raw_LFI: number;
  
  // Crash probability
  crashProbability: number;
  confirmingMetrics: number;
}

export class RedisMetricsStore {
  private redis: Redis;
  private streamKey: string;
  private metricsKey: string;

  constructor(redis: Redis, token: string) {
    this.redis = redis;
    this.streamKey = `metrics:stream:${token}`;
    this.metricsKey = `metrics:rolling:${token}`;
  }

  /**
   * Append a metric observation
   */
  async append(metric: Omit<StoredMetric, 'crashProbability' | 'confirmingMetrics'> & {
    crashProbability: number;
    confirmingMetrics: number;
  }): Promise<void> {
    const fields: Record<string, string> = {
      slot: metric.slot.toString(),
      timestamp: metric.timestamp.toString(),
      token: metric.token,
      z_n: metric.z_n.toString(),
      z_PE: metric.z_PE.toString(),
      z_kappa: metric.z_kappa.toString(),
      z_fragmentation: metric.z_fragmentation.toString(),
      z_rt: metric.z_rt.toString(),
      z_bValue: metric.z_bValue.toString(),
      z_CTE: metric.z_CTE.toString(),
      z_SSI: metric.z_SSI.toString(),
      z_LFI: metric.z_LFI.toString(),
      raw_n: metric.raw_n.toString(),
      raw_PE: metric.raw_PE.toString(),
      raw_kappa: metric.raw_kappa.toString(),
      raw_fragmentation: metric.raw_fragmentation.toString(),
      raw_rt: metric.raw_rt.toString(),
      raw_bValue: metric.raw_bValue.toString(),
      raw_CTE: metric.raw_CTE.toString(),
      raw_SSI: metric.raw_SSI.toString(),
      raw_LFI: metric.raw_LFI.toString(),
      crashProbability: metric.crashProbability.toString(),
      confirmingMetrics: metric.confirmingMetrics.toString(),
    };

    // XADD to stream (time-series)
    await this.redis.xadd(
      this.streamKey,
      'MAXLEN', '~', '100000', // Approximate max length
      '*',
      ...Object.entries(fields).flat()
    );

    // Also store rolling window in Hash for fast access
    await this.redis.hset(this.metricsKey, metric.slot.toString(), JSON.stringify(fields));
    
    // Set TTL on hash (7 days)
    await this.redis.expire(this.metricsKey, 7 * 24 * 60 * 60);
  }

  /**
   * Get metrics within a time range
   */
  async getRange(startTime: number, endTime: number): Promise<StoredMetric[]> {
    const results = await this.redis.xrange(
      this.streamKey,
      startTime.toString(),
      endTime.toString()
    );

    return results.map(([, fields]) => this.parseFields(fields));
  }

  /**
   * Get recent metrics
   */
  async getRecent(count: number): Promise<StoredMetric[]> {
    const results = await this.redis.xrevrange(
      this.streamKey,
      '+',
      '-',
      'COUNT', count.toString()
    );

    return results.map(([, fields]) => this.parseFields(fields));
  }

  /**
   * Get rolling statistics for z-score normalization
   */
  async getRollingStats(windowSlots: number): Promise<Map<string, { mean: number; std: number }>> {
    const recent = await this.getRecent(windowSlots);
    const stats = new Map<string, { mean: number; std: number }>();

    if (recent.length === 0) return stats;

    const zMetrics = ['z_n', 'z_PE', 'z_kappa', 'z_fragmentation', 'z_rt', 'z_bValue', 'z_CTE', 'z_SSI', 'z_LFI'];

    for (const zMetric of zMetrics) {
      const values = recent.map(r => (r as any)[zMetric]).filter((v: number) => !isNaN(v));
      
      if (values.length === 0) continue;
      
      const mean = values.reduce((a: number, b: number) => a + b, 0) / values.length;
      const variance = values.reduce((sum: number, v: number) => sum + Math.pow(v - mean, 2), 0) / values.length;
      
      stats.set(zMetric, { mean, std: Math.sqrt(variance) });
    }

    return stats;
  }

  private parseFields(fields: string[]): StoredMetric {
    const obj: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      obj[fields[i]] = fields[i + 1];
    }

    return {
      slot: parseInt(obj.slot),
      timestamp: parseInt(obj.timestamp),
      token: obj.token,
      z_n: parseFloat(obj.z_n),
      z_PE: parseFloat(obj.z_PE),
      z_kappa: parseFloat(obj.z_kappa),
      z_fragmentation: parseFloat(obj.z_fragmentation),
      z_rt: parseFloat(obj.z_rt),
      z_bValue: parseFloat(obj.z_bValue),
      z_CTE: parseFloat(obj.z_CTE),
      z_SSI: parseFloat(obj.z_SSI),
      z_LFI: parseFloat(obj.z_LFI),
      raw_n: parseFloat(obj.raw_n),
      raw_PE: parseFloat(obj.raw_PE),
      raw_kappa: parseFloat(obj.raw_kappa),
      raw_fragmentation: parseFloat(obj.raw_fragmentation),
      raw_rt: parseFloat(obj.raw_rt),
      raw_bValue: parseFloat(obj.raw_bValue),
      raw_CTE: parseFloat(obj.raw_CTE),
      raw_SSI: parseFloat(obj.raw_SSI),
      raw_LFI: parseFloat(obj.raw_LFI),
      crashProbability: parseFloat(obj.crashProbability),
      confirmingMetrics: parseInt(obj.confirmingMetrics),
    };
  }

  /**
   * Get the latest metric
   */
  async getLatest(): Promise<StoredMetric | null> {
    const recent = await this.getRecent(1);
    return recent[0] || null;
  }
}
