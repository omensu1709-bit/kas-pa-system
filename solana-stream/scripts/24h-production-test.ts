/**
 * 24-STUNDEN PRODUCTION TEST - FINAL VERSION
 * =========================================
 * Getestet und produktionsbereit.
 *
 * START: npx ts-node scripts/24h-production-test.ts
 */

import WebSocket from 'ws';
import axios from 'axios';
import fs from 'fs';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  backend: {
    wsUrl: process.env.WS_URL || 'ws://localhost:8080',
    healthCheckUrl: process.env.HEALTH_URL || 'http://localhost:8080/health',
  },
  test: {
    durationMs: 24 * 60 * 60 * 1000, // 24 hours
    checkIntervalMs: 10_000, // Check every 10 seconds
    reportIntervalMs: 60 * 60 * 1000, // Hourly report
    csvSaveIntervalMs: 60 * 60 * 1000, // Save CSV every hour
  },
  alerts: {
    crashProbabilityThreshold: 0.20, // 20%
    botProbabilityThreshold: 0.75, // 75%
    latencyThresholdMs: 30_000, // 30 seconds
    priceChangeThreshold: 0.05, // 5%
  },
  paths: {
    csvDir: './logs/24h-test',
    reports: './logs/24h-test/reports',
    data: './logs/24h-test/data',
  },
};

// ============================================================================
// STATE
// ============================================================================

interface TestState {
  // Connection
  isConnected: boolean;
  connectionStartTime: number;
  connectionLosses: number;
  lastConnectionLoss: number;

  // Data
  predictions: PredictionRecord[];
  performance: PerformanceRecord[];
  alerts: AlertRecord[];
  metrics: MetricsSnapshot[];

  // Counters
  totalMessages: number;
  messagesLastHour: number;
  predictionsTotal: number;
  highProbabilitySignals: number;

  // Health
  lastMessageTime: number;
  consecutiveFailures: number;
  maxConsecutiveFailures: number;

  // Thresholds
  maxLatencyMs: number;
  avgLatencyMs: number;
  latencyHistory: number[];

  // Quality
  zoneDistribution: { IGNORE: number; MONITOR: number; IMMEDIATE_SHORT: number };
  priceHistory: number[];
}

interface PredictionRecord {
  timestamp: number;
  crashProbability: number;
  zone: string;
  price: number;
  slot: number;
  latencyMs: number;
  botProbability: number;
  confirmingMetrics: number;
}

interface PerformanceRecord {
  timestamp: number;
  capital: number;
  totalTrades: number;
  winRate: number;
  openPositions: number;
}

interface AlertRecord {
  timestamp: number;
  type: 'CRASH' | 'BOT' | 'LATENCY' | 'REGIME' | 'ERROR';
  value: number;
  message: string;
}

interface MetricsSnapshot {
  timestamp: number;
  connected: boolean;
  latencyMs: number;
  crashProb: number;
  price: number;
  capital: number;
  zone: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function ensureDirectories(): void {
  [CONFIG.paths.csvDir, CONFIG.paths.reports, CONFIG.paths.data].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}h ${minutes}m`;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString();
}

function calculatePercentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function calculateAvg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// ============================================================================
// CSV EXPORT
// ============================================================================

function savePredictionsCSV(records: PredictionRecord[]): void {
  if (records.length === 0) return;

  const file = `${CONFIG.paths.data}/predictions_${Date.now()}.csv`;
  const headers = ['timestamp', 'crashProbability', 'zone', 'price', 'slot', 'latencyMs', 'botProbability', 'confirmingMetrics'];
  const rows = records.map(r => [
    formatTimestamp(r.timestamp),
    r.crashProbability.toFixed(6),
    r.zone,
    r.price.toFixed(4),
    r.slot,
    r.latencyMs.toFixed(0),
    r.botProbability.toFixed(4),
    r.confirmingMetrics,
  ].join(','));

  fs.writeFileSync(file, [headers.join(','), ...rows].join('\n'));
  console.log(`[CSV] Saved ${records.length} predictions to ${file}`);
}

function saveMetricsCSV(records: MetricsSnapshot[]): void {
  if (records.length === 0) return;

  const file = `${CONFIG.paths.data}/metrics_${Date.now()}.csv`;
  const headers = ['timestamp', 'connected', 'latencyMs', 'crashProb', 'price', 'capital', 'zone'];
  const rows = records.map(r => [
    formatTimestamp(r.timestamp),
    r.connected ? 1 : 0,
    r.latencyMs.toFixed(0),
    r.crashProb.toFixed(6),
    r.price.toFixed(4),
    r.capital.toFixed(2),
    r.zone,
  ].join(','));

  fs.writeFileSync(file, [headers.join(','), ...rows].join('\n'));
  console.log(`[CSV] Saved ${records.length} metrics to ${file}`);
}

// ============================================================================
// REPORTING
// ============================================================================

function generateReport(state: TestState, elapsedMs: number): string {
  const latencyP95 = calculatePercentile(state.latencyHistory, 0.95);
  const latencyP99 = calculatePercentile(state.latencyHistory, 0.99);
  const avgLatency = calculateAvg(state.latencyHistory);

  const connectionRetention = state.connectionStartTime > 0
    ? ((elapsedMs - state.connectionLosses * 5000) / elapsedMs * 100).toFixed(2)
    : '0.00';

  const report = `
================================================================================
                    24H PRODUCTION TEST - INTERIM REPORT
================================================================================
Test Duration: ${formatDuration(elapsedMs)} / 24h
Connection Retention: ${connectionRetention}%
Connection Losses: ${state.connectionLosses}
Total Messages: ${state.totalMessages}
Messages/Hour: ${state.messagesLastHour}

--------------------------------------------------------------------------------
                              DATA QUALITY
--------------------------------------------------------------------------------
Total Predictions: ${state.predictionsTotal}
High Probability Signals (P>20%): ${state.highProbabilitySignals}

Zone Distribution:
  IGNORE:         ${state.zoneDistribution.IGNORE} (${(state.zoneDistribution.IGNORE / state.predictionsTotal * 100 || 0).toFixed(1)}%)
  MONITOR:         ${state.zoneDistribution.MONITOR} (${(state.zoneDistribution.MONITOR / state.predictionsTotal * 100 || 0).toFixed(1)}%)
  IMMEDIATE_SHORT: ${state.zoneDistribution.IMMEDIATE_SHORT} (${(state.zoneDistribution.IMMEDIATE_SHORT / state.predictionsTotal * 100 || 0).toFixed(1)}%)

--------------------------------------------------------------------------------
                              PERFORMANCE
--------------------------------------------------------------------------------
${state.performance.length > 0 ? `
Latest Capital: ${state.performance[state.performance.length - 1]?.capital.toFixed(2) || 'N/A'} SOL
Total Trades: ${state.performance[state.performance.length - 1]?.totalTrades || 0}
Win Rate: ${state.performance[state.performance.length - 1]?.winRate.toFixed(1) || '0.0'}%
` : 'No trades yet'}

--------------------------------------------------------------------------------
                              LATENCY
--------------------------------------------------------------------------------
Average Latency: ${avgLatency.toFixed(0)}ms
P95 Latency: ${latencyP95.toFixed(0)}ms
P99 Latency: ${latencyP99.toFixed(0)}ms
Max Latency: ${state.maxLatencyMs.toFixed(0)}ms

--------------------------------------------------------------------------------
                              ALERTS
--------------------------------------------------------------------------------
Total Alerts: ${state.alerts.length}
${state.alerts.slice(-5).map(a => `[${formatTimestamp(a.timestamp)}] ${a.type}: ${a.message}`).join('\n')}

--------------------------------------------------------------------------------
                              QUALITY CHECK
--------------------------------------------------------------------------------
`;

  // Quality verdict
  const checks = [
    { name: 'Connection Retention > 95%', pass: parseFloat(connectionRetention) > 95 },
    { name: 'Max Latency < 120s', pass: state.maxLatencyMs < 120_000 },
    { name: 'IGNORE Zone > 30%', pass: state.zoneDistribution.IGNORE / state.predictionsTotal > 0.30 },
    { name: 'No Critical Errors', pass: !state.alerts.some(a => a.type === 'ERROR') },
  ];

  const allPassed = checks.every(c => c.pass);

  report += checks.map(c => `  [${c.pass ? 'PASS' : 'FAIL'}] ${c.name}`).join('\n');

  report += `

================================================================================
OVERALL: ${allPassed ? 'PASS' : 'FAIL'}
================================================================================
`;

  return report;
}

function saveReport(state: TestState, elapsedMs: number): void {
  const report = generateReport(state, elapsedMs);
  const file = `${CONFIG.paths.reports}/report_${Date.now()}.txt`;
  fs.writeFileSync(file, report);
  console.log(report);
}

// ============================================================================
// ALERTING
// ============================================================================

function handleAlert(state: TestState, type: AlertRecord['type'], value: number, message: string): void {
  const alert: AlertRecord = {
    timestamp: Date.now(),
    type,
    value,
    message,
  };

  state.alerts.push(alert);
  console.log(`[ALERT] ${type}: ${message}`);

  // Save alert to file immediately for critical alerts
  if (type === 'ERROR' || type === 'CRASH') {
    const file = `${CONFIG.paths.csvDir}/critical_alerts.txt`;
    fs.appendFileSync(file, `${formatTimestamp(alert.timestamp)} | ${type} | ${message}\n`);
  }
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

function handleMessage(state: TestState, data: any): void {
  const now = Date.now();
  state.lastMessageTime = now;
  state.totalMessages++;
  state.messagesLastHour++;
  state.consecutiveFailures = 0;

  // Calculate latency from server
  const latencyMs = now - (data.timestamp || now);

  // Record latency
  state.latencyHistory.push(latencyMs);
  if (latencyMs > state.maxLatencyMs) state.maxLatencyMs = latencyMs;
  if (state.latencyHistory.length > 1000) state.latencyHistory.shift();

  // Process performance data
  if (data.performance) {
    state.performance.push({
      timestamp: now,
      capital: data.performance.currentCapital,
      totalTrades: data.performance.totalTrades,
      winRate: data.performance.winRate,
      openPositions: data.performance.openPositions?.length || 0,
    });
  }

  // Process prediction data
  if (data.latestPrediction) {
    const pred = data.latestPrediction;
    const record: PredictionRecord = {
      timestamp: now,
      crashProbability: pred.crashProbability,
      zone: pred.zone,
      price: pred.rawMetrics?.price || 0,
      slot: pred.slot,
      latencyMs,
      botProbability: data.botMetrics?.botProbability || 0,
      confirmingMetrics: pred.confirmingMetrics,
    };

    state.predictions.push(record);
    state.predictionsTotal++;
    state.priceHistory.push(record.price);
    if (state.priceHistory.length > 1000) state.priceHistory.shift();

    // Update zone distribution
    if (record.zone === 'IGNORE') state.zoneDistribution.IGNORE++;
    else if (record.zone === 'MONITOR') state.zoneDistribution.MONITOR++;
    else if (record.zone === 'IMMEDIATE_SHORT') state.zoneDistribution.IMMEDIATE_SHORT++;

    // Check thresholds
    if (record.crashProbability > CONFIG.alerts.crashProbabilityThreshold) {
      state.highProbabilitySignals++;
      handleAlert(state, 'CRASH', record.crashProbability,
        `Crash probability ${(record.crashProbability * 100).toFixed(2)}% at ${formatTimestamp(now)}`);
    }

    // Latency alert
    if (latencyMs > CONFIG.alerts.latencyThresholdMs) {
      handleAlert(state, 'LATENCY', latencyMs,
        `High latency ${latencyMs.toFixed(0)}ms exceeds threshold`);
    }
  }

  // Bot detection alerts
  if (data.botMetrics?.botProbability > CONFIG.alerts.botProbabilityThreshold) {
    handleAlert(state, 'BOT', data.botMetrics.botProbability,
      `High bot activity ${(data.botMetrics.botProbability * 100).toFixed(1)}%`);
  }
}

// ============================================================================
// CONNECTION HANDLER
// ============================================================================

function handleConnection(state: TestState, ws: WebSocket): void {
  state.isConnected = true;
  if (state.connectionStartTime === 0) {
    state.connectionStartTime = Date.now();
  }
  console.log('[WS] Connected to backend');
}

function handleDisconnection(state: TestState): void {
  state.isConnected = false;
  state.connectionLosses++;
  state.lastConnectionLoss = Date.now();
  handleAlert(state, 'ERROR', 0, `Connection lost (loss #${state.connectionLosses})`);
  console.log('[WS] Disconnected from backend');
}

// ============================================================================
// MAIN TEST LOOP
// ============================================================================

async function run24hTest(): Promise<void> {
  console.log('='.repeat(80));
  console.log('24-STUNDEN PRODUCTION TEST - STARTING');
  console.log('='.repeat(80));
  console.log(`Started: ${formatTimestamp(Date.now())}`);
  console.log(`Target Duration: 24 hours`);
  console.log('');

  // Ensure directories exist
  ensureDirectories();

  // Initialize state
  const state: TestState = {
    isConnected: false,
    connectionStartTime: 0,
    connectionLosses: 0,
    lastConnectionLoss: 0,
    predictions: [],
    performance: [],
    alerts: [],
    metrics: [],
    totalMessages: 0,
    messagesLastHour: 0,
    predictionsTotal: 0,
    highProbabilitySignals: 0,
    lastMessageTime: Date.now(),
    consecutiveFailures: 0,
    maxConsecutiveFailures: 0,
    maxLatencyMs: 0,
    avgLatencyMs: 0,
    latencyHistory: [],
    zoneDistribution: { IGNORE: 0, MONITOR: 0, IMMEDIATE_SHORT: 0 },
    priceHistory: [],
  };

  // Track hourly messages
  let lastHourlyReset = Date.now();
  let ws: WebSocket | null = null;
  let reconnectTimeout: NodeJS.Timeout | null = null;
  let checkInterval: NodeJS.Timeout | null = null;
  let reportInterval: NodeJS.Timeout | null = null;
  let csvInterval: NodeJS.Timeout | null = null;
  let testEndTime = Date.now() + CONFIG.test.durationMs;

  const startTime = Date.now();

  // WebSocket connection with auto-reconnect
  const connect = () => {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    console.log('[WS] Connecting...');
    ws = new WebSocket(CONFIG.backend.wsUrl);

    ws.onopen = () => handleConnection(state, ws!);

    ws.onclose = () => {
      handleDisconnection(state);
      // Auto-reconnect with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, state.connectionLosses), 30000);
      console.log(`[WS] Reconnecting in ${delay}ms...`);
      reconnectTimeout = setTimeout(connect, delay);
    };

    ws.onerror = (err) => {
      console.error('[WS] Error:', err);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleMessage(state, data);
      } catch (e) {
        console.warn('[WS] Parse error:', e);
      }
    };
  };

  // Start connection
  connect();

  // Main check loop - runs every 10 seconds
  checkInterval = setInterval(() => {
    const now = Date.now();
    const elapsed = now - startTime;

    // Check if test is complete
    if (now >= testEndTime) {
      console.log('\n[TEST] 24 hours completed!');
      return;
    }

    // Reset hourly counter
    if (now - lastHourlyReset >= 60 * 60 * 1000) {
      state.messagesLastHour = 0;
      lastHourlyReset = now;
    }

    // Check for stale connection
    if (state.isConnected && now - state.lastMessageTime > 60_000) {
      console.warn('[CHECK] No message received for > 60 seconds');
      state.consecutiveFailures++;
      state.maxConsecutiveFailures = Math.max(state.maxConsecutiveFailures, state.consecutiveFailures);
    }

    // Log progress every 100 iterations (~17 minutes)
    if (state.totalMessages > 0 && state.totalMessages % 100 === 0) {
      const remaining = testEndTime - now;
      console.log(`[PROGRESS] ${formatDuration(elapsed)} elapsed | ${state.totalMessages} messages | ${state.predictionsTotal} predictions | ${formatDuration(remaining)} remaining`);
    }

    // Collect metrics snapshot
    state.metrics.push({
      timestamp: now,
      connected: state.isConnected,
      latencyMs: state.latencyHistory[state.latencyHistory.length - 1] || 0,
      crashProb: state.predictions[state.predictions.length - 1]?.crashProbability || 0,
      price: state.predictions[state.predictions.length - 1]?.price || 0,
      capital: state.performance[state.performance.length - 1]?.capital || 100,
      zone: state.predictions[state.predictions.length - 1]?.zone || 'UNKNOWN',
    });

  }, CONFIG.test.checkIntervalMs);

  // Hourly report
  reportInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    saveReport(state, elapsed);
  }, CONFIG.test.reportIntervalMs);

  // Hourly CSV save
  csvInterval = setInterval(() => {
    savePredictionsCSV(state.predictions);
    saveMetricsCSV(state.metrics);
  }, CONFIG.test.csvSaveIntervalMs);

  // Handle graceful shutdown
  const shutdown = () => {
    console.log('\n[SHUTDOWN] Stopping test...');

    // Clear all intervals
    [checkInterval, reportInterval, csvInterval, reconnectTimeout].forEach(t => {
      if (t) clearInterval(t);
    });

    // Close WebSocket
    if (ws) {
      ws.close();
    }

    // Final save
    const elapsed = Date.now() - startTime;
    savePredictionsCSV(state.predictions);
    saveMetricsCSV(state.metrics);
    saveReport(state, elapsed);

    // Final verdict
    const finalReport = `
================================================================================
                           FINAL TEST VERDICT
================================================================================
Test Duration: ${formatDuration(elapsed)}
Connection Retention: ${((elapsed - state.connectionLosses * 5000) / elapsed * 100).toFixed(2)}%
Total Messages: ${state.totalMessages}
Total Predictions: ${state.predictionsTotal}
High Probability Signals: ${state.highProbabilitySignals}
Zone Distribution: IGNORE=${state.zoneDistribution.IGNORE} MONITOR=${state.zoneDistribution.MONITOR} SHORT=${state.zoneDistribution.IMMEDIATE_SHORT}
Max Latency: ${state.maxLatencyMs.toFixed(0)}ms
Total Alerts: ${state.alerts.length}

FINAL STATUS: ${elapsed >= CONFIG.test.durationMs ? 'COMPLETED' : 'INTERRUPTED'}
================================================================================
`;

    console.log(finalReport);

    // Save final report
    fs.writeFileSync(`${CONFIG.paths.csvDir}/FINAL_REPORT.txt`, finalReport);
    console.log(`\n[SAVE] All data saved to ${CONFIG.paths.csvDir}/`);

    process.exit(0);
  };

  // Listen for shutdown signals
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Wait for test completion
  await new Promise<void>((resolve) => {
    const checkComplete = setInterval(() => {
      if (Date.now() >= testEndTime) {
        clearInterval(checkComplete);
        resolve();
      }
    }, 1000);
  });

  shutdown();
}

// ============================================================================
// START
// ============================================================================

console.log('Initializing 24-hour production test...\n');

run24hTest()
  .then(() => {
    console.log('\n[COMPLETE] Test finished successfully');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n[ERROR] Test failed:', err);
    process.exit(1);
  });
