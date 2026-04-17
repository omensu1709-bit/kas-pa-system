/**
 * Test: Direct API Access
 */

import axios from 'axios';

async function testDexScreener() {
  console.log('=== DEXSCREENER API TEST ===\n');
  
  // Test 1: Token boosts
  try {
    console.log('1. Testing /token-boosts/top/v1...');
    const r1 = await axios.get('https://api.dexscreener.com/token-boosts/top/v1?chain=solana', { timeout: 10000 });
    console.log(`   Status: ${r1.status}`);
    console.log(`   Data type: ${typeof r1.data}`);
    console.log(`   Keys: ${Object.keys(r1.data || {}).join(', ')}`);
    if (r1.data?.tokens) {
      console.log(`   Tokens: ${r1.data.tokens.length}`);
    }
  } catch (e: any) {
    console.log(`   Error: ${e.message}`);
    if (e.response) console.log(`   Status: ${e.response.status}`);
  }
  
  // Test 2: Latest pairs
  try {
    console.log('\n2. Testing /latest/dex/search...');
    const r2 = await axios.get('https://api.dexscreener.com/latest/dex/search?q=BONK&chain=solana', { timeout: 10000 });
    console.log(`   Status: ${r2.status}`);
    const pairs = r2.data?.pairs || [];
    console.log(`   Pairs found: ${pairs.length}`);
    if (pairs.length > 0) {
      console.log(`   Top pair: ${pairs[0].baseToken?.symbol} - Liquidity: $${pairs[0].liquidity?.usd || 0}`);
    }
  } catch (e: any) {
    console.log(`   Error: ${e.message}`);
    if (e.response) console.log(`   Status: ${e.response.status}`);
  }
  
  // Test 3: Specific token
  try {
    console.log('\n3. Testing BONK token data...');
    const bonkMint = 'DezXAZ8z7PnrnRJjz3wXBoRGq5EVK3kc6KxfeXWbKpu';
    const r3 = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${bonkMint}`, { timeout: 10000 });
    console.log(`   Status: ${r3.status}`);
    const pairs = r3.data?.pairs || [];
    console.log(`   Pairs found: ${pairs.length}`);
    if (pairs.length > 0) {
      const p = pairs[0];
      console.log(`   Symbol: ${p.baseToken?.symbol}`);
      console.log(`   Price: $${p.priceUsd}`);
      console.log(`   24h Change: ${p.priceChange?.h24}%`);
      console.log(`   24h Buys: ${p.txns?.h24?.buys}`);
      console.log(`   24h Sells: ${p.txns?.h24?.sells}`);
      console.log(`   Buy Volume: $${p.volume?.h24?.buyVolume}`);
      console.log(`   Sell Volume: $${p.volume?.h24?.sellVolume}`);
    }
  } catch (e: any) {
    console.log(`   Error: ${e.message}`);
    if (e.response) console.log(`   Status: ${e.response.status}`);
  }
}

async function testHelius() {
  console.log('\n\n=== HELIUS API TEST ===\n');
  
  const HELIUS_KEY = "bdbceecb-7fca-4dcb-856d-a5e8c5cc38e9";
  
  // Test: Token metadata
  try {
    console.log('1. Testing /token-metadata...');
    const bonkMint = 'DezXAZ8z7PnrnRJjz3wXBoRGq5EVK3kc6KxfeXWbKpu';
    const r1 = await axios.post(
      `https://api.helius.xyz/v0/token-metadata?api-key=${HELIUS_KEY}`,
      { mintAccounts: [bonkMint] },
      { timeout: 10000 }
    );
    console.log(`   Status: ${r1.status}`);
    console.log(`   Data: ${JSON.stringify(r1.data?.slice(0, 1) || []).slice(0, 200)}`);
  } catch (e: any) {
    console.log(`   Error: ${e.message}`);
    if (e.response) console.log(`   Status: ${e.response.status}`);
  }
  
  // Test: RPC
  try {
    console.log('\n2. Testing Helius RPC...');
    const r2 = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: ['DezXAZ8z7PnrnRJjz3wXBoRGq5EVK3kc6KxfeXWbKpu', { encoding: "jsonParsed" }]
      },
      { timeout: 10000 }
    );
    console.log(`   Status: ${r2.status}`);
    console.log(`   Has result: ${!!r2.data?.result}`);
  } catch (e: any) {
    console.log(`   Error: ${e.message}`);
    if (e.response) console.log(`   Status: ${e.response.status}`);
  }
}

async function main() {
  await testDexScreener();
  await testHelius();
}

main().catch(console.error);
