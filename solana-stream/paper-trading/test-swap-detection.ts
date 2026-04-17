/**
 * Test: Swap Detection via Helius
 */

import axios from 'axios';

const HELIUS_KEY = "bdbceecb-7fca-4dcb-856d-a5e8c5cc38e9";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;

// Test: Get SWAP transactions specifically
async function testSwapDetection() {
  console.log('\n=== SWAP DETECTION TEST ===');
  
  // Get recent swaps for a known memecoin (BONK)
  const bonkMint = "DezXAZ8z7PnrnRJjz3wXBoRGq5EVK3kc6KxfeXWbKpu";
  
  try {
    // Get signatures
    const sigResp = await axios.post(HELIUS_RPC, {
      jsonrpc: "2.0",
      id: 1,
      method: "getSignaturesForAddress",
      params: [bonkMint, { limit: 10 }]
    }, { timeout: 15000 });
    
    const sigs = sigResp.data.result;
    console.log(`✓ Got ${sigs.length} signatures for BONK`);
    
    // Get detailed transactions
    for (let i = 0; i < Math.min(3, sigs.length); i++) {
      const sig = sigs[i];
      const txResp = await axios.post(HELIUS_RPC, {
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [sig.signature, { 
          encoding: "jsonParsed",
          maxSupportedTransactionVersion: 0,
          transactionDetails: "full",
          showRewards: false
        }]
      }, { timeout: 15000 });
      
      const tx = txResp.data.result;
      console.log(`\n--- Transaction ${i+1} ---`);
      console.log('  Signature:', sig.signature.slice(0, 20) + '...');
      console.log('  Slot:', tx?.slot);
      console.log('  BlockTime:', tx?.blockTime);
      console.log('  Meta Type:', tx?.meta?.type);
      console.log('  Fee:', tx?.meta?.fee);
      console.log('  Compute:', tx?.meta?.computeUnitsConsumed);
      
      // Check for token transfers
      const tokenTransfers = tx?.meta?.tokenTransfers || [];
      console.log('  TokenTransfers:', tokenTransfers.length);
      
      // Check for swap type
      if (tx?.meta?.type === 'SWAP') {
        console.log('  ✓ IS A SWAP!');
      } else if (tx?.meta?.type) {
        console.log('  Type:', tx.meta.type);
      }
    }
  } catch (e: any) {
    console.error('✗ Error:', e.message);
    if (e.response) {
      console.error('  Response:', e.response.data);
    }
  }
}

// Test with enhanced transaction details
async function testEnhancedDetails() {
  console.log('\n=== ENHANCED DETAILS TEST ===');
  
  const jupMint = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
  
  try {
    // Get signatures
    const sigResp = await axios.post(HELIUS_RPC, {
      jsonrpc: "2.0",
      id: 1,
      method: "getSignaturesForAddress",
      params: [jupMint, { limit: 5 }]
    }, { timeout: 15000 });
    
    const sigs = sigResp.data.result;
    console.log(`✓ Got ${sigs.length} signatures for Jupiter`);
    
    // Get full transaction details
    const txResp = await axios.post(HELIUS_RPC, {
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [sigs[0].signature, { 
        encoding: "jsonParsed",
        maxSupportedTransactionVersion: 0,
        transactionDetails: "full",
        showRewards: false,
        showEffects: true
      }]
    }, { timeout: 15000 });
    
    const tx = txResp.data.result;
    console.log('\nFull Transaction Structure:');
    console.log('  Keys:', tx.transaction.message.accountKeys?.length);
    console.log('  Instructions:', tx.transaction.message.instructions?.length);
    console.log('  Meta Type:', tx.meta?.type);
    console.log('  Error:', tx.meta?.err);
    
    // Dump all meta fields
    if (tx.meta) {
      console.log('\n  ALL Meta fields:');
      for (const key of Object.keys(tx.meta)) {
        const val = tx.meta[key];
        if (Array.isArray(val)) {
          console.log(`    ${key}: [${val.length} items]`);
        } else if (typeof val === 'object') {
          console.log(`    ${key}: ${JSON.stringify(val)?.slice(0, 100)}`);
        } else {
          console.log(`    ${key}: ${val}`);
        }
      }
    }
  } catch (e: any) {
    console.error('✗ Error:', e.message);
  }
}

async function main() {
  await testSwapDetection();
  await testEnhancedDetails();
}

main().catch(console.error);
