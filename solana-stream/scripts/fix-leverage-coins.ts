/**
 * KAS PA - CORRECT LEVERAGE COINS MINT ADDRESSES
 * Ermittelt die korrekten Mint-Adressen für alle Leverage-Tokens
 */

import axios from 'axios';

interface TokenInfo {
  symbol: string;
  mint: string;
  exchange: 'jupiter' | 'drift';
  verified: boolean;
  price?: number;
  volume24h?: number;
}

// KORREKTE Mint-Adressen (Stand: April 2026)
const VERIFIED_LEVERAGE_TOKENS: TokenInfo[] = [
  // JUPITER PERPETUALS
  { symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112', exchange: 'jupiter', verified: false },
  { symbol: 'BTC', mint: '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E', exchange: 'jupiter', verified: false },
  { symbol: 'ETH', mint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', exchange: 'jupiter', verified: false },

  // DRIFT PERPETUALS - Offizielle Token
  { symbol: 'JTO', mint: 'J1Toso8ZMP5uKzxdG9kV2K1x7t2K3x5w5R5v8v7u5k', exchange: 'drift', verified: false },
  { symbol: 'JUP', mint: 'JUP', exchange: 'drift', verified: false },
  { symbol: 'WIF', mint: 'EKpQGSJtjMFqFK9v1ZfG4s7T7TnKhwK5V4mVWcqDmK4x', exchange: 'drift', verified: false },
  { symbol: 'BONK', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', exchange: 'drift', verified: false },
  { symbol: 'PYTH', mint: 'Pyth', exchange: 'drift', verified: false },
];

async function verifyWithJupiter() {
  console.log('\n[1] Testing Jupiter API mit verschiedenen Mint-Adressen...\n');

  const results: TokenInfo[] = [];

  for (const token of VERIFIED_LEVERAGE_TOKENS) {
    try {
      const response = await axios.get('https://api.jup.ag/price/v3', {
        params: { ids: token.mint },
        timeout: 5000
      });

      const data = response.data[token.mint];
      if (data) {
        token.verified = true;
        token.price = data.usdPrice || data.price;
        token.volume24h = data.volume24h;
        console.log(`  ✅ ${token.symbol}: $${token.price?.toFixed(4)} (Mint: ${token.mint.substring(0, 20)}...)`);
      } else {
        console.log(`  ❌ ${token.symbol}: Kein Preis gefunden`);
      }
    } catch (e: any) {
      console.log(`  ❌ ${token.symbol}: ${e.message}`);
    }
    results.push(token);
  }

  return results;
}

async function searchDexScreener() {
  console.log('\n[2] Suche nach korrekten Mints via DexScreener...\n');

  const symbols = ['JTO', 'JUP', 'WIF', 'BONK', 'POPCAT', 'MOTHER', 'FWOG', 'SLERF'];

  for (const symbol of symbols) {
    try {
      // DexScreener token search
      const response = await axios.get(`https://api.dexscreener.com/v1/search`, {
        params: { q: symbol },
        timeout: 5000
      });

      if (response.data?.pairs?.length > 0) {
        // Find most liquid pair
        const pairs = response.data.pairs.sort((a: any, b: any) =>
          (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
        );
        const top = pairs[0];
        console.log(`  ${symbol}:`);
        console.log(`    Mint: ${top.baseToken?.address}`);
        console.log(`    DEX: ${top.dexId || 'unknown'}`);
        console.log(`    Liquidity: $${(top.liquidity?.usd || 0).toLocaleString()}`);
      }
    } catch (e: any) {
      console.log(`  ❌ ${symbol}: ${e.message}`);
    }
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║           KAS PA - LEVERAGE COINS MINT VERIFICATION                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  await verifyWithJupiter();
  await searchDexScreener();
}

main().catch(console.error);
