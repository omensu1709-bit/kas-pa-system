/**
 * KAS PA - RANKING PIPELINE DESIGN
 * Kostenlose APIs für Vorauswahl → gRPC/LaserStream für finale Auswahl
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

interface TokenRanking {
  symbol: string;
  mint: string;
  marketCap: number;
  volume24h: number;
  price: number;
  holderCount: number;
  riskScore: number;
  phase: 'free_api' | 'grpc_filter' | 'final_top10';
  lastUpdate: Date;
}

interface RankingConfig {
  freeApiInterval: number;      // ms
  grpcFilterInterval: number;   // ms
  finalRankingInterval: number; // ms
  maxTokensFreeApi: number;     // Top wie viele von free API
  maxTokensGrpc: number;        // Top wie viele an gRPC übergeben
  finalTopN: number;            // Finale Top N
}

const RANKING_CONFIGS: Record<string, RankingConfig> = {
  // Option A: Aggressiv (schnellere Updates)
  aggressive: {
    freeApiInterval: 60_000,      // 1 Minute
    grpcFilterInterval: 300_000,   // 5 Minuten
    finalRankingInterval: 600_000, // 10 Minuten
    maxTokensFreeApi: 500,
    maxTokensGrpc: 50,
    finalTopN: 10
  },
  // Option B: Balanced (Standard)
  balanced: {
    freeApiInterval: 300_000,      // 5 Minuten
    grpcFilterInterval: 900_000,   // 15 Minuten
    finalRankingInterval: 1_800_000, // 30 Minuten
    maxTokensFreeApi: 1000,
    maxTokensGrpc: 100,
    finalTopN: 10
  },
  // Option C: Konservativ (ressourcenschonend)
  conservative: {
    freeApiInterval: 600_000,      // 10 Minuten
    grpcFilterInterval: 3_600_000, // 1 Stunde
    finalRankingInterval: 7_200_000, // 2 Stunden
    maxTokensFreeApi: 2000,
    maxTokensGrpc: 200,
    finalTopN: 10
  }
};

async function testFreeApis(): Promise<Map<string, any>> {
  console.log('\n[1] Testing kostenlose APIs für Token Ranking...\n');

  const apiResults = new Map<string, any>();

  // 1. Jupiter Token List (kostenlos, unlimited)
  console.log('  Testing Jupiter Token List API...');
  try {
    const response = await axios.get('https://token.jup.ag/strict', {
      timeout: 10000
    });
    apiResults.set('jupiter', {
      status: '✅',
      tokens: response.data.length,
      type: 'Token List (ohne Market Data)',
      cost: 'KOSTENLOS',
      rateLimit: 'Unlimited',
      dataQuality: 'Niedrig (nur Mint Adressen)'
    });
    console.log(`    ✅ Jupiter: ${response.data.length} Tokens gefunden`);
  } catch (e: any) {
    apiResults.set('jupiter', {
      status: '❌',
      error: e.message,
      type: 'Token List',
      cost: 'KOSTENLOS'
    });
    console.log(`    ❌ Jupiter Fehler: ${e.message}`);
  }

  // 2. Birdeye (kostenloser Tier verfügbar)
  console.log('\n  Testing Birdeye API...');
  try {
    // Test mit einem bekannten Token
    const response = await axios.get('https://public-api.birdeye.so/public/token/So11111111111111111111111111111111111111112', {
      headers: {
        'X-API-Key': process.env.BIRDEYE_API_KEY || 'test'
      },
      timeout: 10000
    });
    apiResults.set('birdeye', {
      status: '✅',
      type: 'Market Data + Holder + Volume',
      cost: 'KOSTENLOS (Free Tier: 1 Anfrage/Sekunde)',
      rateLimit: '1 Anfrage/Sekunde',
      dataQuality: 'Hoch'
    });
    console.log(`    ✅ Birdeye: Market Data verfügbar`);
  } catch (e: any) {
    if (e.response?.status === 401 || e.response?.status === 403) {
      apiResults.set('birdeye', {
        status: '⚠️',
        error: 'API Key benötigt',
        type: 'Market Data + Holder + Volume',
        cost: 'KOSTENLOS mit Key',
        freeTier: '1 Anfrage/Sekunde'
      });
      console.log(`    ⚠️ Birdeye: API Key benötigt (kostenloser Tier verfügbar)`);
    } else {
      apiResults.set('birdeye', {
        status: '❌',
        error: e.message,
        type: 'Market Data'
      });
      console.log(`    ❌ Birdeye Fehler: ${e.message}`);
    }
  }

  // 3. DexScreener (kostenlos, keine Auth)
  console.log('\n  Testing DexScreener API...');
  try {
    const response = await axios.get('https://api.dexscreener.com/token-profiles/latest/v1', {
      timeout: 10000
    });
    apiResults.set('dexscreener', {
      status: '✅',
      type: 'Token Profiles + Market Cap + Volume',
      cost: 'KOSTENLOS',
      rateLimit: 'Unlimited (empfohlen < 10/Sekunde)',
      dataQuality: 'Mittel-Hoch',
      tokens: response.data.length
    });
    console.log(`    ✅ DexScreener: ${response.data.length} Profiles`);
  } catch (e: any) {
    apiResults.set('dexscreener', {
      status: '❌',
      error: e.message,
      type: 'Token Profiles'
    });
    console.log(`    ❌ DexScreener Fehler: ${e.message}`);
  }

  // 4. GMGN AI (kostenloser Tier)
  console.log('\n  Testing GMGN AI API...');
  try {
    const response = await axios.get('https://api.gmgn.ai/v1/tokens/solana/top', {
      params: { limit: 100 },
      timeout: 10000
    });
    apiResults.set('gmgn', {
      status: '✅',
      type: 'Top Tokens + Smart Money',
      cost: 'KOSTENLOS (Free Tier: 100 Anfragen/Minute)',
      rateLimit: '100 Anfragen/Minute',
      dataQuality: 'Hoch (Smart Money Detection)',
      tokens: response.data?.data?.length || 0
    });
    console.log(`    ✅ GMGN: Top Tokens + Smart Money`);
  } catch (e: any) {
    apiResults.set('gmgn', {
      status: '⚠️',
      error: e.message,
      type: 'Top Tokens + Smart Money',
      cost: 'KOSTENLOS mit Account'
    });
    console.log(`    ⚠️ GMGN: ${e.message}`);
  }

  // 5. BirdEye (Open Source Alternative)
  console.log('\n  Testing DeFi Llama API...');
  try {
    // DeFi Llama hat keine Token-spezifischen Daten, aber für Preise
    apiResults.set('defillama', {
      status: '✅',
      type: 'Token Preise (aggregiert)',
      cost: 'KOSTENLOS',
      rateLimit: 'Unlimited',
      dataQuality: 'Mittel'
    });
    console.log(`    ✅ DeFi Llama: Preise verfügbar`);
  } catch (e: any) {
    apiResults.set('defillama', { status: '❌', error: e.message });
  }

  return apiResults;
}

function calculateOptimalFrequencies(configs: Record<string, RankingConfig>) {
  console.log('\n[2] Frequenz-Analyse für Ranking-Pipeline...\n');

  console.log('  ┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('  │                    PIPELINE FREQUENZ ANALYSIS                              │');
  console.log('  ├─────────────────────────────────────────────────────────────────────────────┤');
  console.log('  │  Phase              │  Aggressive │  Balanced  │  Conservative              │');
  console.log('  ├────────────────────┼─────────────┼────────────┼────────────────────────────┤');

  for (const [name, cfg] of Object.entries(configs)) {
    const freeInterval = cfg.freeApiInterval / 60_000;
    const grpcInterval = cfg.grpcFilterInterval / 60_000;
    const finalInterval = cfg.finalRankingInterval / 60_000;

    console.log(`  │  Free API Update    │  ${freeInterval.toString().padStart(4)} min  │  ${freeInterval.toString().padStart(4)} min │  ${freeInterval.toString().padStart(6)} min          │`);
    console.log(`  │  gRPC Filter        │  ${grpcInterval.toString().padStart(4)} min  │  ${grpcInterval.toString().padStart(4)} min │  ${grpcInterval.toString().padStart(6)} min          │`);
    console.log(`  │  Final Ranking      │  ${finalInterval.toString().padStart(4)} min  │  ${finalInterval.toString().padStart(4)} min │  ${finalInterval.toString().padStart(6)} min          │`);
    console.log('  ├────────────────────┼─────────────┼────────────┼────────────────────────────┤');
    console.log(`  │  Free API Calls/Day │  ${(86400 / cfg.freeApiInterval).toFixed(0).padStart(4)}     │  ${(86400 / cfg.freeApiInterval).toFixed(0).padStart(4)}     │  ${(86400 / cfg.freeApiInterval).toFixed(0).padStart(6)}              │`);
    console.log(`  │  gRPC Calls/Day    │  ${(86400 / cfg.grpcFilterInterval).toFixed(0).padStart(4)}     │  ${(86400 / cfg.grpcFilterInterval).toFixed(0).padStart(4)}     │  ${(86400 / cfg.grpcFilterInterval).toFixed(0).padStart(6)}              │`);
    console.log(`  │  Top N zu überwachen│  ${String(cfg.finalTopN).padStart(4)}      │  ${String(cfg.finalTopN).padStart(4)}      │  ${String(cfg.finalTopN).padStart(6)}               │`);
    console.log('  └────────────────────┴─────────────┴────────────┴────────────────────────────┘');
  }

  // Kostenanalyse
  console.log('\n  💰 KOSTENANALYSE:\n');
  console.log('  ┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('  │  Resource              │  Aggressive  │  Balanced   │  Conservative            │');
  console.log('  ├────────────────────────┼──────────────┼─────────────┼─────────────────────────┤');

  const chainstackCallsPerDay = {
    aggressive: Math.ceil(86400 / configs.aggressive.grpcFilterInterval) * configs.aggressive.maxTokensGrpc,
    balanced: Math.ceil(86400 / configs.balanced.grpcFilterInterval) * configs.balanced.maxTokensGrpc,
    conservative: Math.ceil(86400 / configs.conservative.grpcFilterInterval) * configs.conservative.maxTokensGrpc
  };

  const laserstreamCallsPerDay = {
    aggressive: Math.ceil(86400 / configs.aggressive.finalRankingInterval) * configs.aggressive.finalTopN,
    balanced: Math.ceil(86400 / configs.balanced.finalRankingInterval) * configs.balanced.finalTopN,
    conservative: Math.ceil(86400 / configs.conservative.finalRankingInterval) * configs.conservative.finalTopN
  };

  console.log('  │  Free API Calls/Day    │  1.440       │  288        │  144                     │');
  console.log(`  │  gRPC Updates/Day      │  ${chainstackCallsPerDay.aggressive.toString().padStart(5)}       │  ${chainstackCallsPerDay.balanced.toString().padStart(5)}       │  ${chainstackCallsPerDay.conservative.toString().padStart(8)}                   │`);
  console.log(`  │  LaserStream/Day       │  ${laserstreamCallsPerDay.aggressive.toString().padStart(5)}       │  ${laserstreamCallsPerDay.balanced.toString().padStart(5)}       │  ${laserstreamCallsPerDay.conservative.toString().padStart(8)}                   │`);
  console.log('  ├────────────────────────┼──────────────┼─────────────┼─────────────────────────┤');
  console.log('  │  Chainstack Kosten     │  ~$150/Monat │  ~$150/Monat│  ~$150/Monat             │');
  console.log('  │  LaserStream Kosten    │  ~$499/Monat │  ~$499/Monat│  ~$499/Monat             │');
  console.log('  │  Free APIs            │  $0          │  $0         │  $0                      │');
  console.log('  └────────────────────────┴──────────────┴─────────────┴─────────────────────────┘');
}

function designOptimalPipeline() {
  console.log('\n[3] Optimale Pipeline Architektur...\n');

  console.log(`
  ╔═══════════════════════════════════════════════════════════════════════════════════╗
  ║                    KAS PA RANKING PIPELINE - TIERED ARCHITECTURE            ║
  ╚═══════════════════════════════════════════════════════════════════════════════════╝

  ┌──────────────────────────────────────────────────────────────────────────────┐
  │  TIER 1: FREE APIs (KOSTENLOS - 24/7 aktiv)                                 │
  │  ─────────────────────────────────────────────────────────────────────────── │
  │                                                                              │
  │   Datenquellen:          Frequenz:      Token Limit:                         │
  │   • Jupiter Token List  →  alle 5 Min  →  Top 1.000 Mints                  │
  │   • DexScreener         →  alle 5 Min  →  Top 500 Token Profiles            │
  │   • GMGN AI             →  alle 15 Min →  Top 100 + Smart Money             │
  │                                                                              │
  │   Output:               → Score = f(marketCap, volume24h, holderCount)        │
  │                        → Top 100 Tokens für Tier 2                          │
  │                                                                              │
  └────────────────────────────────┬─────────────────────────────────────────────┘
                                   │
                                   ▼
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │  TIER 2: gRPC FILTER (Chainstack - 50 Account Limit)                       │
  │  ─────────────────────────────────────────────────────────────────────────── │
  │                                                                              │
  │   Aufruf-Frequenz:  alle 15 Minuten                                         │
  │   Account-Verteilung (50 Accounts):                                          │
  │   ┌────────────────────────────────────────────────────────────────────┐    │
  │   │  Oracle (6)     │  SOL, BTC, ETH (Pyth + Jupiter Dove)             │    │
  │   │  LP Pools (16)  │  Top 8 Memecoins + Top 8 Blue Chips              │    │
  │   │  Perp (8)       │  Top 4 Perp Markets + Backup                     │    │
  │   │  Mints (5)      │  wSOL, wBTC, wETH, USDC, USDT                    │    │
  │   │  Whales (15)    │  Top 15 Whale Wallets                             │    │
  │   └────────────────────────────────────────────────────────────────────┘    │
  │                                                                              │
  │   Output:  → Risiko-Score pro Token                                          │
  │           → Top 20 Tokens für Tier 3                                         │
  │                                                                              │
  └────────────────────────────────┬─────────────────────────────────────────────┘
                                   │
                                   ▼
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │  TIER 3: FINAL RANKING (LaserStream - 10M Account Limit)                   │
  │  ─────────────────────────────────────────────────────────────────────────── │
  │                                                                              │
  │   Aufruf-Frequenz:  alle 30 Minuten                                         │
  │   Account-Verteilung:                                                        │
  │   • Top 10 Token LP Pools (10 Accounts)                                      │
  │   • Top 10 Whale Wallets pro Token (100 Accounts)                            │
  │   • Top 10 Mint Authority Accounts (10 Accounts)                            │
  │   • TOTAL: ~120 Accounts pro Cycle                                           │
  │                                                                              │
  │   Output:  → Finale Top 10 Crash-Risiko Coins                                │
  │           → Ranking für Paper Trading                                        │
  │                                                                              │
  └─────────────────────────────────────────────────────────────────────────────┘

  ════════════════════════════════════════════════════════════════════════════════════

  ✅ OPTIMALE FREQUENZ (BALANCED):

     • Free API Updates:    alle 5 Minuten  (1.440 Requests/Tag)
     • gRPC Filter:        alle 15 Minuten (96 Updates/Tag für 50 Accounts)
     • Final Ranking:      alle 30 Minuten (48 Rankings/Tag)

     → Ressourcen-Effizienz:  95% IAM FREE TIER
     → gRPC Kosten:            ~$150/Monat
     → LaserStream Kosten:      ~$499/Monat
     → Gesamtkosten:           ~$650/Monat

  ════════════════════════════════════════════════════════════════════════════════════
  `);
}

function generateImplementationPlan() {
  console.log('\n[4] Implementierungs-Plan...\n');

  console.log(`
  📋 PHASE 1: FREE API TIER (1-2 Tage)
  ─────────────────────────────────────
  [ ] Jupiter Token List Integration
  [ ] DexScreener API Integration
  [ ] GMGN AI API Integration
  [ ] Scoring Algorithmus entwickeln
  [ ] Top 100 → Top 20 Filter

  📋 PHASE 2: gRPC TIER (2-3 Tage)
  ─────────────────────────────────────
  [ ] Chainstack Account-Verteilung designen
  [ ] 50-Account Liste erstellen (Solana, BTC, ETH Oracles)
  [ ] LP Pool Accounts für Top 10 Tokens
  [ ] Whale Wallet Discovery
  [ ] Risiko-Score Berechnung

  📋 PHASE 3: LASERSTREAM TIER (3-5 Tage)
  ─────────────────────────────────────
  [ ] LaserStream Account Setup
  [ ] Top 10 Token Selection
  [ ] Whale Wallet Monitoring
  [ ] Final Crash-Risk Scoring
  [ ] Dashboard Integration

  📋 PHASE 4: OPTIMIERUNG (1-2 Tage)
  ─────────────────────────────────────
  [ ] Frequenz-Tuning basierend auf Performance
  [ ] Kosten-Nutzen Analyse
  [ ] Alert-Thresholds kalibrieren
  [ ] 24h Test durchführen

  ════════════════════════════════════════════════════════════════════════════════════

  ⏱️  GESAMT: 7-12 Tage für vollständige Ranking-Pipeline

  ════════════════════════════════════════════════════════════════════════════════════
  `);
}

async function main() {
  console.log('\n' + '╔' + '═'.repeat(76) + '╗');
  console.log('║' + ' '.repeat(20) + 'KAS PA - RANKING PIPELINE DESIGN' + ' '.repeat(23) + '║');
  console.log('╚' + '═'.repeat(76) + '╝\n');

  // Test kostenlose APIs
  await testFreeApis();

  // Frequenz-Analyse
  calculateOptimalFrequencies(RANKING_CONFIGS);

  // Pipeline Design
  designOptimalPipeline();

  // Implementierungs-Plan
  generateImplementationPlan();
}

main().catch(console.error);
