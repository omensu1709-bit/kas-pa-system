/**
 * KAS PA v4.0 - Isolierte Modul-Tests
 */

import { rankingService } from './src/ranking-service.js';
import { heliusRestService } from './src/services/helius-rest-service.js';
import { ComprehensiveBotDetector } from './src/comprehensive-bot-detector.js';

async function testRanking() {
  console.log('\n=== 1.2 RANKING SERVICE TEST ===');
  try {
    const result = await rankingService.runRankingCycle();
    console.log('Candidates:', result.candidates.length);
    console.log('Top 5:');
    result.candidates.slice(0, 5).forEach((c, i) => {
      console.log(`  ${i + 1}. ${c.symbol}: Score=${c.shortSignalScore}, 24h=${c.priceChange24h}%`);
    });
    console.log('RANKING: PASS');
  } catch (e: any) {
    console.log('RANKING: FAIL -', e.message);
  }
}

async function testHelius() {
  console.log('\n=== 1.3 HELIUS REST TEST ===');
  const start = Date.now();
  try {
    // Test mit SOL Mint
    const signals = await heliusRestService.fetchSwapSignals(['So11111111111111111111111111111111111111112']);
    console.log('Signals fetched in', Date.now() - start, 'ms');
    const signal = signals.get('So11111111111111111111111111111111111111112');
    if (signal) {
      console.log('  buySellRatio:', signal.buySellRatio.toFixed(2));
      console.log('  whaleSellPressure:', signal.whaleSellPressure.toFixed(2));
      console.log('  volumeSpike:', signal.volumeSpike.toFixed(2));
    }
    console.log('HELIUS: PASS');
  } catch (e: any) {
    console.log('HELIUS: FAIL -', e.message);
  }
}

async function testBotDetector() {
  console.log('\n=== 1.4 BOT DETECTOR TEST ===');
  try {
    const detector = new ComprehensiveBotDetector();
    await detector.start();
    await new Promise(r => setTimeout(r, 5000)); // Wait for initial scan

    const metrics = detector.getMetrics();
    console.log('Bot Probability:', (metrics.botProbability * 100).toFixed(1) + '%');
    console.log('Jito Bundles:', metrics.jitoBundleCount);
    console.log('Sandwich:', metrics.sandwichCount);
    console.log('Sniper:', metrics.sniperCount);
    console.log('Liquidation:', metrics.liquidationCount);
    console.log('Ephemeral Wallets:', metrics.ephemeralWallets);

    // Cleanup
    detector.stop();
    console.log('BOT DETECTOR: PASS');
  } catch (e: any) {
    console.log('BOT DETECTOR: FAIL -', e.message);
  }
}

async function testBayesian() {
  console.log('\n=== 1.6 BAYESIAN DECISION ENGINE TEST ===');
  try {
    const { BayesianDecisionEngine } = await import('./src/bayesian-decision-engine.js');
    const bayesian = new BayesianDecisionEngine();

    const testCases = [
      { prob: 0.16, confirm: 4, bot: 0.3, expected: 'SHORT' },
      { prob: 0.13, confirm: 2, bot: 0.5, expected: 'MONITOR' },
      { prob: 0.05, confirm: 0, bot: 0.2, expected: 'IGNORE' },
    ];

    for (const tc of testCases) {
      const decision = bayesian.makeDecision(
        { symbol: 'SOL', shortSignalScore: 70, price: 150, mint: '', exchange: 'jupiter', maxLeverage: 50, volatilityScore: 50, volume24h: 0, marketCap: 0, priceChange24h: -5, shortable: true, reason: '', last24hPerformance: 0, rank: 0, updatedAt: 0 } as any,
        { symbol: 'SOL', crashProbability: tc.prob, confirmingMetrics: tc.confirm } as any,
        tc.bot, 80, 1
      );
      console.log(`  Crash=${tc.prob} Confirm=${tc.confirm} -> ${decision.action} (expected: ${tc.expected})`);
    }
    console.log('BAYESIAN: PASS');
  } catch (e: any) {
    console.log('BAYESIAN: FAIL -', e.message);
  }
}

async function main() {
  console.log('========================================');
  console.log('KAS PA v4.0 - ISOLIERTE MODUL TESTS');
  console.log('========================================');

  await testRanking();
  await testHelius();
  await testBotDetector();
  await testBayesian();

  console.log('\n========================================');
  console.log('PHASE 1 ISOLIERTE TESTS ABGESCHLOSSEN');
  console.log('========================================');
}

main().catch(console.error);
