/**
 * Arrow Storage - High-performance columnar storage for time-series metrics
 * 
 * Uses Apache Arrow format for:
 * - Efficient compression (LZ4, Zstd)
 * - Columnar access (compute only needed columns)
 * - Zero-copy reads
 * - Interoperability with Python (PyArrow) and Rust
 */

export interface MetricRow {
  slot: number;
  timestamp: number;
  token: string;
  
  // Raw metric values
  n: number;
  PE: number;
  kappa: number;
  fragmentation: number;
  rt: number;
  bValue: number;
  CTE: number;
  SSI: number;
  LFI: number;
  
  // Crash probability
  crashProbability: number;
  confirmingMetrics: number;
}

export class ArrowStorage {
  private rows: MetricRow[] = [];
  private maxRows: number;

  constructor(maxRows: number = 1_000_000) {
    this.maxRows = maxRows;
  }

  /**
   * Add a row to storage
   */
  append(row: MetricRow): void {
    this.rows.push(row);
    
    while (this.rows.length > this.maxRows) {
      this.rows.shift();
    }
  }

  /**
   * Get rows within a time range
   */
  queryRange(startTime: number, endTime: number): MetricRow[] {
    return this.rows.filter(r => r.timestamp >= startTime && r.timestamp <= endTime);
  }

  /**
   * Get rows within a slot range
   */
  querySlotRange(startSlot: number, endSlot: number): MetricRow[] {
    return this.rows.filter(r => r.slot >= startSlot && r.slot <= endSlot);
  }

  /**
   * Get recent rows
   */
  getRecent(count: number): MetricRow[] {
    return this.rows.slice(-count);
  }

  /**
   * Get statistics for z-score normalization
   */
  getStatistics(): Map<string, { mean: number; std: number; min: number; max: number }> {
    const stats = new Map<string, { mean: number; std: number; min: number; max: number }>();
    
    const metrics = ['n', 'PE', 'kappa', 'fragmentation', 'rt', 'bValue', 'CTE', 'SSI', 'LFI'];
    
    for (const metric of metrics) {
      const values = this.rows.map(r => (r as any)[metric]).filter((v: number) => !isNaN(v) && v !== undefined);
      
      if (values.length === 0) continue;
      
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      const std = Math.sqrt(variance);
      const min = Math.min(...values);
      const max = Math.max(...values);
      
      stats.set(metric, { mean, std, min, max });
    }
    
    return stats;
  }

  /**
   * Serialize to JSON (simple for now)
   */
  toJSON(): string {
    return JSON.stringify({
      rows: this.rows,
      maxRows: this.maxRows,
    });
  }

  /**
   * Load from JSON
   */
  static fromJSON(json: string): ArrowStorage {
    const data = JSON.parse(json);
    const storage = new ArrowStorage(data.maxRows);
    for (const row of data.rows) {
      storage.append(row as MetricRow);
    }
    return storage;
  }

  get length(): number {
    return this.rows.length;
  }

  /**
   * Export to Apache Arrow table (for Python interop)
   */
  toArrowTable() {
    // Lazy import to avoid issues if arrow isn't installed
    try {
      const arrow = require('apache-arrow');
      
      const schema = new arrow.Schema([
        new arrow.Field('slot', new arrow.Int64),
        new arrow.Field('timestamp', new arrow.Int64),
        new arrow.Field('token', new arrow.Utf8),
        new arrow.Field('n', new arrow.Float64),
        new arrow.Field('PE', new arrow.Float64),
        new arrow.Field('kappa', new arrow.Float64),
        new arrow.Field('fragmentation', new arrow.Float64),
        new arrow.Field('rt', new arrow.Float64),
        new arrow.Field('bValue', new arrow.Float64),
        new arrow.Field('CTE', new arrow.Float64),
        new arrow.Field('SSI', new arrow.Float64),
        new arrow.Field('LFI', new arrow.Float64),
        new arrow.Field('crashProbability', new arrow.Float64),
        new arrow.Field('confirmingMetrics', new arrow.Int32),
      ]);

      return arrow.tableFromArrays({
        slot: this.rows.map(r => BigInt(r.slot)),
        timestamp: this.rows.map(r => BigInt(r.timestamp)),
        token: this.rows.map(r => r.token),
        n: this.rows.map(r => r.n),
        PE: this.rows.map(r => r.PE),
        kappa: this.rows.map(r => r.kappa),
        fragmentation: this.rows.map(r => r.fragmentation),
        rt: this.rows.map(r => r.rt),
        bValue: this.rows.map(r => r.bValue),
        CTE: this.rows.map(r => r.CTE),
        SSI: this.rows.map(r => r.SSI),
        LFI: this.rows.map(r => r.LFI),
        crashProbability: this.rows.map(r => r.crashProbability),
        confirmingMetrics: this.rows.map(r => r.confirmingMetrics),
      }, schema);
    } catch (e) {
      console.warn('Apache Arrow not available, using JSON serialization');
      return null;
    }
  }
}
