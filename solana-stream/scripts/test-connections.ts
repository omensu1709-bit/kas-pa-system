/**
 * KAS PA Connection Test Script v7
 * Tests all data source connections - CORRECTED Jupiter format
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

interface TestResult {
  name: string;
  status: 'OK' | 'FAIL' | 'WARN';
  latency?: number;
  data?: any;
  error?: string;
}

const results: TestResult[] = [];

// ============================================================================
// HELIUS ENHANCED TRANSACTIONS API (v0)
// ============================================================================

async function testHeliusEnhanced(): Promise<TestResult> {
  console.log('\n[TEST] Helius Enhanced Transactions API...');

  const result: TestResult = { name: 'Helius Enhanced', status: 'FAIL' };

  try {
    const apiKey = process.env.HELIUS_API_KEY;
    const endpoint = process.env.HELIUS_ENHANCED_URL;

    if (!apiKey || !endpoint) {
      result.error = 'Missing HELIUS_API_KEY or HELIUS_ENHANCED_URL';
      return result;
    }

    const start = Date.now();

    // Get a recent signature
    const chainstackEndpoint = process.env.CHAINSTACK_HTTPS;
    const username = process.env.CHAINSTACK_USERNAME;
    const password = process.env.CHAINSTACK_PASSWORD;

    const sigResponse = await axios.post(chainstackEndpoint!, {
      jsonrpc: "2.0",
      id: 1,
      method: "getSignaturesForAddress",
      params: [
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        { limit: 1 }
      ]
    }, {
      auth: { username: username!, password: password! },
      timeout: 10_000
    });

    if (!sigResponse.data.result || !Array.isArray(sigResponse.data.result) || sigResponse.data.result.length === 0) {
      result.error = 'Could not get signatures from Chainstack';
      return result;
    }

    const signature = sigResponse.data.result[0].signature;
    console.log(`  Fetching signature: ${signature.slice(0, 20)}...`);

    // Fetch enhanced transaction
    const response = await axios.post(endpoint, {
      transactions: [signature]
    }, {
      params: { 'api-key': apiKey },
      headers: { 'Content-Type': 'application/json' },
      timeout: 15_000
    });

    result.latency = Date.now() - start;

    if (Array.isArray(response.data) && response.data.length > 0) {
      result.status = 'OK';
      const tx = response.data[0];
      result.data = {
        signature: signature.slice(0, 20) + '...',
        slot: tx.slot,
        fee: tx.fee,
        type: tx.type,
        description: tx.description,
      };
      console.log(`  ✓ Helius Enhanced: OK (${result.latency}ms)`);
      console.log(`    TX: ${result.data.type} - ${result.data.description?.slice(0, 60) || 'N/A'}...`);
    } else {
      result.error = `Unexpected response format`;
      console.log(`  ✗ Helius Enhanced: FAIL - ${result.error}`);
    }
  } catch (error: any) {
    result.error = error.response?.data?.errors?.[0]?.message || error.message;
    console.log(`  ✗ Helius Enhanced: FAIL - ${result.error}`);
  }

  return result;
}

// ============================================================================
// HELIUS TRANSACTIONS BY ADDRESS (Correct endpoint)
// ============================================================================

async function testHeliusByAddress(): Promise<TestResult> {
  console.log('\n[TEST] Helius Enhanced (By Address)...');

  const result: TestResult = { name: 'Helius By Address', status: 'FAIL' };

  try {
    const apiKey = process.env.HELIUS_API_KEY;
    // Correct endpoint format for v0 addresses
    const endpoint = `https://api-mainnet.helius-rpc.com/v0/addresses/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/transactions`;

    if (!apiKey) {
      result.error = 'Missing HELIUS_API_KEY';
      return result;
    }

    const start = Date.now();

    // Fetch transactions for USDC mint - using POST with query param
    const response = await axios.get(endpoint, {
      params: { 'api-key': apiKey, limit: 5 },
      timeout: 15_000
    });

    result.latency = Date.now() - start;

    if (Array.isArray(response.data) && response.data.length > 0) {
      result.status = 'OK';
      result.data = {
        count: response.data.length,
        firstSlot: response.data[0]?.slot,
        firstType: response.data[0]?.type,
      };
      console.log(`  ✓ Helius By Address: OK (${result.latency}ms)`);
      console.log(`    Found ${result.data.count} transactions, latest type: ${result.data.firstType}`);
    } else {
      result.error = 'No transactions returned';
      console.log(`  ✗ Helius By Address: FAIL - ${result.error}`);
    }
  } catch (error: any) {
    result.error = error.response?.data?.error?.message || error.message;
    console.log(`  ✗ Helius By Address: FAIL - ${result.error}`);
  }

  return result;
}

// ============================================================================
// CHAINSTACK TEST
// ============================================================================

async function testChainstack(): Promise<TestResult> {
  console.log('\n[TEST] Chainstack REST...');

  const result: TestResult = { name: 'Chainstack', status: 'FAIL' };

  try {
    const endpoint = process.env.CHAINSTACK_HTTPS;
    const username = process.env.CHAINSTACK_USERNAME;
    const password = process.env.CHAINSTACK_PASSWORD;

    if (!endpoint || !username || !password) {
      result.error = 'Missing Chainstack credentials';
      return result;
    }

    const start = Date.now();
    const response = await axios.post(endpoint, {
      jsonrpc: "2.0",
      id: 1,
      method: "getSlot"
    }, {
      auth: { username, password },
      timeout: 10_000
    });

    result.latency = Date.now() - start;

    if (response.data.result) {
      result.status = 'OK';
      result.data = {
        currentSlot: response.data.result
      };
      console.log(`  ✓ Chainstack: OK (${result.latency}ms) - Slot: ${response.data.result}`);
    } else {
      result.error = 'No result returned';
      console.log(`  ✗ Chainstack: FAIL - ${result.error}`);
    }
  } catch (error: any) {
    result.error = error.message;
    console.log(`  ✗ Chainstack: FAIL - ${error.message}`);
  }

  return result;
}

// ============================================================================
// JUPITER PRICE API v3 - CORRECTED FORMAT
// ============================================================================

async function testJupiterPrice(): Promise<TestResult> {
  console.log('\n[TEST] Jupiter Price API v3...');

  const result: TestResult = { name: 'Jupiter Price', status: 'FAIL' };

  try {
    const start = Date.now();

    // Use correct Jupiter v3 endpoint with correct token addresses
    const response = await axios.get('https://api.jup.ag/price/v3', {
      params: {
        // Use actual token addresses instead of symbols
        ids: 'So11111111111111111111111111111111111111112,EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v,mSOL,SOL'
      },
      timeout: 10_000
    });

    result.latency = Date.now() - start;

    console.log(`  Status: ${response.status}`);
    console.log(`  Response keys: ${Object.keys(response.data || {}).slice(0, 5).join(', ')}...`);

    // Jupiter v3 returns direct object with token addresses as keys
    // Example: { "So11111...": { usdPrice: 147.48, ... }, "EPjFWdd...": { usdPrice: 0.9999, ... } }
    if (response.data && typeof response.data === 'object' && Object.keys(response.data).length > 0) {
      result.status = 'OK';
      result.data = {};

      for (const [id, priceInfo] of Object.entries(response.data)) {
        const p = priceInfo as any;
        (result.data as any)[id] = {
          price: p.usdPrice,  // CORRECTED: usdPrice not price
          priceChange24h: p.priceChange24h,
          liquidity: p.liquidity,
        };
      }

      console.log(`  ✓ Jupiter Price: OK (${result.latency}ms)`);
      // Show some prices
      const entries = Object.entries(result.data).slice(0, 4);
      for (const [token, data] of entries) {
        const d = data as any;
        const shortId = token.slice(0, 8) + '...';
        console.log(`    ${shortId}: $${d.price?.toFixed(4) || 'N/A'} (24h: ${d.priceChange24h?.toFixed(2) || 'N/A'}%)`);
      }
    } else {
      result.error = 'Empty or invalid response';
      console.log(`  ✗ Jupiter Price: FAIL - ${result.error}`);
    }
  } catch (error: any) {
    result.error = error.response?.data?.error || error.message;
    console.log(`  ✗ Jupiter Price: FAIL - ${result.error}`);
  }

  return result;
}

// ============================================================================
// SOLANA RPC TEST
// ============================================================================

async function testSolanaRPC(): Promise<TestResult> {
  console.log('\n[TEST] Solana RPC (Chainstack direct)...');

  const result: TestResult = { name: 'Solana RPC', status: 'FAIL' };

  try {
    const endpoint = process.env.SOLANA_RPC_ENDPOINT;
    const username = process.env.CHAINSTACK_USERNAME;
    const password = process.env.CHAINSTACK_PASSWORD;

    if (!endpoint) {
      result.error = 'Missing SOLANA_RPC_ENDPOINT';
      return result;
    }

    const start = Date.now();

    const response = await axios.post(endpoint, {
      jsonrpc: "2.0",
      id: 1,
      method: "getSlot"
    }, {
      auth: username && password ? { username, password } : undefined,
      timeout: 10_000
    });

    result.latency = Date.now() - start;

    if (response.data.result) {
      result.status = 'OK';
      result.data = {
        currentSlot: response.data.result
      };
      console.log(`  ✓ Solana RPC: OK (${result.latency}ms) - Slot: ${response.data.result}`);
    } else {
      result.error = 'No result returned';
      console.log(`  ✗ Solana RPC: FAIL - ${result.error}`);
    }
  } catch (error: any) {
    result.error = error.message;
    console.log(`  ✗ Solana RPC: FAIL - ${error.message}`);
  }

  return result;
}

// ============================================================================
// HELIUS RAW RPC - Direct access
// ============================================================================

async function testHeliusRPC(): Promise<TestResult> {
  console.log('\n[TEST] Helius Direct RPC...');

  const result: TestResult = { name: 'Helius Direct RPC', status: 'FAIL' };

  try {
    const apiKey = process.env.HELIUS_API_KEY;
    // Helius RPC endpoint
    const endpoint = `https://api-mainnet.helius-rpc.com/?api-key=${apiKey}`;

    if (!apiKey) {
      result.error = 'Missing HELIUS_API_KEY';
      return result;
    }

    const start = Date.now();

    // Standard Solana JSON-RPC
    const response = await axios.post(endpoint, {
      jsonrpc: "2.0",
      id: 1,
      method: "getSlot",
      params: []
    }, {
      timeout: 10_000
    });

    result.latency = Date.now() - start;

    if (response.data.result !== undefined) {
      result.status = 'OK';
      result.data = {
        currentSlot: response.data.result
      };
      console.log(`  ✓ Helius Direct RPC: OK (${result.latency}ms) - Slot: ${response.data.result}`);
    } else if (response.data.error) {
      result.error = response.data.error.message || 'RPC Error';
      console.log(`  ✗ Helius Direct RPC: FAIL - ${result.error}`);
    } else {
      result.error = 'No result returned';
      console.log(`  ✗ Helius Direct RPC: FAIL - ${result.error}`);
    }
  } catch (error: any) {
    result.error = error.response?.data?.error?.message || error.message;
    console.log(`  ✗ Helius Direct RPC: FAIL - ${result.error}`);
  }

  return result;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('KAS PA CONNECTION TEST v7');
  console.log('='.repeat(60));
  console.log(`Time: ${new Date().toISOString()}`);

  // Ensure logs directory exists
  const fs = await import('fs');
  const logsDir = '/data/trinity_apex/logs';
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // Run tests
  const chainstackResult = await testChainstack();
  results.push(chainstackResult);

  const solanaRpcResult = await testSolanaRPC();
  results.push(solanaRpcResult);

  const heliusRpcResult = await testHeliusRPC();
  results.push(heliusRpcResult);

  const heliusEnhancedResult = await testHeliusEnhanced();
  results.push(heliusEnhancedResult);

  const heliusByAddressResult = await testHeliusByAddress();
  results.push(heliusByAddressResult);

  const jupiterResult = await testJupiterPrice();
  results.push(jupiterResult);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const ok = results.filter(r => r.status === 'OK').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const warn = results.filter(r => r.status === 'WARN').length;

  console.log(`Total: ${results.length} | OK: ${ok} | FAIL: ${fail} | WARN: ${warn}`);
  console.log('');

  for (const r of results) {
    const icon = r.status === 'OK' ? '✓' : r.status === 'WARN' ? '⚠' : '✗';
    console.log(`  ${icon} ${r.name}${r.latency ? ` (${r.latency}ms)` : ''}`);
    if (r.error) console.log(`    Error: ${r.error}`);
  }

  console.log('');

  if (fail === 0) {
    console.log('✓ ALL CONNECTIONS SUCCESSFUL');
  } else if (ok >= 3) {
    console.log('⚠ MOST CONNECTIONS WORKING');
  } else {
    console.log('✗ CRITICAL CONNECTION FAILURES');
  }

  // Save results
  fs.writeFileSync('/data/trinity_apex/logs/connection-test.json', JSON.stringify({
    timestamp: Date.now(),
    results
  }, null, 2));
  console.log('\nResults saved to /data/trinity_apex/logs/connection-test.json');
}

main().catch(console.error);
