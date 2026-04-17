/**
 * Test: Data Flow from Chainstack + Helius
 */

import axios from 'axios';

const CHAINSTACK_RPC = "https://solana-mainnet.core.chainstack.com";
const AUTH = { username: "friendly-mcclintock", password: "armed-stamp-reuse-grudge-armful-script" };
const HELIUS_API = "https://api.helius.xyz/v0";
const HELIUS_KEY = "bdbceecb-7fca-4dcb-856d-a5e8c5cc38e9";

// Test 1: Chainstack RPC
async function testChainstack() {
  console.log('\n=== CHAINSTACK TEST ===');
  try {
    // Get recent signatures for Jupiter
    const jupAddr = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
    const response = await axios.post(CHAINSTACK_RPC, {
      jsonrpc: "2.0",
      id: 1,
      method: "getSignaturesForAddress",
      params: [jupAddr, { limit: 5 }]
    }, { auth: AUTH as any, timeout: 10000 });
    
    const sigs = response.data.result;
    console.log(`✓ Got ${sigs.length} signatures`);
    
    // Get first transaction details
    if (sigs.length > 0) {
      const txResp = await axios.post(CHAINSTACK_RPC, {
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [sigs[0].signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]
      }, { auth: AUTH as any, timeout: 10000 });
      
      const tx = txResp.data.result;
      console.log('✓ Transaction received');
      console.log('  Keys:', tx.transaction.message.accountKeys?.length);
      console.log('  Fee:', tx.meta?.fee);
      console.log('  CU:', tx.meta?.computeUnitsConsumed);
      console.log('  Has InnerInstructions:', !!tx.meta?.innerInstructions);
      console.log('  Has Logs:', !!tx.meta?.logMessages);
      console.log('  Has preBalances:', !!tx.meta?.preBalances);
    }
  } catch (e: any) {
    console.error('✗ Chainstack Error:', e.message);
  }
}

// Test 2: Helius REST
async function testHelius() {
  console.log('\n=== HELIUS TEST ===');
  try {
    // Test token metadata
    const solMint = "So11111111111111111111111111111111111111112";
    const response = await axios.post(`${HELIUS_API}/token-metadata`, {
      mintAccounts: [solMint]
    }, {
      params: { 'api-key': HELIUS_KEY },
      timeout: 10000
    });
    
    console.log('✓ Token metadata received');
    console.log('  Data keys:', Object.keys(response.data?.[0] || {}));
  } catch (e: any) {
    console.error('✗ Helius Error:', e.message);
  }
}

// Test 3: Helius RPC
async function testHeliusRPC() {
  console.log('\n=== HELIUS RPC TEST ===');
  try {
    // Get SOL signatures
    const solMint = "So11111111111111111111111111111111111111112";
    const response = await axios.post(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, {
      jsonrpc: "2.0",
      id: 1,
      method: "getSignaturesForAddress",
      params: [solMint, { limit: 3 }]
    }, { timeout: 10000 });
    
    const sigs = response.data.result;
    console.log(`✓ Got ${sigs.length} signatures via Helius RPC`);
    
    // Get first swap transaction details
    if (sigs.length > 0) {
      const txResp = await axios.post(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, {
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [sigs[0].signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]
      }, { timeout: 10000 });
      
      const tx = txResp.data.result;
      console.log('✓ Transaction received via Helius');
      console.log('  Type:', tx?.meta?.type || 'unknown');
      console.log('  Fee:', tx?.meta?.fee);
      console.log('  Has tokenTransfers:', !!tx?.meta?.tokenTransfers);
      console.log('  Has nativeTransfers:', !!tx?.meta?.nativeTransfers);
      console.log('  Logs:', tx?.meta?.logMessages?.length || 0);
    }
  } catch (e: any) {
    console.error('✗ Helius RPC Error:', e.message);
  }
}

// Run all tests
async function main() {
  console.log('TESTING DATA FLOW: Chainstack + Helius');
  console.log('=====================================');
  await testChainstack();
  await testHelius();
  await testHeliusRPC();
  console.log('\n=== TEST COMPLETE ===');
}

main().catch(console.error);
