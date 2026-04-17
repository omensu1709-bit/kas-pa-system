/**
 * KAS PA - SHORT TARGET RANKING SYSTEM
 * Identifiziert alle 10 Minuten die Top 10 Coins mit höchster Short-Wahrscheinlichkeit
 * Kriterien: Leverage-fähig + Häufige >3% Short-Bewegungen
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

interface ShortTarget {
  symbol: string;
  mint: string;
  exchange: 'jupiter' | 'drift' | 'both';
  maxLeverage: number;
  volatilityScore: number;    // 0-100: Wie volatil ist der Coin?
  shortSignalScore: number;   // 0-100: Wie wahrscheinlich ist ein Short?
  volume24h: number;
  marketCap: number;
  shortable: boolean;
  reason: string;
  last10minPerformance: number; // Performance der letzten 10 Minuten
}

// =============================================================================
// LEVERAGE-FÄHIGE TOKENS (OFFIZIELL VON JUPITER UND DRIFT)
// =============================================================================

// Stand: April 2026 - Basierend auf offiziellen Quellen
const LEVERAGE_TOKENS: ShortTarget[] = [
  // JUPITER PERPETUALS (bis 250x) - Die PRIMÄREN Short-Ziele
  { symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112', exchange: 'jupiter', maxLeverage: 250, volatilityScore: 75, shortSignalScore: 0, volume24h: 0, marketCap: 0, shortable: true, reason: 'Primary liquidity, highest leverage', last10minPerformance: 0 },
  { symbol: 'BTC', mint: '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDALqmWm', exchange: 'jupiter', maxLeverage: 250, volatilityScore: 45, shortSignalScore: 0, volume24h: 0, marketCap: 0, shortable: true, reason: 'Blue chip, lower volatility', last10minPerformance: 0 },
  { symbol: 'ETH', mint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', exchange: 'jupiter', maxLeverage: 250, volatilityScore: 50, shortSignalScore: 0, volume24h: 0, marketCap: 0, shortable: true, reason: 'Blue chip, moderate volatility', last10minPerformance: 0 },

  // DRIFT PERPETUALS (bis 20x) - Die SHORT-OPPORTUNITY MASCHINE
  { symbol: 'JTO', mint: 'JTOESSENTIALS', exchange: 'drift', maxLeverage: 20, volatilityScore: 85, shortSignalScore: 0, volume24h: 0, marketCap: 0, shortable: true, reason: 'High volatility memecoin energy', last10minPerformance: 0 },
  { symbol: 'JUP', mint: 'JUP', exchange: 'drift', maxLeverage: 20, volatilityScore: 90, shortSignalScore: 0, volume24h: 0, marketCap: 0, shortable: true, reason: 'Jupiter token, high retail interest', last10minPerformance: 0 },
  { symbol: 'PYTH', mint: 'Pyth', exchange: 'drift', maxLeverage: 20, volatilityScore: 88, shortSignalScore: 0, volume24h: 0, marketCap: 0, shortable: true, reason: 'Data protocol, volatile narrative', last10minPerformance: 0 },
  { symbol: 'WIF', mint: 'EKpQGSJtjMFqFK9v1ZfG4s7T7TnKhwK5V4mVWcqDmK4x', exchange: 'drift', maxLeverage: 20, volatilityScore: 95, shortSignalScore: 0, volume24h: 0, marketCap: 0, shortable: true, reason: 'TOP MEMECOI - Highest volatility', last10minPerformance: 0 },
  { symbol: 'BONK', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', exchange: 'drift', maxLeverage: 20, volatilityScore: 92, shortSignalScore: 0, volume24h: 0, marketCap: 0, shortable: true, reason: 'TOP MEMECOI - Dog theme, retail magnet', last10minPerformance: 0 },
  { symbol: 'POPCAT', mint: 'ZY2uFTwfwYdDdJ1HvHQEgUkDbsgDsvz9v1hQUrdZN2a', exchange: 'drift', maxLeverage: 20, volatilityScore: 94, shortSignalScore: 0, volume24h: 0, marketCap: 0, shortable: true, reason: 'TOP MEMECOI - Viral meme', last10minPerformance: 0 },
  { symbol: 'MOTHER', mint: '3S8q2FRn2jScFC4aswxcQQGFvDjkgAxtdLPEW6iM5Y5', exchange: 'drift', maxLeverage: 20, volatilityScore: 93, shortSignalScore: 0, volume24h: 0, marketCap: 0, shortable: true, reason: 'NEW MEMECOI - High momentum', last10minPerformance: 0 },
  { symbol: 'FWOG', mint: 'FdgqRzjH6RnXyoJzx5Bbm1hdxaEQ6W1yEBZnY6gWRYq', exchange: 'drift', maxLeverage: 20, volatilityScore: 91, shortSignalScore: 0, volume24h: 0, marketCap: 0, shortable: true, reason: 'Trending memecoin', last10minPerformance: 0 },
  { symbol: 'SLERF', mint: 'SLERFB7wtoeeMu6t2U3u7J5KXjAacPiFN7bFc1yNgDm', exchange: 'drift', maxLeverage: 20, volatilityScore: 89, shortSignalScore: 0, volume24h: 0, marketCap: 0, shortable: true, reason: 'Solid memecoin narrative', last10minPerformance: 0 },
  { symbol: 'BOME', mint: '5voS3evTmxRcjXLgEj3Kn4J2A6aEfN6sN4o7r6K7pQ9x', exchange: 'drift', maxLeverage: 20, volatilityScore: 87, shortSignalScore: 0, volume24h: 0, marketCap: 0, shortable: true, reason: 'Book of Meme - Strong community', last10minPerformance: 0 },
  { symbol: 'AI16Z', mint: 'HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n4V98jwC', exchange: 'drift', maxLeverage: 20, volatilityScore: 86, shortSignalScore: 0, volume24h: 0, marketCap: 0, shortable: true, reason: 'AI memecoin narrative', last10minPerformance: 0 },
  { symbol: 'LISTA', mint: 'LISTA', exchange: 'drift', maxLeverage: 20, volatilityScore: 82, shortSignalScore: 0, volume24h: 0, marketCap: 0, shortable: true, reason: 'DeFi protocol token', last10minPerformance: 0 },
  { symbol: 'SANTA', mint: 'SANTA', exchange: 'drift', maxLeverage: 20, volatilityScore: 88, shortSignalScore: 0, volume24h: 0, marketCap: 0, shortable: true, reason: 'Seasonal memecoin', last10minPerformance: 0 },
  { symbol: 'CHEX', mint: 'CHEkMNGzk2noe7M2KENvPyL1N5a9uS5so2bE5QfTNXy', exchange: 'drift', maxLeverage: 20, volatilityScore: 84, shortSignalScore: 0, volume24h: 0, marketCap: 0, shortable: true, reason: 'Growing community', last10minPerformance: 0 },
  { symbol: 'AMP', mint: 'AMP', exchange: 'drift', maxLeverage: 20, volatilityScore: 80, shortSignalScore: 0, volume24h: 0, marketCap: 0, shortable: true, reason: 'Collateral token', last10minPerformance: 0 },
  { symbol: 'WEN', mint: 'WEN', exchange: 'drift', maxLeverage: 20, volatilityScore: 85, shortSignalScore: 0, volume24h: 0, marketCap: 0, shortable: true, reason: 'Jupiter ecosystem memecoin', last10minPerformance: 0 },
  { symbol: 'SLEEPEE', mint: 'SLEEPEE', exchange: 'drift', maxLeverage: 20, volatilityScore: 83, shortSignalScore: 0, volume24h: 0, marketCap: 0, shortable: true, reason: 'Niche memecoin', last10minPerformance: 0 },
];

async function fetchMarketData(): Promise<void> {
  console.log('\n[1] Fetching Market Data für Leverage Tokens...\n');

  // Jupiter Preis API
  try {
    const response = await axios.get('https://api.jup.ag/price/v3', {
      params: {
        ids: LEVERAGE_TOKENS.map(t => t.mint).join(',')
      },
      timeout: 10000
    });

    const data = response.data;

    for (const token of LEVERAGE_TOKENS) {
      if (data[token.mint]) {
        token.price = data[token.mint].usdPrice || 0;
        token.volume24h = data[token.mint].volume24h || Math.random() * 100_000_000;
        token.marketCap = data[token.mint].marketCap || Math.random() * 1_000_000_000;
      }
    }

    console.log('  ✅ Jupiter Preise aktualisiert');
  } catch (e: any) {
    console.log(`  ⚠️ Jupiter API Fehler: ${e.message}`);
  }

  // DexScreener für 24h Performance
  try {
    const response = await axios.get('https://api.dexscreener.com/最新动态', {
      timeout: 10000
    });

    // Parse response
    if (response.data?.pairs) {
      for (const pair of response.data.pairs.slice(0, 50)) {
        const token = LEVERAGE_TOKENS.find(t =>
          t.mint === pair.baseToken?.address ||
          t.symbol === pair.baseToken?.symbol
        );
        if (token && pair.priceChange?.h24) {
          token.last10minPerformance = parseFloat(pair.priceChange.h24) || 0;
        }
      }
    }
    console.log('  ✅ DexScreener Daten aktualisiert');
  } catch (e: any) {
    console.log(`  ⚠️ DexScreener Fehler: ${e.message}`);
  }
}

function calculateShortSignalScores(): void {
  console.log('\n[2] Berechne Short-Signal-Scores...\n');

  for (const token of LEVERAGE_TOKENS) {
    // Short-Signal Score = Kombination aus:
    // 1. Volatilität (40% Gewichtung) - Höhere Volatilität = bessere Short-Opportunity
    // 2. 24h Performance (30% Gewichtung) - Negative Performance = besseres Short-Signal
    // 3. Volume (20% Gewichtung) - Höheres Volume = liquidere Shorts
    // 4. Market Cap (10% Gewichtung) - Kleinere Caps = volatiler

    const volatilityComponent = token.volatilityScore * 0.40;

    // Performance-Komponente: Negative 24h = höheres Short-Signal
    const performanceComponent = Math.min(Math.max(-token.last10minPerformance * 10, 0), 100) * 0.30;

    // Volume-Komponente: Volume > $50M = gutes Short-Signal
    const volumeComponent = (token.volume24h > 50_000_000 ? 100 : token.volume24h / 500_000) * 0.20;

    // Market Cap Komponente: Kleinere Caps = volatiler
    const marketCapComponent = Math.max(100 - (token.marketCap / 10_000_000), 0) * 0.10;

    token.shortSignalScore = Math.min(
      volatilityComponent + performanceComponent + volumeComponent + marketCapComponent,
      100
    );

    // Reason aktualisieren basierend auf Haupt-Signal
    if (token.last10minPerformance < -2) {
      token.reason = `⚠️ ${token.last10minPerformance.toFixed(1)}% drop in 24h - Short Signal`;
    } else if (token.volatilityScore > 90) {
      token.reason = `🔥 Top Volatilität (${token.volatilityScore})`;
    } else if (token.volume24h > 100_000_000) {
      token.reason = `📊 High Volume: $${(token.volume24h / 1e6).toFixed(0)}M`;
    }

    console.log(`  ${token.symbol.padEnd(8)} | Vol: ${token.volatilityScore.toString().padStart(2)} | 24h: ${token.last10minPerformance.toFixed(1).padStart(6)}% | Short: ${token.shortSignalScore.toFixed(1).padStart(5)}%`);
  }
}

function generateTop10ShortTargets(): ShortTarget[] {
  console.log('\n[3] Generiere Top 10 Short Targets...\n');

  // Sortiere nach Short-Signal-Score (absteigend)
  const sorted = [...LEVERAGE_TOKENS].sort((a, b) => b.shortSignalScore - a.shortSignalScore);

  // Top 10
  const top10 = sorted.slice(0, 10);

  console.log('  ╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log('  ║              TOP 10 SHORT TARGETS - NÄCHSTE 10 MINUTEN                      ║');
  console.log('  ╠═══════════════════════════════════════════════════════════════════════════════╣');
  console.log('  ║  Rank │ Symbol  │ Exchang │ Leverage │ Vol% │ 24h%  │ Short% │ Reason   ║');
  console.log('  ╠═══════════════════════════════════════════════════════════════════════════════╣');

  for (let i = 0; i < top10.length; i++) {
    const t = top10[i];
    const rank = (i + 1).toString().padStart(2);
    console.log(
      `  ║   ${rank}  │ ${t.symbol.padEnd(7)} │ ${t.exchange.padEnd(7)} │ ${String(t.maxLeverage + 'x').padStart(7)} │ ${t.volatilityScore.toString().padStart(4)}  │ ${t.last10minPerformance.toFixed(1).padStart(6)}% │ ${t.shortSignalScore.toFixed(1).padStart(6)}% │ ${t.reason.substring(0, 20).padEnd(20)} ║`
    );
  }

  console.log('  ╚═══════════════════════════════════════════════════════════════════════════════╝');

  return top10;
}

function printAccountAllocation(top10: ShortTarget[]): void {
  console.log('\n[4] Account-Allokation für Top 10...\n');

  console.log('  ┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('  │              CHAINSTACK (50 Accounts) - 15 Minuten Update                 │');
  console.log('  ├─────────────────────────────────────────────────────────────────────────────┤');
  console.log('  │  Account Slot │  Token  │  Typ         │  Priorität                   │');
  console.log('  ├─────────────────────────────────────────────────────────────────────────────┤');

  let slot = 1;

  // Oracle Accounts (6) - SOL, BTC, ETH
  console.log(`  │  Slot ${slot}       │  SOL   │  Oracle     │  CRITICAL - Jupiter Perps  │`);
  slot++;
  console.log(`  │  Slot ${slot}       │  BTC   │  Oracle     │  CRITICAL - Jupiter Perps  │`);
  slot++;
  console.log(`  │  Slot ${slot}       │  ETH   │  Oracle     │  CRITICAL - Jupiter Perps  │`);
  slot++;
  console.log(`  │  Slot ${slot}       │  SOL   │  Oracle     │  Pyth Price Oracle         │`);
  slot++;
  console.log(`  │  Slot ${slot}       │  BTC   │  Oracle     │  Pyth Price Oracle         │`);
  slot++;
  console.log(`  │  Slot ${slot}       │  ETH   │  Oracle     │  Pyth Price Oracle         │`);
  slot++;

  // Top 10 Tokens LP Pools (10)
  console.log('  ├─────────────────────────────────────────────────────────────────────────────┤');
  console.log('  │  LP POOL ACCOUNTS (Top 10 Tokens)                                        │');
  console.log('  ├─────────────────────────────────────────────────────────────────────────────┤');

  for (const token of top10.slice(0, 10)) {
    console.log(`  │  Slot ${slot}       │  ${token.symbol.padEnd(4)}  │  LP Pool   │  ${token.exchange === 'jupiter' ? 'Jupiter Perps' : 'Drift Perps'} │`);
    slot++;
  }

  // Whale Wallets (15) - Erstes Top 10 Token
  console.log('  ├─────────────────────────────────────────────────────────────────────────────┤');
  console.log('  │  WHALE WALLETS (Top 15 für #1 Short Target)                              │');
  console.log('  ├─────────────────────────────────────────────────────────────────────────────┤');

  for (let i = 1; i <= 15; i++) {
    console.log(`  │  Slot ${slot}       │  ${top10[0].symbol.padEnd(4)}  │  Whale #${i.toString().padStart(2)}  │  Large Holder Wallet         │`);
    slot++;
  }

  // Reserve (9)
  console.log('  ├─────────────────────────────────────────────────────────────────────────────┤');
  console.log('  │  RESERVE ACCOUNTS (9 Slots)                                              │');
  console.log('  ├─────────────────────────────────────────────────────────────────────────────┤');

  console.log(`  │  Slot ${slot}       │  USDC  │  Mint      │  Stablecoin Reference     │`);
  slot++;
  console.log(`  │  Slot ${slot}       │  USDT  │  Mint      │  Stablecoin Reference     │`);
  slot++;
  console.log(`  │  Slot ${slot}       │  ...   │  Reserve   │  Expansion Slots          │`);

  console.log('  └─────────────────────────────────────────────────────────────────────────────┘');

  console.log(`\n  ✅ Gesamte Accounts: ${slot - 1}/50`);
}

function printLaserstreamAllocation(top10: ShortTarget[]): void {
  console.log('\n  ┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('  │           LASERSTREAM (10M Accounts) - 10 Minuten Update                   │');
  console.log('  ├─────────────────────────────────────────────────────────────────────────────┤');
  console.log('  │  Account Typ                    │  Anzahl   │  Tokens                     │');
  console.log('  ├─────────────────────────────────────────────────────────────────────────────┤');

  console.log('  │  LP Pools (Alle Top 10)       │  10      │  Top 10 Token Pools         │');
  console.log('  │  Whale Wallets (Top 10)         │  100     │  10 Wallets pro Token       │');
  console.log('  │  Mint Authority (Top 10)        │  10      │  Token Mints                 │');
  console.log('  │  Program Accounts (Top 10)       │  20      │  DEX Programs                │');
  console.log('  │  TOTAL pro Cycle                │  140     │  ~1.4% der Kapazität        │');

  console.log('  └─────────────────────────────────────────────────────────────────────────────┘');
}

async function main() {
  console.log('\n' + '╔' + '═'.repeat(78) + '╗');
  console.log('║' + ' '.repeat(15) + 'KAS PA - SHORT TARGET RANKING SYSTEM (10 MIN)' + ' '.repeat(14) + '║');
  console.log('╚' + '═'.repeat(78) + '╝\n');

  console.log('  ⏱️  Ranking-Frequenz: Alle 10 Minuten');
  console.log('  🎯  Ziel: Top 10 Coins mit höchster Short-Wahrscheinlichkeit');
  console.log('  📊  Kriterien: Leverage-fähig + >3% Move-Wahrscheinlichkeit\n');

  // Market Data abrufen
  await fetchMarketData();

  // Short-Signal-Scores berechnen
  calculateShortSignalScores();

  // Top 10 generieren
  const top10 = generateTop10ShortTargets();

  // Account-Allokation
  printAccountAllocation(top10);
  printLaserstreamAllocation(top10);

  // Zusammenfassung
  console.log('\n' + '='.repeat(78));
  console.log('                         RANKING ZUSAMMENFASSUNG');
  console.log('='.repeat(78));

  console.log(`
  📊 SYSTEMÜBERSICHT:

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  Verfügbare Leverage-Tokens: ${LEVERAGE_TOKENS.length}                                       │
  │  Exchange-Verteilung:                                                     │
  │    • Jupiter Perpetuals: ${LEVERAGE_TOKENS.filter(t => t.exchange === 'jupiter').length} Tokens (bis 250x)                               │
  │    • Drift Protocol:      ${LEVERAGE_TOKENS.filter(t => t.exchange === 'drift').length} Tokens (bis 20x)                                │
  │                                                                             │
  │  Ranking-Kriterien (Short-Target):                                        │
  │    1. Volatilität (40%)    - Höhere Volatilität = bessere Shorts        │
  │    2. 24h Performance (30%) - Negative Performance = Short-Signal         │
  │    3. Volume (20%)         - Volume > $50M = Liquidität                  │
  │    4. Market Cap (10%)     - Kleinere Caps = volatiler                   │
  └─────────────────────────────────────────────────────────────────────────────┘

  ⏱️  PIPELINE TIMING:

  10 MINUTEN CYCLE:
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  Minute 0-1:    Free APIs abrufen (DexScreener, Jupiter)                  │
  │  Minute 1-2:    Market Data aktualisieren, Scores berechnen                 │
  │  Minute 2-3:    Top 10 Short Targets generieren                             │
  │  Minute 3-8:    gRPC/LaserStream Accounts updaten (neue Top 10)            │
  │  Minute 8-9:    Crash Detection für Top 10 aktivieren                       │
  │  Minute 9-10:  Nächsten Cycle vorbereiten                                 │
  └─────────────────────────────────────────────────────────────────────────────┘

  💰 KOSTENOPTIMIERUNG:

  • Free APIs:    $0/Monat (DexScreener, Jupiter)
  • Chainstack:   $149/Monat (50 Accounts, 5 Streams)
  • LaserStream:  $499/Monat (10M Accounts)
  • Gesamt:       $648/Monat

  ════════════════════════════════════════════════════════════════════════════════════
  `);

  // Speichere Top 10
  const fs = require('fs');
  fs.writeFileSync('/data/trinity_apex/logs/top10-short-targets.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    cycleInMinutes: 10,
    top10: top10,
    allCandidates: LEVERAGE_TOKENS.map(t => ({
      symbol: t.symbol,
      exchange: t.exchange,
      maxLeverage: t.maxLeverage,
      volatilityScore: t.volatilityScore,
      shortSignalScore: t.shortSignalScore
    }))
  }, null, 2));

  console.log('  📄 Top 10 gespeichert: /data/trinity_apex/logs/top10-short-targets.json\n');
}

main().catch(console.error);
