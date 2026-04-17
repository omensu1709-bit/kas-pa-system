/**
 * KAS PA - 30 MINUTEN STABILITÄTSTEST
 * Überwacht das System kontinuierlich für 30 Minuten
 */

import { WebSocket } from 'ws';
import { writeFileSync, appendFileSync } from 'fs';

const DURATION_MS = 30 * 60 * 1000; // 30 Minuten
const CHECK_INTERVAL_MS = 30 * 1000; // Alle 30 Sekunden
const REPORT_FILE = '/data/trinity_apex/logs/stability-test-30min.json';
const CSV_FILE = '/data/trinity_apex/logs/stability-30min.csv';

interface Metrics {
  timestamp: Date;
  crashProbability: number;
  price: number;
  slot: number;
  latency: number;
  botProbability: number;
  zone: string;
  capital: number;
  connected: boolean;
}

const metrics: Metrics[] = [];
let ws: WebSocket | null = null;
let checkCount = 0;
let disconnectedCount = 0;
let errors: string[] = [];

function log(msg: string) {
  const time = new Date().toISOString();
  console.log(`[${time.split('T')[1].split('.')[0]}] ${msg}`);
  appendFileSync('/data/trinity_apex/logs/stability-test.log', `[${time}] ${msg}\n`);
}

async function runStabilityTest(): Promise<void> {
  const startTime = Date.now();
  const endTime = startTime + DURATION_MS;

  console.log('\n' + '╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(15) + 'KAS PA - 30 MINUTEN STABILITÄTSTEST' + ' '.repeat(17) + '║');
  console.log('╚' + '═'.repeat(68) + '╝\n');
  console.log(`  Start: ${new Date(startTime).toISOString()}`);
  console.log(`  Ende: ${new Date(endTime).toISOString()}`);
  console.log(`  Prüfintervall: ${CHECK_INTERVAL_MS / 1000}s\n`);

  // CSV Header
  let csvContent = 'timestamp,crashProbability,price,slot,latency_ms,botProbability,zone,capital,connected\n';

  const check = (): Promise<void> => {
    return new Promise((resolve) => {
      const now = Date.now();
      const elapsed = Math.floor((now - startTime) / 1000);
      const remaining = Math.floor((endTime - now) / 1000);

      checkCount++;
      console.log(`\n--- Check #${checkCount} (${elapsed}s / ${remaining}s remaining) ---`);

      if (!ws || ws.readyState !== WebSocket.OPEN) {
        disconnectedCount++;
        log('⚠️ WebSocket disconnected, reconnecting...');
        connect();
        resolve();
        return;
      }

      const metric: Metrics = {
        timestamp: new Date(),
        crashProbability: 0,
        price: 0,
        slot: 0,
        latency: 0,
        botProbability: 0,
        zone: 'UNKNOWN',
        capital: 0,
        connected: true
      };

      ws.once('message', (data) => {
        const msg = JSON.parse(data.toString());

        if (msg.latestPrediction) {
          metric.crashProbability = msg.latestPrediction.crashProbability;
          metric.price = msg.latestPrediction.rawMetrics?.price || 0;
          metric.slot = msg.latestPrediction.slot;
          metric.zone = msg.latestPrediction.zone;
        }

        if (msg.latencyStats) {
          metric.latency = msg.latencyStats.current;
        }

        if (msg.botMetrics) {
          metric.botProbability = msg.botMetrics.botProbability;
        }

        if (msg.performance) {
          metric.capital = msg.performance.currentCapital;
        }

        metric.connected = true;
        metrics.push(metric);

        // CSV Zeile
        csvContent += `${metric.timestamp.toISOString()},${metric.crashProbability},${metric.price},${metric.slot},${metric.latency},${metric.botProbability},${metric.zone},${metric.capital},${metric.connected}\n`;

        // Status output
        console.log(`  ✅ Connected: ${metric.connected}`);
        console.log(`  📊 P(crash): ${(metric.crashProbability * 100).toFixed(2)}%`);
        console.log(`  💰 Price: $${metric.price.toFixed(2)}`);
        console.log(`  📍 Slot: ${metric.slot}`);
        console.log(`  ⏱️  Latency: ${metric.latency}ms`);
        console.log(`  🤖 Bot: ${(metric.botProbability * 100).toFixed(0)}%`);
        console.log(`  💼 Capital: ${metric.capital.toFixed(2)} SOL`);
        console.log(`  🚦 Zone: ${metric.zone}`);

        // Save CSV
        writeFileSync(CSV_FILE, csvContent);

        resolve();
      });

      ws.once('error', (e) => {
        log(`⚠️ WebSocket Error: ${e.message}`);
        metric.connected = false;
        metrics.push(metric);
        csvContent += `${metric.timestamp.toISOString()},${metric.crashProbability},${metric.price},${metric.slot},${metric.latency},${metric.botProbability},${metric.zone},${metric.capital},${metric.connected}\n`;
        writeFileSync(CSV_FILE, csvContent);
        connect();
        resolve();
      });
    });
  };

  const connect = () => {
    if (ws) {
      try { ws.close(); } catch {}
    }

    ws = new WebSocket('ws://localhost:8080');

    ws.on('open', () => {
      log('✅ WebSocket connected');
    });

    ws.on('close', () => {
      log('⚠️ WebSocket closed');
    });

    ws.on('error', (e) => {
      log(`⚠️ WebSocket error: ${e.message}`);
    });
  };

  // Connect
  connect();

  // Run checks until time is up
  while (Date.now() < endTime) {
    await check();
    await new Promise(r => setTimeout(r, CHECK_INTERVAL_MS));
  }

  // Final report
  console.log('\n' + '='.repeat(70));
  console.log('                         STABILITÄTSTEST ERGEBNIS');
  console.log('='.repeat(70));

  const connectedChecks = metrics.filter(m => m.connected).length;
  const disconnectedChecks = metrics.filter(m => !m.connected).length;
  const avgLatency = metrics.reduce((a, m) => a + m.latency, 0) / metrics.length;
  const maxLatency = Math.max(...metrics.map(m => m.latency));
  const minLatency = Math.min(...metrics.map(m => m.latency));
  const avgCrashProb = metrics.reduce((a, m) => a + m.crashProbability, 0) / metrics.length;

  console.log(`\n  Gesamtzeit: ${DURATION_MS / 60000} Minuten`);
  console.log(`  Gesamte Checks: ${checkCount}`);
  console.log(`  Verbunden: ${connectedChecks}`);
  console.log(`  Getrennt: ${disconnectedChecks}`);
  console.log(`  Verbindungserhaltung: ${((connectedChecks / checkCount) * 100).toFixed(1)}%`);
  console.log(`\n  Latenz (Durchschnitt): ${avgLatency.toFixed(0)}ms`);
  console.log(`  Latenz (Max): ${maxLatency}ms`);
  console.log(`  Latenz (Min): ${minLatency}ms`);
  console.log(`\n  Crash Probability (Durchschnitt): ${(avgCrashProb * 100).toFixed(2)}%`);
  console.log(`  Crash Probability (Max): ${(Math.max(...metrics.map(m => m.crashProbability)) * 100).toFixed(2)}%`);

  // Save full report
  const report = {
    testDuration: DURATION_MS,
    testStart: new Date(startTime).toISOString(),
    testEnd: new Date().toISOString(),
    totalChecks: checkCount,
    connectedChecks,
    disconnectedChecks,
    connectionRetention: (connectedChecks / checkCount) * 100,
    latency: {
      avg: avgLatency,
      max: maxLatency,
      min: minLatency
    },
    crashProbability: {
      avg: avgCrashProb,
      max: Math.max(...metrics.map(m => m.crashProbability))
    },
    metrics,
    verdict: disconnectedChecks < checkCount * 0.1 ? 'PASS' : 'FAIL'
  };

  writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  console.log(`\n  📄 Bericht: ${REPORT_FILE}`);
  console.log(`  📄 CSV: ${CSV_FILE}`);

  console.log('\n' + '='.repeat(70));

  if (report.verdict === 'PASS') {
    console.log('\n  🎉 STABILITÄTSTEST BESTANDEN!');
    console.log('  ✅ System ist stabil genug für 24-Stunden Produktionstest\n');
  } else {
    console.log('\n  ⚠️ STABILITÄTSTEST FEHLGESCHLAGEN');
    console.log('  ❌ Verbindungsausfälle zu hoch\n');
  }

  console.log('='.repeat(70) + '\n');

  ws?.close();
  process.exit(0);
}

runStabilityTest().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
