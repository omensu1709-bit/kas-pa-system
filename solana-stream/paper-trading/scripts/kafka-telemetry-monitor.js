#!/usr/bin/env node
/**
 * KAS PA - Telemetry Monitoring Script
 * Liest kaspa.telemetry Topic und visualisiert propagationTimeMs in Echtzeit
 *
 * Usage: node scripts/kafka-telemetry-monitor.js [--broker localhost:9092] [--group kaspa-telemetry-monitor]
 */

import { Kafka, Consumer, logLevel } from 'kafkajs';

interface TelemetryData {
  traceId: string;
  propagationTimeMs: number;
  nodeLatencies: Record<string, number>;
  cycleNumber: number;
  timestamp: number;
}

interface AggregatedStats {
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

// CLI Arguments
const args = process.argv.slice(2);
const brokerIndex = args.indexOf('--broker');
const groupIndex = args.indexOf('--group');

const KAFKA_BROKER = brokerIndex !== -1 ? args[brokerIndex + 1] : 'localhost:9092';
const GROUP_ID = groupIndex !== -1 ? args[groupIndex + 1] : 'kaspa-telemetry-monitor';

const WINDOW_SIZE = 100; // Letzte 100 Events für Statistik

class TelemetryMonitor {
  private consumer: Consumer;
  private history: TelemetryData[] = [];
  private stats: Map<string, number[]> = new Map();
  private isRunning: boolean = false;
  private startTime: number = Date.now();

  constructor() {
    const kafka = new Kafka({
      clientId: 'kaspa-telemetry-monitor',
      brokers: [KAFKA_BROKER],
      logLevel: logLevel.ERROR,
      retry: {
        initialRetryTime: 300,
        retries: 5,
      },
    });

    this.consumer = kafka.consumer({ groupId: GROUP_ID });
  }

  async start(): Promise<void> {
    console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    KAS PA - Telemetry Monitor                              ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  Broker: ${KAFKA_BROKER.padEnd(67)}║
║  Group:  ${GROUP_ID.padEnd(67)}║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);

    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: 'kaspa.telemetry',
      fromBeginning: false,
    });

    this.isRunning = true;

    // Console Input Handler
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.on('data', (key) => {
      if (key.toString() === 'q' || key.toString() === '\u0003') {
        this.shutdown();
      } else if (key.toString() === 'r') {
        this.resetStats();
      } else if (key.toString() === 'p') {
        this.printStats();
      }
    });

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        if (!message.value) return;

        try {
          const event = JSON.parse(message.value.toString());
          this.processEvent(event);
        } catch (error) {
          console.error('❌ Parse Error:', error);
        }
      },
    });

    // Status-Update Loop
    this.printLoop();
  }

  private processEvent(event: any): void {
    const data: TelemetryData = {
      traceId: event.traceId || 'unknown',
      propagationTimeMs: event.propagationTimeMs || 0,
      nodeLatencies: event.nodeLatencies || {},
      cycleNumber: event.cycleNumber || 0,
      timestamp: event.timestamp || Date.now(),
    };

    // History aktualisieren
    this.history.push(data);
    if (this.history.length > WINDOW_SIZE) {
      this.history.shift();
    }

    // Node-spezifische Stats sammeln
    for (const [node, latency] of Object.entries(data.nodeLatencies)) {
      if (!this.stats.has(node)) {
        this.stats.set(node, []);
      }
      const nodeStats = this.stats.get(node)!;
      nodeStats.push(latency as number);
      if (nodeStats.length > WINDOW_SIZE) {
        nodeStats.shift();
      }
    }

    // ANSI Cursor zurücksetzen und neu zeichnen
    process.stdout.write('\x1b[2J\x1b[H');
    this.printDashboard(data);
  }

  private printDashboard(data: TelemetryData): void {
    const uptime = this.formatUptime(Date.now() - this.startTime);
    const agg = this.calculateStats(this.history.map(h => h.propagationTimeMs));

    // Status-Balken für Propagation Time
    const bar = this.createBar(agg.avg, 0, 1000);
    const barColor = agg.avg < 200 ? '42' : agg.avg < 500 ? '43' : '41';

    console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    KAS PA - Telemetry Monitor [${uptime}]              ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  TRACE: ${data.traceId.substring(0, 32).padEnd(72)}║
║  CYCLE: ${String(data.cycleNumber).padEnd(72)}║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                         PROPAGATION TIME (Letzte ${this.history.length} Events)           ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  Aktuell: \x1b[1m${data.propagationTimeMs.toFixed(1).padStart(8)}ms\x1b[0m                                            ║
║  ${bar} \x1b[0m  ${agg.avg.toFixed(1)}ms AVG                        ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  MIN: \x1b[32m${agg.min.toFixed(1)}ms\x1b[0m  AVG: ${agg.avg.toFixed(1)}ms  MAX: \x1b[31m${agg.max.toFixed(1)}ms\x1b[0m              ║
║  P50:  ${agg.p50.toFixed(1)}ms  P95: ${agg.p95.toFixed(1)}ms  P99: ${agg.p99.toFixed(1)}ms              ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                              NODE LATENCIES                                 ║`);

    // Node Latencies
    for (const [node, latencies] of this.stats.entries()) {
      const nodeAgg = this.calculateStats(latencies);
      const healthColor = nodeAgg.avg < 100 ? '32' : nodeAgg.avg < 300 ? '33' : '31';
      console.log(
        `║  \x1b[1m${node.padEnd(20)}\x1b[0m AVG: \x1b[${healthColor}m${nodeAgg.avg.toFixed(1)}ms\x1b[0m  ` +
        `MIN: ${nodeAgg.min.toFixed(1)}ms  MAX: \x1b[${healthColor}m${nodeAgg.max.toFixed(1)}ms\x1b[0m  ` +
        `P95: ${nodeAgg.p95.toFixed(1)}ms             ║`
      );
    }

    console.log(`
╠═══════════════════════════════════════════════════════════════════════════════╣
║  [q] Quit   [r] Reset Stats   [p] Print JSON Stats                        ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);
  }

  private calculateStats(values: number[]): AggregatedStats {
    if (values.length === 0) {
      return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      count,
      min: sorted[0],
      max: sorted[count - 1],
      avg: sum / count,
      p50: sorted[Math.floor(count * 0.50)],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)],
    };
  }

  private createBar(value: number, min: number, max: number): string {
    const width = 30;
    const normalized = Math.min(Math.max((value - min) / (max - min), 0), 1);
    const filled = Math.round(normalized * width);
    const empty = width - filled;
    return `\x1b[${filled > 0 ? '42m' : ''}${'█'.repeat(filled)}\x1b[0m${'░'.repeat(empty)}`;
  }

  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `${hours.toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  }

  private printLoop(): void {
    setInterval(() => {
      if (!this.isRunning) return;
      if (this.history.length > 0) {
        const latest = this.history[this.history.length - 1];
        this.processEvent(latest);
      }
    }, 1000);
  }

  private printStats(): void {
    const agg = this.calculateStats(this.history.map(h => h.propagationTimeMs));
    console.log('\n📊 JSON Stats:\n', JSON.stringify({
      aggregated: agg,
      nodes: Object.fromEntries(
        [...this.stats.entries()].map(([node, vals]) => [
          node,
          this.calculateStats(vals),
        ])
      ),
      historyLength: this.history.length,
    }, null, 2));
  }

  private resetStats(): void {
    this.history = [];
    this.stats.clear();
    console.log('\n🔄 Stats zurückgesetzt');
  }

  async shutdown(): Promise<void> {
    console.log('\n\n👋 Shutting down Telemetry Monitor...');
    this.isRunning = false;
    await this.consumer.disconnect();
    process.exit(0);
  }
}

// Main
const monitor = new TelemetryMonitor();

monitor.start().catch((error) => {
  console.error('❌ Monitor Error:', error);
  process.exit(1);
});

process.on('SIGINT', () => monitor.shutdown());
process.on('SIGTERM', () => monitor.shutdown());
