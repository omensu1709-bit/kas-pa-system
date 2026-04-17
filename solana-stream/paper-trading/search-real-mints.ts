/**
 * Search for real token mints using DexScreener search
 */

import axios from 'axios';

async function searchDexScreener(query: string) {
  try {
    const resp = await axios.get(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}&chain=solana`,
      { timeout: 10000 }
    );
    const pairs = resp.data?.pairs || [];
    if (pairs.length > 0) {
      const p = pairs[0];
      return {
        symbol: p.baseToken?.symbol,
        name: p.baseToken?.name,
        mint: p.baseToken?.address,
        price: p.priceUsd,
        liquidity: p.liquidity?.usd
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  console.log('=== SEARCHING REAL TOKEN MINTS ===\n');
  
  const queries = ['BONK', 'WIF', 'POPCAT', 'FWOG', 'MEW', 'SLERF', 'PNUT', 'AI16Z', 'BLZE', 'MOG', 'TNSR', 'RLB', 'BOME', 'SEND', 'SUNDOG'];
  
  for (const q of queries) {
    const result = await searchDexScreener(q);
    if (result) {
      console.log(`✓ ${result.symbol}: ${result.mint}`);
      console.log(`  Price: $${result.price}, Liquidity: $${result.liquidity}`);
    } else {
      console.log(`✗ ${q}: NOT FOUND`);
    }
  }
}

main().catch(console.error);
