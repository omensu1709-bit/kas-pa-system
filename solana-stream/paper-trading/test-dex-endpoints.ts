/**
 * Test: DexScreener Correct Endpoints
 */

import axios from 'axios';

async function testCorrectEndpoints() {
  console.log('=== TESTING DEXSCREENER ENDPOINTS ===\n');
  
  // BONK mint address
  const bonkMint = 'DezXAZ8z7PnrnRJjz3wXBoRGq5EVK3kc6KxfeXWbKpu';
  
  // Test 1: token-boosts top - check actual structure
  console.log('1. /token-boosts/top/v1 - checking structure...');
  try {
    const r = await axios.get('https://api.dexscreener.com/token-boosts/top/v1?chain=solana', { timeout: 10000 });
    const data = r.data;
    // It's an array, not object with tokens key
    if (Array.isArray(data)) {
      console.log(`   ✓ Is array with ${data.length} items`);
      if (data.length > 0) {
        console.log(`   First item keys: ${Object.keys(data[0]).join(', ')}`);
        console.log(`   First item: ${JSON.stringify(data[0]).slice(0, 200)}`);
      }
    } else {
      console.log(`   ✗ Not an array, keys: ${Object.keys(data).slice(0, 10).join(', ')}`);
      // Check for nested data
      if (data.data) console.log(`   Has 'data' key with ${Array.isArray(data.data) ? data.data.length : 'object'}`);
    }
  } catch (e: any) {
    console.log(`   Error: ${e.message}`);
  }
  
  // Test 2: pairs by mint - correct format
  console.log('\n2. /latest/dex/pairs/{pairAddress}...');
  // First search for BONK to get pair address
  try {
    const search = await axios.get(`https://api.dexscreener.com/latest/dex/search?q=BONK&chain=solana`, { timeout: 10000 });
    const pairs = search.data?.pairs || [];
    if (pairs.length > 0) {
      const pairAddr = pairs[0].pairAddress;
      console.log(`   BONK pair address: ${pairAddr}`);
      
      // Now get pair data
      const pair = await axios.get(`https://api.dexscreener.com/latest/dex/pairs/solana/${pairAddr}`, { timeout: 10000 });
      console.log(`   ✓ Got pair data`);
      console.log(`   Symbol: ${pair.data?.baseToken?.symbol}`);
      console.log(`   Price: $${pair.data?.priceUsd}`);
      console.log(`   24h Buys: ${pair.data?.txns?.h24?.buys}`);
      console.log(`   24h Sells: ${pair.data?.txns?.h24?.sells}`);
      console.log(`   Buy Volume: $${pair.data?.volume?.h24?.buyVolume}`);
      console.log(`   Sell Volume: $${pair.data?.volume?.h24?.sellVolume}`);
    }
  } catch (e: any) {
    console.log(`   Error: ${e.message}`);
  }
  
  // Test 3: tokens endpoint with correct format
  console.log('\n3. /latest/dex/tokens/{mints} (batch, comma-separated)...');
  try {
    // Try comma-separated format
    const r = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${bonkMint},Solana`, { timeout: 10000 });
    const pairs = r.data?.pairs || [];
    console.log(`   Pairs returned: ${pairs.length}`);
    if (pairs.length > 0) {
      console.log(`   First pair: ${pairs[0].baseToken?.symbol} - $${pairs[0].priceUsd}`);
    }
  } catch (e: any) {
    console.log(`   Error: ${e.message}`);
  }
  
  // Test 4: Use ranking-service approach - search
  console.log('\n4. Testing /latest/dex/search with multiple tokens...');
  try {
    const tokens = ['BONK', 'WIF', 'POPCAT', 'FWOG', 'POPCAT'];
    const searchTerms = tokens.join(',');
    const r = await axios.get(`https://api.dexscreener.com/latest/dex/search?q=${searchTerms}&chain=solana`, { timeout: 10000 });
    const pairs = r.data?.pairs || [];
    console.log(`   Pairs found: ${pairs.length}`);
    for (const p of pairs.slice(0, 5)) {
      console.log(`   - ${p.baseToken?.symbol}: $${p.priceUsd}, 24h: ${p.priceChange?.h24}%, Buys: ${p.txns?.h24?.buys}`);
    }
  } catch (e: any) {
    console.log(`   Error: ${e.message}`);
  }
}

testCorrectEndpoints().catch(console.error);
