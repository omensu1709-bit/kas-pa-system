/**
 * KAS PA - 24H TEST WATCHDOG
 * ============================================================
 * Prüft alle 30 Minuten ob der 24h-Test fehlerfrei läuft
 * Start: npx tsx scripts/24h-watchdog.ts
 */

import WebSocket from 'ws';
import axios from 'axios';
import fs from 'fs';

// ============================================================================
// CONFIG
// ============================================================================

const CONFIG = {
  wsUrl: process.env.WS_URL || 'ws://localhost:8080',
  checkIntervalMs: 30 * 60 * 1000, // 30 Minuten
  healthThreshold: {
    maxLatencyMs: 120_000,       // 120 Sekunden
    maxMessageAgeMs: 10 * 60_000, // 10 Minuten ohne Nachricht = Problem
    minMessagesPerCheck: 3,       // Mindestens 3 Nachrichten in 5s (~1msg/2s = OK)
  },
  paths: {
    logs: './logs/24h-watchdog',
    reports: './logs/24h-watchdog/reports',
    alerts: './logs/24h-watchdog/alerts',
  },
};

// ============================================================================
// TYPES
// ============================================================================

interface HealthStatus {
  timestamp: number;
  isHealthy: boolean;
  issues: string[];
  metrics: {
    latencyMs: number;
    messageAgeMs: number;
    messagesLastCheck: number;
    connectionStable: boolean;
    rankingFresh: boolean;
    predictionFresh: boolean;
  };
}

interface WatchdogReport {
  timestamp: number;
  uptime: number;
  checks: number;
  issues: string[];
  lastIssue: string | null;
  recommendations: string[];
}

// ============================================================================
// HELPERS
// ============================================================================

function ensureDirectories(): void {
  [CONFIG.paths.logs, CONFIG.paths.reports, CONFIG.paths.alerts].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString();
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}h ${minutes}m`;
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

async function performHealthCheck(): Promise<HealthStatus> {
  const status: HealthStatus = {
    timestamp: Date.now(),
    isHealthy: true,
    issues: [],
    metrics: {
      latencyMs: 0,
      messageAgeMs: 0,
      messagesLastCheck: 0,
      connectionStable: false,
      rankingFresh: false,
      predictionFresh: false,
    },
  };

  let ws: WebSocket | null = null;
  let messageCount = 0;
  let lastMessageTime = Date.now();
  let latestLatency = 0;
  let latestPrediction: any = null;
  let latestRanking: any = null;

  try {
    // Connect to WebSocket
    status.metrics.connectionStable = await new Promise((resolve) => {
      ws = new WebSocket(CONFIG.wsUrl);

      const timeout = setTimeout(() => {
        ws?.close();
        resolve(false);
      }, 10000);

      ws.onopen = () => {
        clearTimeout(timeout);
        resolve(true);
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        resolve(false);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          messageCount++;
          lastMessageTime = Date.now();

          // Capture latest data
          if (data.latencyStats?.current) {
            latestLatency = data.latencyStats.current;
          }
          if (data.latestPrediction) {
            latestPrediction = data.latestPrediction;
          }
          if (data.top10ShortTargets) {
            latestRanking = data.top10ShortTargets;
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => resolve(false);
    });

    if (!status.metrics.connectionStable) {
      status.isHealthy = false;
      status.issues.push('WebSocket connection failed');
      return status;
    }

    // Wait for a few messages
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Close connection
    ws?.close();

    // Calculate metrics
    status.metrics.latencyMs = latestLatency;
    status.metrics.messageAgeMs = Date.now() - lastMessageTime;
    status.metrics.messagesLastCheck = messageCount;
    status.metrics.predictionFresh = latestPrediction !== null;
    status.metrics.rankingFresh = latestRanking !== null;

    // Check thresholds
    if (latestLatency > CONFIG.healthThreshold.maxLatencyMs) {
      status.isHealthy = false;
      status.issues.push(`High latency: ${latestLatency}ms`);
    }

    if (status.metrics.messageAgeMs > CONFIG.healthThreshold.maxMessageAgeMs) {
      status.isHealthy = false;
      status.issues.push(`Stale data: ${status.metrics.messageAgeMs}ms since last message`);
    }

    if (messageCount < CONFIG.healthThreshold.minMessagesPerCheck) {
      status.isHealthy = false;
      status.issues.push(`Low message rate: only ${messageCount} messages in 5s`);
    }

  } catch (e: any) {
    status.isHealthy = false;
    status.issues.push(`Health check error: ${e.message}`);
  } finally {
    ws?.close();
  }

  return status;
}

// ============================================================================
// REPORTING
// ============================================================================

function saveReport(report: WatchdogReport): void {
  const file = `${CONFIG.paths.reports}/watchdog_${Date.now()}.txt`;
  const content = `
================================================================================
WATCHDOG REPORT - ${formatTimestamp(report.timestamp)}
================================================================================
Uptime: ${formatDuration(report.uptime)}
Total Checks: ${report.checks}
Issues Found: ${report.issues.length}

${report.issues.length > 0 ? 'ISSUES:\n' + report.issues.map(i => `  - ${i}`).join('\n') : 'No issues detected.'}

${report.recommendations.length > 0 ? 'RECOMMENDATIONS:\n' + report.recommendations.map(r => `  - ${r}`).join('\n') : ''}

================================================================================
`;
  fs.writeFileSync(file, content);
  console.log(`[Watchdog] Report saved: ${file}`);
}

function saveAlert(issue: string, severity: 'WARN' | 'CRITICAL'): void {
  const file = `${CONFIG.paths.alerts}/${severity.toLowerCase()}_${Date.now()}.txt`;
  fs.writeFileSync(file, `[${severity}] ${formatTimestamp(Date.now())}\n${issue}\n`);
  console.log(`[Watchdog] ALERT ({severity}): ${issue}`);
}

// ============================================================================
// WATCHDOG LOOP
// ============================================================================

async function runWatchdog(): Promise<void> {
  console.log('='.repeat(80));
  console.log('KAS PA - 24H TEST WATCHDOG');
  console.log('='.repeat(80));
  console.log(`Check Interval: ${CONFIG.checkIntervalMs / 60000} minutes`);
  console.log(`Started: ${formatTimestamp(Date.now())}`);
  console.log('');

  ensureDirectories();

  const startTime = Date.now();
  let checks = 0;
  const allIssues: string[] = [];
  let lastIssue: string | null = null;
  let consecutiveFailures = 0;
  let consecutiveSuccesses = 0;

  // Run first check immediately
  console.log('[Watchdog] Performing initial health check...');

  const runCheck = async () => {
    checks++;
    console.log(`\n[Watchdog] Health Check #${checks} at ${formatTimestamp(Date.now())}`);

    const status = await performHealthCheck();

    if (status.isHealthy) {
      consecutiveSuccesses++;
      consecutiveFailures = 0;
      console.log(`[Watchdog] Status: HEALTHY`);
      console.log(`  Latency: ${status.metrics.latencyMs}ms`);
      console.log(`  Messages: ${status.metrics.messagesLastCheck}`);
      console.log(`  Connection: ${status.metrics.connectionStable ? 'OK' : 'FAILED'}`);
      console.log(`  Predictions: ${status.metrics.predictionFresh ? 'Fresh' : 'Stale'}`);
      console.log(`  Ranking: ${status.metrics.rankingFresh ? 'Fresh' : 'Stale'}`);
    } else {
      consecutiveFailures++;
      consecutiveSuccesses = 0;
      console.log(`[Watchdog] Status: UNHEALTHY`);
      status.issues.forEach(issue => {
        console.log(`  [ISSUE] ${issue}`);
        allIssues.push(issue);
        lastIssue = issue;
        saveAlert(issue, issue.includes('connection') ? 'CRITICAL' : 'WARN');
      });
    }

    // Generate recommendations
    const recommendations: string[] = [];

    if (consecutiveFailures >= 3) {
      recommendations.push('3+ consecutive failures - consider restarting the backend');
    }

    if (status.metrics.latencyMs > 30000) {
      recommendations.push('High latency detected - check Chainstack API limits');
    }

    if (status.metrics.messagesLastCheck < 10) {
      recommendations.push('Low message rate - verify WebSocket connection');
    }

    // Save report every 6 checks (3 hours)
    if (checks % 6 === 0) {
      const report: WatchdogReport = {
        timestamp: Date.now(),
        uptime: Date.now() - startTime,
        checks,
        issues: [...allIssues],
        lastIssue,
        recommendations,
      };
      saveReport(report);
    }

    // Log summary
    const uptime = Date.now() - startTime;
    console.log(`\n[Watchdog] Summary after ${checks} checks (${formatDuration(uptime)}):`);
    console.log(`  Total Issues: ${allIssues.length}`);
    console.log(`  Consecutive Successes: ${consecutiveSuccesses}`);
    console.log(`  Consecutive Failures: ${consecutiveFailures}`);
  };

  // Run first check
  await runCheck();

  // Schedule periodic checks
  const interval = setInterval(async () => {
    await runCheck();
  }, CONFIG.checkIntervalMs);

  // Handle shutdown
  const shutdown = () => {
    console.log('\n[Watchdog] Shutting down...');
    clearInterval(interval);

    // Final report
    const finalReport: WatchdogReport = {
      timestamp: Date.now(),
      uptime: Date.now() - startTime,
      checks,
      issues: allIssues,
      lastIssue,
      recommendations: [
        consecutiveFailures > 0 ? 'Some checks failed - review alerts' : 'All checks passed',
      ],
    };
    saveReport(finalReport);

    console.log(`[Watchdog] Final report saved. Total uptime: ${formatDuration(finalReport.uptime)}`);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// ============================================================================
// START
// ============================================================================

console.log('Starting KAS PA 24H Test Watchdog...\n');

runWatchdog()
  .catch((err) => {
    console.error('[Watchdog] Fatal error:', err);
    process.exit(1);
  });
