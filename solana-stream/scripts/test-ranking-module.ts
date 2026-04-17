/**
 * Ranking Module Test
 */
import { rankingService } from '../paper-trading/src/ranking-service';

async function test() {
  console.log('Testing Ranking Module...\n');

  // Run ranking cycle
  const result = await rankingService.runRankingCycle();

  console.log(`\n✅ Ranking Module funktioniert!`);
  console.log(`\nTop 10 Short Targets:`);
  console.log(`==================`);

  for (const target of result.top10) {
    console.log(`  ${target.rank}. ${target.symbol.padEnd(8)} | ${target.exchange.padEnd(8)} | ${target.maxLeverage}x | Vol: ${target.volatilityScore} | Short: ${target.shortSignalScore.toFixed(1)}%`);
  }

  console.log(`\nStats:`);
  console.log(`  Total Kandidaten: ${result.stats.totalCandidates}`);
  console.log(`  Avg Short Score: ${result.stats.avgShortScore.toFixed(1)}%`);
  console.log(`  Highest Volatility: ${result.stats.highestVolatility}`);
}

test().catch(console.error);
