/**
 * KAS PA v4.2 - Propagation Tracker
 *
 * SOTA Telemetrie für Lock-Free Monitoring:
 * - Trackt Latenz pro Node im Cycle-Durchlauf
 * - Keine I/O Operationen im Hot-Path
 * - Ringpuffer für letzte N Traces
 * - Aggregation für Dashboard-Display
 */

export interface TraceSpan {
  traceId: string;
  nodeId: string;
  operation: string;
  startTime: number;
  endTime: number;
  latencyMs: number;
  success: boolean;
  metadata?: Record<string, unknown>;
}

export interface NodeLatencyStats {
  nodeId: string;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  sampleCount: number;
  lastUpdate: number;
}

export interface TraceResult {
  traceId: string;
  totalTimeMs: number;
  spans: TraceSpan[];
  nodeBreakdown: Array<{ nodeId: string; latencyMs: number; operation: string }>;
  timestamp: number;
  success: boolean;
}

export class PropagationTracker {
  private currentTraceId: string | null = null;
  private currentSpans: TraceSpan[] = [];
  private nodeStack: Array<{ nodeId: string; operation: string; startTime: number }> = [];
  private traceHistory: TraceResult[] = [];
  private nodeLatencies: Map<string, NodeLatencyStats> = new Map();

  private readonly MAX_HISTORY = 50;
  private readonly MAX_LATENCY_SAMPLES = 1000;

  startTrace(): string {
    this.currentTraceId = `trace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    this.currentSpans = [];
    this.nodeStack = [];
    return this.currentTraceId;
  }

  enterNode(nodeId: string, operation: string): void {
    this.nodeStack.push({
      nodeId,
      operation,
      startTime: performance.now()
    });
  }

  exitNode(nodeId: string, success: boolean = true, metadata?: Record<string, unknown>): void {
    const endTime = performance.now();
    const stackIndex = this.nodeStack.findIndex(entry => entry.nodeId === nodeId);

    if (stackIndex === -1) {
      console.warn(`[PropagationTracker] exitNode: No entry found for ${nodeId}`);
      return;
    }

    const entry = this.nodeStack.splice(stackIndex, 1)[0];
    const latencyMs = endTime - entry.startTime;

    const span: TraceSpan = {
      traceId: this.currentTraceId || 'unknown',
      nodeId,
      operation: entry.operation,
      startTime: entry.startTime,
      endTime,
      latencyMs,
      success,
      metadata
    };

    this.currentSpans.push(span);
    this.updateNodeLatency(nodeId, latencyMs);
  }

  endTrace(success: boolean = true): TraceResult | null {
    if (!this.currentTraceId) {
      return null;
    }

    const totalTimeMs = this.currentSpans.length > 0
      ? this.currentSpans[this.currentSpans.length - 1].endTime - this.currentSpans[0].startTime
      : 0;

    const result: TraceResult = {
      traceId: this.currentTraceId,
      totalTimeMs,
      spans: [...this.currentSpans],
      nodeBreakdown: this.currentSpans.map(s => ({
        nodeId: s.nodeId,
        latencyMs: s.latencyMs,
        operation: s.operation
      })),
      timestamp: Date.now(),
      success
    };

    this.traceHistory.unshift(result);
    if (this.traceHistory.length > this.MAX_HISTORY) {
      this.traceHistory.pop();
    }

    this.currentTraceId = null;
    this.currentSpans = [];
    this.nodeStack = [];

    return result;
  }

  private updateNodeLatency(nodeId: string, latencyMs: number): void {
    let stats = this.nodeLatencies.get(nodeId);

    if (!stats) {
      stats = {
        nodeId,
        avgLatencyMs: 0,
        minLatencyMs: Infinity,
        maxLatencyMs: 0,
        sampleCount: 0,
        lastUpdate: Date.now()
      };
      this.nodeLatencies.set(nodeId, stats);
    }

    stats.sampleCount++;
    stats.avgLatencyMs = (stats.avgLatencyMs * (stats.sampleCount - 1) + latencyMs) / stats.sampleCount;
    stats.minLatencyMs = Math.min(stats.minLatencyMs, latencyMs);
    stats.maxLatencyMs = Math.max(stats.maxLatencyMs, latencyMs);
    stats.lastUpdate = Date.now();

    if (stats.sampleCount > this.MAX_LATENCY_SAMPLES) {
      stats.sampleCount = this.MAX_LATENCY_SAMPLES;
    }
  }

  getCurrentTraceId(): string | null {
    return this.currentTraceId;
  }

  getPropagationTime(): number {
    if (this.currentSpans.length === 0) return 0;
    const first = this.currentSpans[0];
    const last = this.currentSpans[this.currentSpans.length - 1];
    return last.endTime - first.startTime;
  }

  getNodeBreakdown(): Array<{ nodeId: string; latencyMs: number; operation: string }> {
    return this.currentSpans.map(s => ({
      nodeId: s.nodeId,
      latencyMs: s.latencyMs,
      operation: s.operation
    }));
  }

  getNodeLatencies(): Record<string, NodeLatencyStats> {
    const result: Record<string, NodeLatencyStats> = {};
    this.nodeLatencies.forEach((stats, nodeId) => {
      result[nodeId] = { ...stats };
    });
    return result;
  }

  getTraceHistory(): TraceResult[] {
    return [...this.traceHistory];
  }

  getLastTrace(): TraceResult | null {
    return this.traceHistory.length > 0 ? this.traceHistory[0] : null;
  }

  reset(): void {
    this.currentTraceId = null;
    this.currentSpans = [];
    this.nodeStack = [];
    this.traceHistory = [];
    this.nodeLatencies.clear();
  }
}

export const propagationTracker = new PropagationTracker();
