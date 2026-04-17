/**
 * KAS PA - Dashboard Funktionalitäts-Test
 * Testet den kompletten Datenfluss: Backend -> WebSocket -> Frontend -> Perspective
 */

import axios from 'axios';
import dotenv from 'dotenv';
import { WebSocket } from 'ws';

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
// TEST 1: Backend Prozess prüfen
// ============================================================================

async function testBackendProcess(): Promise<TestResult> {
  console.log('\n[TEST 1] Backend WebSocket Server...');

  const result: TestResult = { name: 'Backend WS Server', status: 'FAIL' };

  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:8080');
    const timeout = setTimeout(() => {
      ws.close();
      result.error = 'Connection timeout (5s)';
      console.log(`  ✗ ${result.name}: FAIL - ${result.error}`);
      resolve(result);
    }, 5000);

    ws.on('open', () => {
      clearTimeout(timeout);
      result.status = 'PASS';
      console.log(`  ✓ ${result.name}: PASS - Connected to ws://localhost:8080`);

      // Wait for first message
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          result.data = {
            type: msg.type,
            hasPerformance: !!msg.performance,
            hasLatestPrediction: !!msg.latestPrediction,
            hasLatencyStats: !!msg.latencyStats,
            hasBotMetrics: !!msg.botMetrics,
          };
          console.log(`    Received: ${msg.type}`);
          console.log(`    Performance: ${!!msg.performance}`);
          console.log(`    Prediction: ${!!msg.latestPrediction}`);
          console.log(`    Latency: ${!!msg.latencyStats}`);
          console.log(`    BotMetrics: ${!!msg.botMetrics}`);
        } catch (e) {
          result.error = 'Failed to parse message';
        }
        ws.close();
        resolve(result);
      });
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      result.error = err.message;
      console.log(`  ✗ ${result.name}: FAIL - ${result.error}`);
      resolve(result);
    });
  });
}

// ============================================================================
// TEST 2: Frontend Dev Server
// ============================================================================

async function testFrontendServer(): Promise<TestResult> {
  console.log('\n[TEST 2] Frontend Dev Server...');

  const result: TestResult = { name: 'Frontend Server', status: 'FAIL' };

  try {
    const response = await axios.get('http://localhost:5173', {
      timeout: 5000,
      headers: {
        'Origin': 'http://localhost:5173'
      }
    });

    if (response.status === 200) {
      result.status = 'PASS';
      result.data = {
        statusCode: response.status,
        contentLength: response.data?.length || 0,
      };
      console.log(`  ✓ ${result.name}: PASS - Status ${response.status}, Size: ${result.data.contentLength} bytes`);
    } else {
      result.error = `Status ${response.status}`;
      console.log(`  ✗ ${result.name}: FAIL - ${result.error}`);
    }
  } catch (error: any) {
    result.error = error.message;
    console.log(`  ✗ ${result.name}: FAIL - ${result.error}`);
  }

  return result;
}

// ============================================================================
// TEST 3: CORS Headers
// ============================================================================

async function testCorsHeaders(): Promise<TestResult> {
  console.log('\n[TEST 3] CORS Headers (Required for WASM)...');

  const result: TestResult = { name: 'CORS Headers', status: 'FAIL' };

  try {
    const response = await axios.get('http://localhost:5173', { timeout: 5000 });

    const coep = response.headers['cross-origin-embedder-policy'];
    const coop = response.headers['cross-origin-opener-policy'];

    if (coep === 'require-corp' && coop === 'same-origin') {
      result.status = 'PASS';
      result.data = { coep, coop };
      console.log(`  ✓ ${result.name}: PASS`);
      console.log(`    COEP: ${coep}`);
      console.log(`    COOP: ${coop}`);
    } else {
      result.error = `COEP: ${coep || 'missing'}, COOP: ${coop || 'missing'}`;
      console.log(`  ✗ ${result.name}: FAIL - ${result.error}`);
    }
  } catch (error: any) {
    result.error = error.message;
    console.log(`  ✗ ${result.name}: FAIL - ${result.error}`);
  }

  return result;
}

// ============================================================================
// TEST 4: WebSocket Data Flow (Full Cycle)
// ============================================================================

async function testWebSocketDataFlow(): Promise<TestResult> {
  console.log('\n[TEST 4] WebSocket Data Flow...');

  const result: TestResult = { name: 'WS Data Flow', status: 'FAIL' };

  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:8080');
    let messageCount = 0;
    const timeout = setTimeout(() => {
      if (messageCount > 0) {
        result.status = 'PASS';
        result.data = { messagesReceived: messageCount };
        console.log(`  ✓ ${result.name}: PASS - Received ${messageCount} messages`);
      } else {
        result.error = 'No messages received in 10s';
        console.log(`  ✗ ${result.name}: FAIL - ${result.error}`);
      }
      ws.close();
      resolve(result);
    }, 10000);

    ws.on('open', () => {
      console.log('  Connected, waiting for data...');
    });

    ws.on('message', (data) => {
      messageCount++;
      try {
        const msg = JSON.parse(data.toString());

        // Validate message structure for Perspective
        const isValid = msg.type &&
          msg.performance &&
          msg.latestPrediction &&
          msg.latencyStats;

        console.log(`    Message #${messageCount}: ${msg.type}`);
        console.log(`      - Performance: ${!!msg.performance}`);
        console.log(`      - Prediction: ${!!msg.latestPrediction}`);
        console.log(`        * crashProbability: ${msg.latestPrediction?.crashProbability}`);
        console.log(`        * zone: ${msg.latestPrediction?.zone}`);
        console.log(`        * rawMetrics.price: ${msg.latestPrediction?.rawMetrics?.price}`);
        console.log(`      - LatencyStats: ${!!msg.latencyStats}`);
        console.log(`        * current: ${msg.latencyStats?.current}ms`);
        console.log(`      - BotMetrics: ${!!msg.botMetrics}`);
        console.log(`        * botProbability: ${msg.botMetrics?.botProbability}`);

        // Check if data is suitable for Perspective
        if (!msg.latestPrediction?.rawMetrics?.price) {
          console.log(`      ⚠️ WARNING: price is missing for Perspective!`);
        }
      } catch (e) {
        console.log(`    Parse error: ${e}`);
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      result.error = err.message;
      console.log(`  ✗ ${result.name}: FAIL - ${result.error}`);
      resolve(result);
    });
  });
}

// ============================================================================
// TEST 5: API Connections
// ============================================================================

async function testApiConnections(): Promise<TestResult[]> {
  console.log('\n[TEST 5] API Connections...');

  const results: TestResult[] = [];

  // Chainstack
  try {
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
      data: { slot: response.data.result }
    });
    console.log(`  ✓ Chainstack: Slot ${response.data.result}`);
  } catch (e: any) {
    results.push({ name: 'Chainstack RPC', status: 'FAIL', error: e.message });
    console.log(`  ✗ Chainstack: ${e.message}`);
  }

  // Jupiter
  try {
    const response = await axios.get('https://api.jup.ag/price/v3', {
      params: { ids: 'So11111111111111111111111111111111111111112' },
      timeout: 10000
    });

    const solPrice = response.data['So11111111111111111111111111111111111111112']?.usdPrice;
    results.push({
      name: 'Jupiter Price',
      status: solPrice ? 'PASS' : 'FAIL',
      data: { solPrice }
    });
    console.log(`  ✓ Jupiter: SOL $${solPrice}`);
  } catch (e: any) {
    results.push({ name: 'Jupiter Price', status: 'FAIL', error: e.message });
    console.log(`  ✗ Jupiter: ${e.message}`);
  }

  // Helius
  try {
    const response = await axios.post(
      'https://api-mainnet.helius-rpc.com/v0/transactions',
      { transactions: ['dummy'] },
      { params: { 'api-key': process.env.HELIUS_API_KEY }, timeout: 10000 }
    );

    results.push({
      name: 'Helius Enhanced',
      status: response.status === 200 ? 'PASS' : 'FAIL',
      data: { status: response.status }
    });
    console.log(`  ✓ Helius: Status ${response.status}`);
  } catch (e: any) {
    results.push({ name: 'Helius Enhanced', status: 'FAIL', error: e.message });
    console.log(`  ✗ Helius: ${e.message}`);
  }

  return results;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║     KAS PA - DASHBOARD FUNKTIONALITÄTS-TEST                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`\nTime: ${new Date().toISOString()}`);

  // Run tests
  const backendResult = await testBackendProcess();
  results.push(backendResult);

  const frontendResult = await testFrontendServer();
  results.push(frontendResult);

  const corsResult = await testCorsHeaders();
  results.push(corsResult);

  const wsFlowResult = await testWebSocketDataFlow();
  results.push(wsFlowResult);

  const apiResults = await testApiConnections();
  results.push(...apiResults);

  // Summary
  console.log('\n' + '='.repeat(68));
  console.log('SUMMARY');
  console.log('='.repeat(68));

  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const warn = results.filter(r => r.status === 'WARN').length;

  console.log(`Total: ${results.length} | PASS: ${pass} | FAIL: ${fail} | WARN: ${warn}\n`);

  for (const r of results) {
    const icon = r.status === 'PASS' ? '✓' : r.status === 'WARN' ? '⚠' : '✗';
    console.log(`  ${icon} ${r.name}`);
    if (r.error) console.log(`    Error: ${r.error}`);
  }

  console.log('\n' + '='.repeat(68));

  if (fail === 0) {
    console.log('✅ ALLE TESTS ERFOLGREICH');
    console.log('Dashboard ist funktional!\n');
  } else {
    console.log(`⚠️ ${fail} TESTS FEHLGESCHLAGEN`);
    console.log('Bitte fehlende Komponenten starten:\n');

    if (!results.find(r => r.name === 'Backend WS Server' && r.status === 'PASS')) {
      console.log('  1. Backend starten:');
      console.log('     cd /data/trinity_apex/solana-stream/paper-trading');
      console.log('     npx tsx src/live-paper-trading.ts\n');
    }

    if (!results.find(r => r.name === 'Frontend Server' && r.status === 'PASS')) {
      console.log('  2. Frontend starten:');
      console.log('     cd /data/trinity_apex/solana-stream/dashboard');
      console.log('     npm run dev\n');
    }
  }

  // Save results
  const fs = await import('fs');
  const logsDir = '/data/trinity_apex/logs';
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  fs.writeFileSync('/data/trinity_apex/logs/dashboard-test.json', JSON.stringify({
    timestamp: Date.now(),
    results
  }, null, 2));
}

main().catch(console.error);
