/**
 * Test: Memecoin Swap Detection
 * We need to monitor MEMECOIN MINTS, not DEX programs
 */

import axios from 'axios';

const HELIUS_KEY = "bdbceecb-7fca-4dcb-856d-a5e8c5cc38e9";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;

// Test with actual memecoin mints that have activity
async function testMemecoinSwaps() {
  console.log('\n=== TESTING MEMECOIN SWAP DETECTION ===\n');
  
  // Known active memecoins
  const testMints = [
    { name: 'BONK', mint: 'DezXAZ8z7PnrnRJjz3wXBoRGq5EVK3kc6KxfeXWbKpu' },
    { name: 'WIF', mint: 'EKpQGSJtjMFqFK9KzA4LT29c6T3jKjZr3eMj8NtLBEF' },
    { name: 'POPCAT', mint: 'YDvC7uVv5UHhxs79UXwwNrKxCjru6HcrNp4gP9G3FZ' },
    { name: 'FUDGE', mint: 'E6Z6W7XDNd9gCbpKc3FSX3GLQ8dKxNYqNLj4UUcFeBZ' }
  ];
  
  for (const token of testMints) {
    try {
      console.log(`\n--- ${token.name} (${token.mint.slice(0, 15)}...) ---`);
      
      // Get signatures for the mint
      const sigResp = await axios.post(HELIUS_RPC, {
        jsonrpc: "2.0",
        id: 1,
        method: "getSignaturesForAddress",
        params: [token.mint, { limit: 10 }]
      }, { timeout: 10000 });
      
      const sigs = sigResp.data.result || [];
      console.log(`Signatures found: ${sigs.length}`);
      
      if (sigs.length === 0) continue;
      
      // Get detailed transaction
      const txResp = await axios.post(HELIUS_RPC, {
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [sigs[0].signature, { 
          encoding: "jsonParsed",
          maxSupportedTransactionVersion: 0,
          transactionDetails: "full"
        }]
      }, { timeout: 10000 });
      
      const tx = txResp.data.result;
      console.log(`  Fee: ${(tx?.meta?.fee || 0) / 1e9} SOL`);
      console.log(`  CU: ${tx?.meta?.computeUnitsConsumed || 0}`);
      console.log(`  TokenTransfers: ${tx?.meta?.tokenTransfers?.length || 0}`);
      console.log(`  NativeTransfers: ${tx?.meta?.nativeTransfers?.length || 0}`);
      console.log(`  Logs: ${tx?.meta?.logMessages?.length || 0}`);
      
      if (tx?.meta?.tokenTransfers?.length > 0) {
        console.log(`  ✓ HAS TOKEN TRANSFERS!`);
        for (const tt of tx.meta.tokenTransfers.slice(0, 2)) {
          console.log(`    ${tt.mint?.slice(0, 10)}...: ${tt.uiTokenAmount || 0}`);
        }
      }
      
      if (tx?.meta?.nativeTransfers?.length > 0) {
        console.log(`  ✓ HAS NATIVE TRANSFERS!`);
        for (const nt of tx.meta.nativeTransfers.slice(0, 2)) {
          console.log(`    ${nt.amount / 1e9} SOL from ${nt.fromUserAccount?.slice(0, 10)}...`);
        }
      }
      
    } catch (e: any) {
      console.log(`  Error: ${e.message}`);
    }
  }
}

// Test: Check DexScreener for active coins and their swap activity
async function testDexScreenerActivity() {
  console.log('\n\n=== DEXSCREENER ACTIVITY CHECK ===\n');
  
  try {
    // Get top boosted tokens
    const response = await axios.get('https://api.dexscreener.com/token-boosts/top/v1?chain=solana', {
      timeout: 10000
    });
    
    const tokens = response.data?.tokens || [];
    console.log(`Top Boosted Tokens: ${tokens.length}`);
    
    // Check first few
    for (const token of tokens.slice(0, 5)) {
      const addr = token.tokenAddress;
      console.log(`\n${token.symbol} (${addr.slice(0, 15)}...):`);
      console.log(`  24h Volume: $${token.volume?.h24 || 0}`);
      console.log(`  24h Buys: ${token.txns?.h24?.buys || 0}`);
      console.log(`  24h Sells: ${token.txns?.h24?.sells || 0}`);
      console.log(`  Liquidity: $${token.liquidity?.usd || 0}`);
      
      // Check for swaps
      const buySell = token.txns?.h24?.buys || 0;
      const sell = token.txns?.h24?.sells || 0;
      if (buySell + sell > 0) {
        const ratio = sell / (buySell + sell);
        console.log(`  Sell Ratio: ${(ratio * 100).toFixed(1)}%`);
        console.log(`  ${ratio > 0.6 ? '⚠️ HIGH SELL PRESSURE' : ratio < 0.4 ? '✅ HIGH BUY PRESSURE' : '➖ NEUTRAL'}`);
      }
    }
  } catch (e: any) {
    console.log(`DexScreener Error: ${e.message}`);
  }
}

async function main() {
  await testMemecoinSwaps();
  await testDexScreenerActivity();
}

main().catch(console.error);
