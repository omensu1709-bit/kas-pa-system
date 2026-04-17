/**
 * Test: Fixed Helius Swap Detection
 */

import axios from 'axios';

const HELIUS_KEY = "bdbceecb-7fca-4dcb-856d-a5e8c5cc38e9";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;

// Test with Jupiter trades
async function testJupiterTrades() {
  console.log('\n=== TESTING JUPITER SWAP DETECTION ===\n');
  
  // Jupiter program address
  const jupAddr = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
  
  try {
    // Get signatures
    const sigResp = await axios.post(HELIUS_RPC, {
      jsonrpc: "2.0",
      id: 1,
      method: "getSignaturesForAddress",
      params: [jupAddr, { limit: 10 }]
    }, { timeout: 15000 });
    
    const sigs = sigResp.data.result;
    console.log(`✓ Got ${sigs.length} signatures for Jupiter\n`);
    
    // Get detailed transactions
    let swapCount = 0;
    for (let i = 0; i < Math.min(5, sigs.length); i++) {
      const sig = sigs[i];
      
      const txResp = await axios.post(HELIUS_RPC, {
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [sig.signature, { 
          encoding: "jsonParsed",
          maxSupportedTransactionVersion: 0,
          transactionDetails: "full"
        }]
      }, { timeout: 15000 });
      
      const tx = txResp.data.result;
      const hasTokenTransfers = tx?.meta?.tokenTransfers?.length > 0;
      const hasNative = tx?.meta?.nativeTransfers?.length > 0;
      
      if (hasTokenTransfers) swapCount++;
      
      console.log(`Tx ${i+1}:`);
      console.log(`  Signature: ${sig.signature.slice(0, 30)}...`);
      console.log(`  Fee: ${(tx?.meta?.fee || 0) / 1e9} SOL`);
      console.log(`  TokenTransfers: ${tx?.meta?.tokenTransfers?.length || 0}`);
      console.log(`  NativeTransfers: ${tx?.meta?.nativeTransfers?.length || 0}`);
      console.log(`  Has Swap Data: ${hasTokenTransfers ? '✓' : '✗'}`);
      
      if (tx?.meta?.tokenTransfers?.length > 0) {
        const tt = tx.meta.tokenTransfers[0];
        console.log(`  First Transfer: ${tt.mint?.slice(0, 10)}... (${tt.uiTokenAmount || 0})`);
      }
      console.log('');
    }
    
    console.log(`\n=== SUMMARY ===`);
    console.log(`Potential Swaps: ${swapCount}/${Math.min(5, sigs.length)}`);
    
    // Now test our fix - simulate analyzing these txs
    console.log(`\n=== TESTING FIXED analyzeTransactions LOGIC ===`);
    
    // Mock analyzeTransactions behavior
    let buyVolume = 0;
    let sellVolume = 0;
    let buyCount = 0;
    let sellCount = 0;
    
    for (let i = 0; i < Math.min(5, sigs.length); i++) {
      const sig = sigs[i];
      
      const txResp = await axios.post(HELIUS_RPC, {
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [sig.signature, { 
          encoding: "jsonParsed",
          maxSupportedTransactionVersion: 0,
          transactionDetails: "full"
        }]
      }, { timeout: 15000 });
      
      const tx = txResp.data.result;
      const tokenTransfers = tx?.meta?.tokenTransfers || [];
      const nativeTransfers = tx?.meta?.nativeTransfers || [];
      
      if (tokenTransfers.length === 0) continue;
      
      let solIn = 0;
      let solOut = 0;
      
      for (const transfer of nativeTransfers) {
        const amount = Math.abs(transfer.amount || 0) / 1e9;
        const toAccount = transfer.toUserAccount || '';
        const fromAccount = transfer.fromUserAccount || '';
        
        // Check for DEX addresses (simplified)
        if (toAccount.length > 30) solOut += amount;
        if (fromAccount.length > 30) solIn += amount;
      }
      
      if (nativeTransfers.length === 0) {
        // Estimate from fee
        solIn = (tx?.meta?.fee || 5000) / 1e9;
        solOut = solIn;
      }
      
      const isBuy = solOut > solIn;
      const volume = isBuy ? solOut : solIn;
      
      if (volume > 0.001) {
        if (isBuy) {
          buyVolume += solOut;
          buyCount++;
        } else {
          sellVolume += solIn;
          sellCount++;
        }
        console.log(`Swap ${i+1}: ${isBuy ? 'BUY' : 'SELL'}, Volume: ${volume.toFixed(4)} SOL`);
      }
    }
    
    console.log(`\nTotal Buy Volume: ${buyVolume.toFixed(4)} SOL (${buyCount} trades)`);
    console.log(`Total Sell Volume: ${sellVolume.toFixed(4)} SOL (${sellCount} trades)`);
    console.log(`Buy/Sell Ratio: ${sellVolume > 0 ? (buyVolume / sellVolume).toFixed(2) : 'N/A'}`);
    
  } catch (e: any) {
    console.error('✗ Error:', e.message);
  }
}

testJupiterTrades().catch(console.error);
