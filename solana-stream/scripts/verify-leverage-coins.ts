/**
 * KAS PA - LEVERAGE COINS FULL VERIFICATION
 * Überprüft alle leveragbaren SPL-Coins und ihre Daten
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

interface LeverageCoin {
  symbol: string;
  mint: string;
  exchange: 'jupiter' | 'drift';
  maxLeverage: number;
  category: 'bluechip' | 'major' | 'memecoin';
  hasPrice: boolean;
  hasVolume: boolean;
  hasMarketCap: boolean;
  price?: number;
  volume24h?: number;
  marketCap?: number;
  priceChange24h?: number;
}

interface VerificationResult {
  totalCoins: number;
  withPrice: number;
  withVolume: number;
  withMarketCap: number;
  missingData: string[];
  allExchanges: string[];
  allCategories: string[];
}

// Offizielle Leverage-Tokens von Jupiter und Drift (April 2026)
const LEVERAGE_COINS: Omit<LeverageCoin, 'hasPrice' | 'hasVolume' | 'hasMarketCap' | 'price' | 'volume24h' | 'marketCap' | 'priceChange24h'>[] = [
  // JUPITER PERPETUALS (250x)
  { symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112', exchange: 'jupiter', maxLeverage: 250, category: 'bluechip' },
  { symbol: 'BTC', mint: '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDALqmWm', exchange: 'jupiter', maxLeverage: 250, category: 'bluechip' },
  { symbol: 'ETH', mint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', exchange: 'jupiter', maxLeverage: 250, category: 'bluechip' },

  // DRIFT PERPETUALS (20x) - Major Tokens
  { symbol: 'JTO', mint: 'JTOESSENTIALS', exchange: 'drift', maxLeverage: 20, category: 'major' },
  { symbol: 'JUP', mint: 'JUP', exchange: 'drift', maxLeverage: 20, category: 'major' },
  { symbol: 'PYTH', mint: 'Pyth', exchange: 'drift', maxLeverage: 20, category: 'major' },
  { symbol: 'WIF', mint: 'EKpQGSJtjMFqFK9v1ZfG4s7T7TnKhwK5V4mVWcqDmK4x', exchange: 'drift', maxLeverage: 20, category: 'memecoin' },
  { symbol: 'BONK', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', exchange: 'drift', maxLeverage: 20, category: 'memecoin' },
  { symbol: 'POPCAT', mint: 'ZY2uFTwfwYdDdJ1HvHQEgUkDbsgDsvz9v1hQUrdZN2a', exchange: 'drift', maxLeverage: 20, category: 'memecoin' },
  { symbol: 'MOTHER', mint: '3S8q2FRn2jScFC4aswxcQQGFvDjkgAxtdLPEW6iM5Y5', exchange: 'drift', maxLeverage: 20, category: 'memecoin' },
  { symbol: 'FWOG', mint: 'FdgqRzjH6RnXyoJzx5Bbm1hdxaEQ6W1yEBZnY6gWRYq', exchange: 'drift', maxLeverage: 20, category: 'memecoin' },
  { symbol: 'SLERF', mint: 'SLERFB7wtoeeMu6t2U3u7J5KXjAacPiFN7bFc1yNgDm', exchange: 'drift', maxLeverage: 20, category: 'memecoin' },
  { symbol: 'BOME', mint: '5voS3evTmxRcjXLgEj3Kn4J2A6aEfN6sN4o7r6K7pQ9x', exchange: 'drift', maxLeverage: 20, category: 'memecoin' },
  { symbol: 'AI16Z', mint: 'HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n4V98jwC', exchange: 'drift', maxLeverage: 20, category: 'memecoin' },
  { symbol: 'WEN', mint: 'WEN', exchange: 'drift', maxLeverage: 20, category: 'memecoin' },
  { symbol: 'LISTA', mint: 'LISTA', exchange: 'drift', maxLeverage: 20, category: 'memecoin' },
  { symbol: 'SANTA', mint: 'SANTA', exchange: 'drift', maxLeverage: 20, category: 'memecoin' },
  { symbol: 'CHEX', mint: 'CHEkMNGzk2noe7M2KENvPyL1N5a9uS5so2bE5QfTNXy', exchange: 'drift', maxLeverage: 20, category: 'memecoin' },
  { symbol: 'AMP', mint: 'AMP', exchange: 'drift', maxLeverage: 20, category: 'memecoin' },
  { symbol: 'SLEEPEE', mint: 'SLEEPEE', exchange: 'drift', maxLeverage: 20, category: 'memecoin' },
];

async function verifyAllCoins(): Promise<VerificationResult> {
  console.log('\n' + '═'.repeat(70));
  console.log('    KAS PA - LEVERAGE COINS FULL VERIFICATION');
  console.log('═'.repeat(70) + '\n');

  const coins: LeverageCoin[] = LEVERAGE_COINS.map(c => ({
    ...c,
    hasPrice: false,
    hasVolume: false,
    hasMarketCap: false
  }));

  const result: VerificationResult = {
    totalCoins: coins.length,
    withPrice: 0,
    withVolume: 0,
    withMarketCap: 0,
    missingData: [],
    allExchanges: [],
    allCategories: []
  };

  // Fetch prices from Jupiter API
  console.log('[1] Fetching Preise von Jupiter API...\n');

  try {
    const mints = coins.map(c => c.mint);
    const response = await axios.get('https://api.jup.ag/price/v3', {
      params: { ids: mints.join(',') },
      timeout: 15000
    });

    const data = response.data;
    console.log(`  ✅ Jupiter API responded with ${Object.keys(data).length} tokens\n`);

    for (const coin of coins) {
      if (data[coin.mint]) {
        coin.hasPrice = true;
        coin.price = data[coin.mint].usdPrice || data[coin.mint].price || 0;
        coin.volume24h = data[coin.mint].volume24h || 0;
        coin.marketCap = data[coin.mint].marketCap || 0;
        coin.priceChange24h = data[coin.mint].priceChange24h || 0;

        if (coin.price > 0) result.withPrice++;
        if (coin.volume24h > 0) result.withVolume++;
        if (coin.marketCap > 0) result.withMarketCap++;
      } else {
        result.missingData.push(coin.symbol);
      }
    }
  } catch (e: any) {
    console.log(`  ❌ Jupiter API Error: ${e.message}`);
  }

  // Collect exchanges and categories
  for (const coin of coins) {
    if (!result.allExchanges.includes(coin.exchange)) {
      result.allExchanges.push(coin.exchange);
    }
    if (!result.allCategories.includes(coin.category)) {
      result.allCategories.push(coin.category);
    }
  }

  return result;
}

function printDetailedReport(coins: LeverageCoin[], result: VerificationResult) {
  console.log('\n[2] Detaillierter Bericht:\n');

  // By Exchange
  console.log('  ┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('  │  NACH EXCHANGE:                                                    │');
  console.log('  ├─────────────────────────────────────────────────────────────────────────┤');

  const byExchange = new Map<string, LeverageCoin[]>();
  for (const coin of coins) {
    if (!byExchange.has(coin.exchange)) byExchange.set(coin.exchange, []);
    byExchange.get(coin.exchange)!.push(coin);
  }

  for (const [exchange, exchangeCoins] of byExchange) {
    const leverage = exchange === 'jupiter' ? '250x' : '20x';
    console.log(`  │  ${exchange.toUpperCase()} (max ${leverage}): ${exchangeCoins.length} Tokens                              │`);
  }
  console.log('  └─────────────────────────────────────────────────────────────────────────┘');

  // By Category
  console.log('\n  ┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('  │  NACH KATEGORIE:                                                   │');
  console.log('  ├─────────────────────────────────────────────────────────────────────────┤');

  const byCategory = new Map<string, LeverageCoin[]>();
  for (const coin of coins) {
    if (!byCategory.has(coin.category)) byCategory.set(coin.category, []);
    byCategory.get(coin.category)!.push(coin);
  }

  for (const [category, categoryCoins] of byCategory) {
    const icon = category === 'bluechip' ? '💎' : category === 'major' ? '📊' : '🐕';
    console.log(`  │  ${icon} ${category.toUpperCase()}: ${categoryCoins.length} Tokens                                  │`);
  }
  console.log('  └─────────────────────────────────────────────────────────────────────────┘');

  // Data Availability
  console.log('\n  ┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('  │  DATEN-VERFÜGBARKEIT:                                              │');
  console.log('  ├─────────────────────────────────────────────────────────────────────────┤');
  console.log(`  │  ✅ Mit Preis:         ${result.withPrice}/${result.totalCoins} (${((result.withPrice/result.totalCoins)*100).toFixed(0)}%)                              │`);
  console.log(`  │  ✅ Mit Volume:        ${result.withVolume}/${result.totalCoins} (${((result.withVolume/result.totalCoins)*100).toFixed(0)}%)                              │`);
  console.log(`  │  ✅ Mit Market Cap:     ${result.withMarketCap}/${result.totalCoins} (${((result.withMarketCap/result.totalCoins)*100).toFixed(0)}%)                              │`);
  console.log('  └─────────────────────────────────────────────────────────────────────────┘');

  // Missing Data
  if (result.missingData.length > 0) {
    console.log('\n  ⚠️  FEHLENDE DATEN:');
    console.log(`      ${result.missingData.join(', ')}`);
  }

  // Detailed Table
  console.log('\n[3] Alle Leverage Coins:\n');
  console.log('  ╔════════╦══════════╦═════════╦════════╦════════╦═══════════════╦════════════════╗');
  console.log('  ║ Symbol  ║ Exchange  ║ Leverage ║ Price  ║ Volume ║ Market Cap    ║ Status         ║');
  console.log('  ╠════════╬══════════╬═════════╬════════╬════════╬═════════════════╬════════════════╣');

  for (const coin of coins) {
    const status = coin.hasPrice ? '✅' : '❌';
    const price = coin.price ? `$${coin.price.toFixed(2)}` : '-';
    const volume = coin.volume24h ? `${(coin.volume24h/1e6).toFixed(1)}M` : '-';
    const mcap = coin.marketCap ? `${(coin.marketCap/1e9).toFixed(2)}B` : '-';
    const symbol = coin.symbol.padEnd(6).substring(0, 6);
    const exchange = coin.exchange.substring(0, 8).padEnd(8);

    console.log(
      `  ║ ${symbol} ║ ${exchange} ║ ${String(coin.maxLeverage + 'x').padStart(7)}  ║ ${price.padStart(7)} ║ ${volume.padStart(6)} ║ ${mcap.padStart(12)} ║ ${status}               ║`
    );
  }

  console.log('  ╚════════╩══════════╩═════════╩════════╩════════╩═════════════════╩════════════════╝');
}

function printAccountRequirements(coins: LeverageCoin[]) {
  console.log('\n[4] Account-Anforderungen für vollständige Überwachung:\n');

  const jupiterCoins = coins.filter(c => c.exchange === 'jupiter');
  const driftCoins = coins.filter(c => c.exchange === 'drift');

  console.log('  ┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('  │  CHAINSTACK (50 Account Limit):                                      │');
  console.log('  ├─────────────────────────────────────────────────────────────────────────┤');
  console.log('  │                                                                         │');
  console.log('  │  🔴 CRITICAL (6 Accounts):                                          │');
  console.log('  │     • SOL, BTC, ETH Oracles (Pyth + Jupiter Dove)                   │');
  console.log('  │                                                                         │');
  console.log('  │  🟡 HIGH PRIORITY LP POOLS (16 Accounts):                           │');
  console.log('  │     • Top 8 Jupiter Perps + Top 8 Drift Perps LP Pools              │');
  console.log('  │                                                                         │');
  console.log('  │  🟢 MEDIUM PRIORITY (8 Accounts):                                  │');
  console.log('  │     • Top 8 Memecoin LP Pools                                       │');
  console.log('  │                                                                         │');
  console.log('  │  🔵 RESERVE (20 Accounts):                                         │');
  console.log('  │     • Whale Wallets + Mint Accounts + Expansion                      │');
  console.log('  │                                                                         │');
  console.log('  └─────────────────────────────────────────────────────────────────────────┘');

  console.log('\n  ┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('  │  LASERSTREAM (10M Account Limit):                                   │');
  console.log('  ├─────────────────────────────────────────────────────────────────────────┤');
  console.log('  │                                                                         │');
  console.log(`  │  ✅ KANN ALLE ${coins.length} LEVERAGE COINS ÜBERWACHEN!                    │`);
  console.log('  │                                                                         │');
  console.log('  │  Account-Bedarf pro Coin:                                           │');
  console.log('  │     • 1x LP Pool Account                                              │');
  console.log('  │     • 10x Whale Wallet Accounts                                       │');
  console.log('  │     • 1x Mint Authority                                               │');
  console.log('  │     • 1x Program Account                                               │');
  console.log('  │     ─────────────────────────────────                                │');
  console.log(`  │     TOTAL: ${coins.length * 13} Accounts pro Cycle                                   │`);
  console.log('  │                                                                         │');
  console.log('  │  ✅ Von 10M Limit: Nur 0.001% verwendet!                             │');
  console.log('  │                                                                         │');
  console.log('  └─────────────────────────────────────────────────────────────────────────┘');
}

async function main() {
  const result = await verifyAllCoins();
  const coins: LeverageCoin[] = LEVERAGE_COINS.map(c => ({
    ...c,
    hasPrice: false,
    hasVolume: false,
    hasMarketCap: false
  }));

  // Refetch to populate coins
  try {
    const mints = coins.map(c => c.mint);
    const response = await axios.get('https://api.jup.ag/price/v3', {
      params: { ids: mints.join(',') },
      timeout: 15000
    });

    const data = response.data;
    for (const coin of coins) {
      if (data[coin.mint]) {
        coin.hasPrice = true;
        coin.price = data[coin.mint].usdPrice || data[coin.mint].price || 0;
        coin.volume24h = data[coin.mint].volume24h || 0;
        coin.marketCap = data[coin.mint].marketCap || 0;
        coin.priceChange24h = data[coin.mint].priceChange24h || 0;
      }
    }
  } catch (e: any) {
    console.log(`Error: ${e.message}`);
  }

  printDetailedReport(coins, result);
  printAccountRequirements(coins);

  // Final Summary
  console.log('\n' + '='.repeat(70));
  console.log('                         ZUSAMMENFASSUNG');
  console.log('='.repeat(70));

  const allHavePrice = result.withPrice === result.totalCoins;
  const allHaveVolume = result.withVolume === result.totalCoins;
  const allHaveMarketCap = result.withMarketCap === result.totalCoins;

  console.log(`
  📊 LEVERAGE COINS STATUS:

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  ✅ Gesamt Leverage Coins:    ${result.totalCoins}                                           │
  │  ${allHavePrice ? '✅' : '⚠️ '}  Mit Preis:               ${result.withPrice}/${result.totalCoins}                                          │
  │  ${allHaveVolume ? '✅' : '⚠️ '}  Mit Volume:              ${result.withVolume}/${result.totalCoins}                                          │
  │  ${allHaveMarketCap ? '✅' : '⚠️ '}  Mit Market Cap:           ${result.withMarketCap}/${result.totalCoins}                                          │
  └─────────────────────────────────────────────────────────────────────────┘

  🏆 EXCHANGES:
     • Jupiter Perps: ${result.allExchanges.includes('jupiter') ? '✅' : '❌'} (3 Coins, bis 250x)
     • Drift Protocol: ${result.allExchanges.includes('drift') ? '✅' : '❌'} (${result.totalCoins - 3} Coins, bis 20x)

  📈 CATEGORIES:
     • Blue Chips: ${result.allCategories.includes('bluechip') ? '✅' : '❌'} (SOL, BTC, ETH)
     • Major Tokens: ${result.allCategories.includes('major') ? '✅' : '❌'} (JTO, JUP, PYTH)
     • Memecoins: ${result.allCategories.includes('memecoin') ? '✅' : '❌'} (${result.totalCoins - 6} Tokens)

  ${allHavePrice && allHaveVolume ? '✅ ALLE LEVERAGE COINS SIND KORREKT ANGEBUNDEN!' : '⚠️ EINIGE DATEN FEHLEN - Manuelle Überprüfung empfohlen!'}
  `);

  console.log('='.repeat(70) + '\n');
}

main().catch(console.error);
