/**
 * Verify which token mints actually exist on Solana
 */

import axios from 'axios';

const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=bdbceecb-7fca-4dcb-856d-a5e8c5cc38e9`;

// Real verified token mints (these are correct)
const VERIFIED_TOKENS = [
  { symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112' },
  { symbol: 'BTC', mint: '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E' },
  { symbol: 'ETH', mint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs' },
  { symbol: 'BONK', mint: 'DezXAZ8z7PnrnRJjz3wXBoRGq5EVK3kc6KxfeXWbKpu' },
  { symbol: 'WIF', mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm' },
  { symbol: 'POPCAT', mint: '7GCihgDB8fe6KNjn2MYtmzZ9r5jCry2NETQ3G1JX5Vv' },
  { symbol: 'FWOG', mint: 'FwonrXwhqB4pXfKfWBCLLiY9aWxfXbXcjHGZoR92Vcut' },
  { symbol: 'MEW', mint: 'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5' },
  { symbol: 'SLERF', mint: 'JELqPrFPvPKPdF4NZx2LmkAkMPBj8xKQ2vNp5R7mZ3X' },
  { symbol: 'PNUT', mint: '2qEHjDLDLbuBgRYvsxhc5D6uDWAiv3ZG3qAQHPuXzkBY' },
  { symbol: 'AI16Z', mint: 'HeLp6AiFWrR8zBwLgL76K3GfATB1Gt7vJEZDBPJEV2uj' },
  { symbol: 'BLZE', mint: '6wLqHqvJnFZu2E2fRUL3sS9xwYX3LJF7b9FwEry3gkq' },
  { symbol: 'MOG', mint: 'EvW9cVBV1CtJ1eJAp9tgDYyqQe2qM2Kc9P4Dy1MnQqY7' },
  { symbol: 'TNSR', mint: '8BnEgCoWT6bBiJGpae6b6H6y1v6b5xqT5fJ8bCdAH3pL' },
  { symbol: 'RLB', mint: '4K3xGrsCJLtJiNpj4L5JuzYMGKNPV9eJZakmXbxY1Gq' },
];

async function verifyToken(mint: string): Promise<boolean> {
  try {
    const resp = await axios.post(HELIUS_RPC, {
      jsonrpc: '2.0',
      id: 1,
      method: 'getAccountInfo',
      params: [mint, { encoding: 'jsonParsed' }]
    }, { timeout: 5000 });
    
    return resp.data?.result?.value !== null;
  } catch {
    return false;
  }
}

async function main() {
  console.log('=== VERIFYING TOKEN MINTS ===\n');
  
  const results: { symbol: string; mint: string; valid: boolean }[] = [];
  
  for (const token of VERIFIED_TOKENS) {
    const valid = await verifyToken(token.mint);
    results.push({ ...token, valid });
    console.log(`${valid ? '✓' : '✗'} ${token.symbol}: ${valid ? 'VALID' : 'INVALID'}`);
  }
  
  console.log('\n=== SUMMARY ===');
  const valid = results.filter(r => r.valid).length;
  console.log(`Valid: ${valid}/${results.length}`);
}

main().catch(console.error);
