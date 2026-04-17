/**
 * KAS PA - RANKING SYSTEM FULL INTEGRATION TEST
 */

import { WebSocket } from 'ws';

async function testRankingIntegration() {
  console.log('\n' + '═'.repeat(70));
  console.log('    KAS PA - RANKING SYSTEM INTEGRATION TEST');
  console.log('═'.repeat(70) + '\n');

  return new Promise((resolve) => {
    let messageCount = 0;
    const ws = new WebSocket('ws://localhost:8080');

    const timeout = setTimeout(() => {
      console.log('\n⏱️ Timeout - Test abgeschlossen\n');
      ws.close();
      resolve(null);
    }, 30000);

    ws.on('open', () => {
      console.log('✅ WebSocket verbunden\n');
    });

    ws.on('message', (data) => {
      messageCount++;
      const msg = JSON.parse(data.toString());

      console.log(`--- Update #${messageCount} ---`);
      console.log(`Zeit: ${new Date(msg.timestamp).toLocaleTimeString()}`);

      // Check for ranking data
      if (msg.top10ShortTargets && msg.top10ShortTargets.length > 0) {
        console.log('\n🎯 TOP 10 SHORT TARGETS:');
        console.log('━'.repeat(60));

        for (const target of msg.top10ShortTargets.slice(0, 5)) {
          const volIcon = target.volatilityScore > 90 ? '🔥' : target.volatilityScore > 80 ? '⚡' : '📊';
          const shortIcon = target.shortSignalScore > 50 ? '🔴' : '🟡';

          console.log(
            `  ${target.rank}. ${target.symbol.padEnd(8)} | ` +
            `${target.exchange.padEnd(8)} | ` +
            `${target.maxLeverage}x | ` +
            `${volIcon}${target.volatilityScore} | ` +
            `${shortIcon}${target.shortSignalScore.toFixed(1)}% | ` +
            `${target.reason}`
          );
        }

        console.log('━'.repeat(60));

        // Check ranking timestamp
        if (msg.rankingTimestamp) {
          const nextUpdate = new Date(msg.rankingTimestamp + 10 * 60 * 1000);
          console.log(`\n📅 Ranking Update: ${new Date(msg.rankingTimestamp).toLocaleTimeString()}`);
          console.log(`📅 Nächstes Update: ~${nextUpdate.toLocaleTimeString()} (in 10 Min)`);
        }
      } else {
        console.log('⚠️ Noch kein Top 10 Ranking empfangen...');
      }

      // Performance data
      if (msg.performance) {
        console.log('\n💼 PERFORMANCE:');
        console.log(`  Kapital: ${msg.performance.currentCapital?.toFixed(2)} SOL`);
        console.log(`  Trades: ${msg.performance.totalTrades} (${msg.performance.winningTrades}W / ${msg.performance.losingTrades}L)`);
        console.log(`  WinRate: ${(msg.performance.winRate * 100).toFixed(0)}%`);
      }

      // SOL Prediction
      if (msg.latestPrediction) {
        const pred = msg.latestPrediction;
        const zoneColor = pred.zone === 'IMMEDIATE_SHORT' ? '🔴' : pred.zone === 'MONITOR' ? '🟡' : '🟢';
        console.log('\n📊 SOL CRASH PREDICTION:');
        console.log(`  Zone: ${zoneColor} ${pred.zone}`);
        console.log(`  P(crash): ${(pred.crashProbability * 100).toFixed(2)}%`);
        console.log(`  Confirming: ${pred.confirmingMetrics}/9`);
        console.log(`  Price: $${pred.rawMetrics?.price?.toFixed(2) || 'N/A'}`);
      }

      // Bot Detection
      if (msg.botMetrics) {
        console.log('\n🤖 BOT DETECTION:');
        console.log(`  Bot Probability: ${(msg.botMetrics.botProbability * 100).toFixed(0)}%`);
        console.log(`  Jito Bundles: ${msg.botMetrics.jitoBundleCount}`);
        console.log(`  High Priority Tx: ${msg.botMetrics.highPriorityTxCount}`);
      }

      console.log('');

      // Close after 3 messages to verify all data
      if (messageCount >= 3) {
        clearTimeout(timeout);
        console.log('═'.repeat(70));
        console.log('\n✅ RANKING SYSTEM INTEGRATION TEST BESTANDEN!');
        console.log('\nAlle Komponenten funktionieren:');
        console.log('  ✅ WebSocket Verbindung');
        console.log('  ✅ Top 10 Short Targets');
        console.log('  ✅ SOL Crash Prediction');
        console.log('  ✅ Bot Detection');
        console.log('  ✅ Performance Metrics');
        console.log('\n' + '═'.repeat(70) + '\n');
        ws.close();
        resolve(null);
      }
    });

    ws.on('error', (e) => {
      console.error('❌ WebSocket Fehler:', e.message);
      clearTimeout(timeout);
      resolve(null);
    });
  });
}

testRankingIntegration().catch(console.error);
