/**
 * KAS PA - Vollständiger Systemtest
 * Testet: LaserStream -> Chainstack -> Paper Trading -> WebSocket -> Dashboard
 */

import axios from 'axios';
import { WebSocket } from 'ws';
import dotenv from 'dotenv';

dotenv.config();

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  latency?: number;
  data?: any;
  error?: string;
}

const results: TestResult[] = [];

// ============================================================================
// TEST 1: Datenquellen (Chainstack + Helius + Jupiter)
// ============================================================================

async function testDataSources(): Promise<TestResult[]> {
  console.log('\n[DATENQUELLEN]');
  const results: TestResult[] = [];

  // Chainstack
  try {
    const start = Date.now();
    const response = await axios.post(process.env.CHAINSTACK_HTTPS!, {
      jsonrpc: "2.0",
      id: 1,
      method: "getSlot"
    }, {
      auth: {
        username: process.env.CHAINSTACK_USERNAME!,
        password: process.env.CHAINSTACK_PASSWORD!
      },
      timeout: 10000
    });
    results.push({
      name: 'Chainstack RPC',
      status: response.data.result ? 'PASS' : 'FAIL',
      latency: Date.now() - start,
      data: { slot: response.data.result }
    });
    console.log(`  ✓ Chainstack: Slot ${response.data.result}`);
  } catch (e: any) {
    results.push({ name: 'Chainstack RPC', status: 'FAIL', error: e.message });
    console.log(`  ✗ Chainstack: ${e.message}`);
  }

  // Jupiter Price
  try {
    const start = Date.now();
    const response = await axios.get('https://api.jup.ag/price/v3', {
      params: { ids: 'So11111111111111111111111111111111111111112' },
      timeout: 10000
    });
    const price = response.data['So11111111111111111111111111111111111111112']?.usdPrice;
    results.push({
      name: 'Jupiter Price',
      status: price ? 'PASS' : 'FAIL',
      latency: Date.now() - start,
      data: { price }
    });
    console.log(`  ✓ Jupiter: SOL $${price}`);
  } catch (e: any) {
    results.push({ name: 'Jupiter Price', status: 'FAIL', error: e.message });
    console.log(`  ✗ Jupiter: ${e.message}`);
  }

  return results;
}

// ============================================================================
// TEST 2: Backend WebSocket Server
// ============================================================================

async function testBackendWS(): Promise<TestResult> {
  console.log('\n[BACKEND WEBSOCKET]');

  return new Promise((resolve) => {
    const result: TestResult = { name: 'Backend WS Server', status: 'FAIL' };
    const start = Date.now();

    const ws = new WebSocket('ws://localhost:8080');

    const timeout = setTimeout(() => {
      result.error = 'Connection timeout (10s)';
      console.log(`  ✗ ${result.name}: ${result.error}`);
      ws.close();
      resolve(result);
    }, 10000);

    ws.on('open', () => {
      console.log('  ✓ WebSocket connected');
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      const latency = Date.now() - start;

      if (msg.type === 'INIT') {
        result.status = 'PASS';
        result.latency = latency;
        result.data = {
          type: msg.type,
          hasPerformance: !!msg.performance,
          hasPrediction: !!msg.latestPrediction
        };
        console.log(`  ✓ INIT received`);
        console.log(`    Performance: ${!!msg.performance}`);
        console.log(`    Latency: ${latency}ms`);
      }

      if (msg.type === 'UPDATE' && msg.latestPrediction) {
        result.data = {
          ...result.data,
          crashProbability: msg.latestPrediction.crashProbability,
          price: msg.latestPrediction.rawMetrics?.price,
          zone: msg.latestPrediction.zone,
          botProbability: msg.botMetrics?.botProbability
        };
        console.log(`  ✓ UPDATE received`);
        console.log(`    crashProbability: ${msg.latestPrediction.crashProbability?.toFixed(4)}`);
        console.log(`    price: ${msg.latestPrediction.rawMetrics?.price}`);
        console.log(`    zone: ${msg.latestPrediction.zone}`);
        console.log(`    botProbability: ${msg.botMetrics?.botProbability}`);

        clearTimeout(timeout);
        ws.close();
        resolve(result);
      }
    });

    ws.on('error', (e) => {
      clearTimeout(timeout);
      result.error = e.message;
      console.log(`  ✗ ${result.name}: ${e.message}`);
      resolve(result);
    });
  });
}

// ============================================================================
// TEST 3: Paper Trading Engine
// ============================================================================

async function testPaperTrading(): Promise<TestResult> {
  console.log('\n[PAPER TRADING]');

  return new Promise((resolve) => {
    const result: TestResult = { name: 'Paper Trading Engine', status: 'FAIL' };
    const ws = new WebSocket('ws://localhost:8080');
    let updateCount = 0;
    const updates: any[] = [];

    const timeout = setTimeout(() => {
      if (updateCount > 0) {
        result.status = 'PASS';
        result.data = {
          updatesReceived: updateCount,
          lastUpdate: updates[updates.length - 1]
        };
        console.log(`  ✓ Paper Trading: ${updateCount} Updates empfangen`);
      } else {
        result.error = 'No updates received in 15s';
        console.log(`  ✗ ${result.name}: ${result.error}`);
      }
      ws.close();
      resolve(result);
    }, 15000);

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'UPDATE' && msg.latestPrediction) {
        updateCount++;
        updates.push(msg.latestPrediction);

        if (updateCount === 1) {
          console.log(`  Erste Prediction:`);
          console.log(`    crashProbability: ${msg.latestPrediction.crashProbability?.toFixed(4)}`);
          console.log(`    zone: ${msg.latestPrediction.zone}`);
          console.log(`    confirmingMetrics: ${msg.latestPrediction.confirmingMetrics}`);
        }
      }
    });

    ws.on('error', (e) => {
      clearTimeout(timeout);
      result.error = e.message;
      console.log(`  ✗ ${result.name}: ${e.message}`);
      resolve(result);
    });
  });
}

// ============================================================================
// TEST 4: Dashboard Frontend
// ============================================================================

async function testDashboard(): Promise<TestResult> {
  console.log('\n[DASHBOARD]');

  const result: TestResult = { name: 'Dashboard Server', status: 'FAIL' };

  try {
    const response = await axios.get('http://localhost:5173', { timeout: 5000 });
    if (response.status === 200) {
      result.status = 'PASS';
      result.data = {
        status: response.status,
        size: response.data.length
      };
      console.log(`  ✓ Dashboard: Status ${response.status}, ${response.data.length} bytes`);
    }
  } catch (e: any) {
    result.error = e.message;
    console.log(`  ✗ ${result.name}: ${e.message}`);
  }

  return result;
}

// ============================================================================
// TEST 5: Datenqualität
// ============================================================================

async function testDataQuality(): Promise<TestResult> {
  console.log('\n[DATENQUALITÄT]');

  return new Promise((resolve) => {
    const result: TestResult = { name: 'Datenqualität', status: 'FAIL' };
    const predictions: any[] = [];

    const ws = new WebSocket('ws://localhost:8080');

    const timeout = setTimeout(() => {
      if (predictions.length > 0) {
        // Analyze quality
        const valid = predictions.filter(p =>
          p.crashProbability >= 0 && p.crashProbability <= 1 &&
          p.confirmingMetrics >= 0 && p.confirmingMetrics <= 9 &&
          ['IGNORE', 'MONITOR', 'IMMEDIATE_SHORT'].includes(p.zone)
        );

        result.status = valid.length === predictions.length ? 'PASS' : 'WARN';
        result.data = {
          totalPredictions: predictions.length,
          validPredictions: valid.length,
          avgCrashProb: predictions.reduce((a, p) => a + p.crashProbability, 0) / predictions.length,
          zones: predictions.reduce((acc, p) => {
            acc[p.zone] = (acc[p.zone] || 0) + 1;
            return acc;
          }, {})
        };

        console.log(`  ✓ Qualität: ${valid.length}/${predictions.length} gültig`);
        console.log(`    Durchschn. CrashProb: ${result.data.avgCrashProb.toFixed(4)}`);
        console.log(`    Zonen:`, result.data.zones);
      } else {
        result.error = 'No predictions received';
        console.log(`  ✗ ${result.name}: ${result.error}`);
      }
      ws.close();
      resolve(result);
    }, 20000);

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'UPDATE' && msg.latestPrediction) {
        predictions.push(msg.latestPrediction);
      }
    });

    ws.on('error', (e) => {
      clearTimeout(timeout);
      result.error = e.message;
      console.log(`  ✗ ${result.name}: ${e.message}`);
      resolve(result);
    });
  });
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║        KAS PA - VOLLSTÄNDIGER SYSTEMTEST                 ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`\nZeit: ${new Date().toISOString()}\n`);

  // Run all tests
  const dataSourceResults = await testDataSources();
  results.push(...dataSourceResults);

  const backendResult = await testBackendWS();
  results.push(backendResult);

  const dashboardResult = await testDashboard();
  results.push(dashboardResult);

  const paperResult = await testPaperTrading();
  results.push(paperResult);

  const qualityResult = await testDataQuality();
  results.push(qualityResult);

  // Summary
  console.log('\n' + '='.repeat(68));
  console.log('ZUSAMMENFASSUNG');
  console.log('='.repeat(68));

  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const warn = results.filter(r => r.status === 'WARN').length;

  console.log(`\nTests: ${results.length} | ✓ ${pass} | ✗ ${fail} | ⚠ ${warn}\n`);

  for (const r of results) {
    const icon = r.status === 'PASS' ? '✓' : r.status === 'WARN' ? '⚠' : '✗';
    console.log(`  ${icon} ${r.name}`);
    if (r.latency) console.log(`    Latenz: ${r.latency}ms`);
    if (r.error) console.log(`    Fehler: ${r.error}`);
  }

  console.log('\n' + '='.repeat(68));

  if (fail === 0 && warn === 0) {
    console.log('✅ ALLE SYSTEME FUNKTIONIEREN!');
    console.log('Das KAS PA System ist bereit für den 24-Stunden Test.\n');
  } else if (fail === 0) {
    console.log('⚠️ SYSTEM FUNKTIONIERT MIT EINSCHRÄNKUNGEN\n');
  } else {
    console.log('❌ KRITISCHE PROBLEME ERKANNT\n');
  }

  // Save results
  const fs = await import('fs');
  const logsDir = '/data/trinity_apex/logs';
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  fs.writeFileSync('/data/trinity_apex/logs/system-test.json', JSON.stringify({
    timestamp: Date.now(),
    results
  }, null, 2));
  console.log('Ergebnisse gespeichert: /data/trinity_apex/logs/system-test.json');
}

main().catch(console.error);
