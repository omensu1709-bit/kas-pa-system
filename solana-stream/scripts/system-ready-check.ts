/**
 * SYSTEM READY CHECK - PRE-24H-TEST VALIDATION
 * ============================================
 * Final check before starting the 24-hour production test
 */

import WebSocket from 'ws';
import axios from 'axios';

// ============================================================================
// CONFIG
// ============================================================================

const CONFIG = {
  wsUrl: process.env.WS_URL || 'ws://localhost:8080',
  chainstackRpc: process.env.CHAINSTACK_RPC || 'https://solana-mainnet.core.chainstack.com',
  jupiterPrice: 'https://api.jup.ag/price/v3',
  timeout: 10000,
};

// ============================================================================
// TESTS
// ============================================================================

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
  duration?: number;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<boolean>, warning = false): Promise<void> {
  const start = Date.now();
  try {
    const passed = await fn();
    const duration = Date.now() - start;
    results.push({
      name,
      status: passed ? 'PASS' : (warning ? 'WARN' : 'FAIL'),
      message: passed ? `OK (${duration}ms)` : 'Failed',
      duration,
    });
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name} (${duration}ms)`);
  } catch (e: any) {
    const duration = Date.now() - start;
    results.push({
      name,
      status: warning ? 'WARN' : 'FAIL',
      message: e.message || 'Error',
      duration,
    });
    console.log(`[FAIL] ${name}: ${e.message}`);
  }
}

// ============================================================================
// TEST SUITES
// ============================================================================

async function testChainstackConnection(): Promise<boolean> {
  try {
    const response = await axios.post(
      CONFIG.chainstackRpc,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'getSlot',
        params: [],
      },
      {
        auth: {
          username: 'friendly-mcclintock',
          password: 'armed-stamp-reuse-grudge-armful-script',
        },
        timeout: CONFIG.timeout,
      }
    );
    return response.data?.result > 0;
  } catch {
    return false;
  }
}

async function testJupiterPriceAPI(): Promise<boolean> {
  try {
    const response = await axios.get(CONFIG.jupiterPrice, {
      params: { ids: 'So11111111111111111111111111111111111111112' },
      timeout: CONFIG.timeout,
    });
    const data = response.data;
    const solPrice = data['So11111111111111111111111111111111111111112']?.usdPrice;
    return solPrice > 0 && solPrice < 10000;
  } catch {
    return false;
  }
}

async function testWebSocketConnection(): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(CONFIG.wsUrl);
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        resolve(false);
      }
    }, CONFIG.timeout);

    ws.onopen = () => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        ws.close();
        resolve(true);
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    };
  });
}

async function testWebSocketDataFlow(): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(CONFIG.wsUrl);
    let resolved = false;
    let messageCount = 0;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        resolve(messageCount > 0);
      }
    }, 10000);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type || data.performance || data.latestPrediction) {
          messageCount++;
          if (messageCount >= 3 && !resolved) {
            clearTimeout(timeout);
            resolved = true;
            ws.close();
            resolve(true);
          }
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    };
  });
}

async function testPredictionData(): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(CONFIG.wsUrl);
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        resolve(false);
      }
    }, 15000);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.latestPrediction) {
          const pred = data.latestPrediction;
          const hasRequired = (
            typeof pred.crashProbability === 'number' &&
            typeof pred.zone === 'string' &&
            pred.zone.length > 0
          );

          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            ws.close();
            resolve(hasRequired);
          }
        }
      } catch {
        // Ignore
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    };
  });
}

async function testRankingData(): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(CONFIG.wsUrl);
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        resolve(false);
      }
    }, 15000);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.top10ShortTargets && Array.isArray(data.top10ShortTargets)) {
          const hasData = data.top10ShortTargets.length > 0 &&
            typeof data.top10ShortTargets[0].symbol === 'string';

          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            ws.close();
            resolve(hasData);
          }
        }
      } catch {
        // Ignore
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    };
  });
}

async function testBotMetrics(): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(CONFIG.wsUrl);
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        resolve(false);
      }
    }, 15000);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.botMetrics) {
          const hasMetrics = (
            typeof data.botMetrics.botProbability === 'number' &&
            typeof data.botMetrics.jitoBundleCount === 'number'
          );

          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            ws.close();
            resolve(hasMetrics);
          }
        }
      } catch {
        // Ignore
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    };
  });
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('='.repeat(80));
  console.log('KAS PA - SYSTEM READY CHECK');
  console.log('='.repeat(80));
  console.log('');

  // Check if backend is running
  console.log('Testing backend connectivity...\n');

  await runTest('Chainstack RPC Connection', testChainstackConnection);
  await runTest('Jupiter Price API', testJupiterPriceAPI);
  await runTest('WebSocket Connection', testWebSocketConnection);

  console.log('\nTesting data flow...\n');

  await runTest('WebSocket Data Flow (3+ messages)', testWebSocketDataFlow);
  await runTest('Prediction Data Structure', testPredictionData);
  await runTest('Ranking Data Structure', testRankingData);
  await runTest('Bot Metrics Structure', testBotMetrics);

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('RESULTS SUMMARY');
  console.log('='.repeat(80));

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warnings = results.filter(r => r.status === 'WARN').length;

  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✓' : r.status === 'WARN' ? '⚠' : '✗';
    console.log(`  ${icon} [${r.status}] ${r.name}: ${r.message}`);
  });

  console.log('\n' + '-'.repeat(80));
  console.log(`Total: ${passed} passed, ${failed} failed, ${warnings} warnings`);

  // Final verdict
  console.log('\n' + '='.repeat(80));
  if (failed === 0) {
    console.log('VERDICT: READY FOR 24H TEST');
    console.log('='.repeat(80));
    console.log('\nTo start the 24-hour test:');
    console.log('  npx ts-node scripts/24h-production-test.ts');
    process.exit(0);
  } else {
    console.log('VERDICT: NOT READY - FIX FAILURES FIRST');
    console.log('='.repeat(80));
    console.log('\nFailed tests must be resolved before starting the 24h test.');
    console.log('Check that the backend is running:');
    console.log('  npx ts-node paper-trading/src/live-paper-trading.ts');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Check failed:', err);
  process.exit(1);
});
