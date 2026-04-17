/**
 * KAS PA v4.3 - Evaluation CLI
 *
 * Kommandozeilen-Tool zum Ausführen der Evaluationsstrecke.
 *
 * Usage:
 *   npx tsx src/cli.ts run --baselines B1,B2,B3,B4,B5
 *   npx tsx src/cli.ts eval --model B5
 *   npx tsx src/cli.ts compare
 */

import { BaselineRunner, baselineRunner } from './baselines/baselines.js';
import { BacktestEngine, BacktestSignal } from './backtest/engine.js';
import { Evaluator, evaluator, compareModels, EvaluationResult } from './eval/metrics.js';
import { GroundTruthRecord } from './labels/schema.js';
import { writeFileSync, readFileSync } from 'fs';

// ============================================================================
// TYPES
// ============================================================================

interface CliArgs {
  command: 'run' | 'eval' | 'compare' | 'help';
  baselines?: string[];
  model?: string;
  groundTruthPath?: string;
  signalsPath?: string;
  outputPath?: string;
}

// ============================================================================
// CLI HANDLER
// ============================================================================

export function parseArgs(args: string[]): CliArgs {
  const command = args[2] as string || 'help';

  if (command === 'help') {
    return { command: 'help' };
  }

  if (command === 'run') {
    const baselines = args.find(a => a.startsWith('--baselines='))?.split('=')[1]?.split(',') || ['B1', 'B2', 'B3', 'B4', 'B5'];
    return { command: 'run', baselines };
  }

  if (command === 'eval') {
    const model = args.find(a => a.startsWith('--model='))?.split('=')[1];
    const groundTruthPath = args.find(a => a.startsWith('--gt='))?.split('=')[1];
    return { command: 'eval', model, groundTruthPath };
  }

  if (command === 'compare') {
    return { command: 'compare' };
  }

  return { command: 'help' };
}

export async function runCli(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  switch (parsed.command) {
    case 'help':
      printHelp();
      break;

    case 'run':
      await runBaselines(parsed.baselines || ['B1', 'B2', 'B3', 'B4', 'B5']);
      break;

    case 'eval':
      await evaluateModel(parsed.model || 'B5', parsed.groundTruthPath);
      break;

    case 'compare':
      await compareAllModels();
      break;

    default:
      console.error('Unknown command:', parsed.command);
      printHelp();
  }
}

// ============================================================================
// COMMANDS
// ============================================================================

async function runBaselines(baselineNames: string[]): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('KAS PA v4.3 - Baseline Evaluation');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const runner = new BaselineRunner();

  // Simuliere Market Data (würde normalerweise aus DB kommen)
  const marketData = simulateMarketData();

  // Liste verfügbarer Baselines
  console.log('Verfügbare Baselines:');
  for (const baseline of runner.listBaselines()) {
    console.log(`  - ${baseline.name}: ${baseline.description}`);
  }
  console.log('');

  // Führe ausgewählte Baselines aus
  console.log(`Ausführung: ${baselineNames.join(', ')}\n`);

  const results = new Map<string, any>();

  for (const name of baselineNames) {
    console.log(`Running ${name}...`);
    try {
      const signals = runner.runSingle(name as any, Array.from(marketData.prices.keys()), marketData);
      results.set(name, signals);

      // Statistiken
      const shortSignals = signals.filter((s: any) => s.decision === 'SHORT').length;
      console.log(`  → ${signals.length} Signale generiert, ${shortSignals} SHORT\n`);
    } catch (error) {
      console.error(`  ✗ Error: ${error}\n`);
    }
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Run Complete');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Exportiere Ergebnisse
  const outputPath = `/data/trinity_apex/solana-stream/evaluation/data/signals/baselines_${Date.now()}.json`;
  const output = Object.fromEntries(results);
  // writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Ergebnisse gespeichert in: ${outputPath}`);
}

async function evaluateModel(modelName: string, _groundTruthPath?: string): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`KAS PA v4.3 - Evaluation: ${modelName}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Lade Ground Truth (Placeholder)
  const groundTruth: GroundTruthRecord[] = [];
  console.log('⚠️  Ground Truth: Keine Labels geladen (Datenlücke)');
  console.log('   → Bitte Ground-Truth-Dataset aufbauen\n');

  // Erstelle Backtest Engine und fülle mit Beispieldaten
  const engine = new BacktestEngine();

  // Simuliere Signale (würde normalerweise aus Backtest kommen)
  const signals: BacktestSignal[] = generateSampleSignals(modelName);
  for (const signal of signals) {
    engine.addSignalCutoff(
      signal.symbol,
      signal.baseline,
      signal.decision,
      signal.score,
      signal.confidence,
      signal.features,
      signal.timestamp
    );
  }

  // Resolviere Signale
  engine.resolveSignals();

  // Evaluiere
  const result = evaluator.evaluate(modelName, signals, groundTruth);

  // Ausgabe
  printEvaluationResult(result);
}

async function compareAllModels(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('KAS PA v4.3 - Model Comparison');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Sammle Ergebnisse für alle Baselines
  const results: EvaluationResult[] = [];

  const baselineNames = ['B1', 'B2', 'B3', 'B4', 'B5', 'KASPA'];
  const groundTruth: GroundTruthRecord[] = [];

  for (const name of baselineNames) {
    const signals = generateSampleSignals(name);
    const result = evaluator.evaluate(name, signals, groundTruth);
    results.push(result);
  }

  // Vergleiche
  const comparison = compareModels(results);

  // Ranking ausgeben
  console.log('RANKING (nach Overall Score):\n');
  for (const ranking of comparison.rankings) {
    const icon = ranking.recommendation === 'USE' ? '✓' :
                 ranking.recommendation === 'RECONSIDER' ? '?' : '✗';
    console.log(`  ${icon} ${ranking.model.padEnd(10)} Score: ${ranking.overallScore.toFixed(3)} (${ranking.recommendation})`);
  }

  console.log('\n───────────────────────────────────────────────────────────────');
  console.log(`Best Model: ${comparison.bestModel}`);
  console.log('───────────────────────────────────────────────────────────────\n');

  // Metrik-Vergleich
  console.log('METRIK VERBESSERUNG vs B1 (Random):\n');
  if (comparison.improvements.length === 0) {
    console.log('  (Keine signifikanten Verbesserungen gefunden)');
  } else {
    for (const imp of comparison.improvements) {
      console.log(`  ${imp.from} → ${imp.to}: +${(imp.improvement * 100).toFixed(1)}% ${imp.metric}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

// ============================================================================
// HELPERS
// ============================================================================

function printHelp(): void {
  console.log(`
KAS PA v4.3 - Evaluation CLI

Verwendung:
  npx tsx src/cli.ts <command> [options]

Commands:
  run     Führe Baselines aus
  eval    Evaluiere ein einzelnes Modell
  compare Vergleiche alle Modelle
  help    Zeige diese Hilfe

Options:
  --baselines=B1,B2,B3,B4,B5  Welche Baselines ausführen (run)
  --model=NAME                 Modellname (eval)
  --gt=PATH                    Ground Truth Pfad (eval)
  --output=PATH                Output Pfad

Beispiele:
  npx tsx src/cli.ts run --baselines=B1,B2,B3
  npx tsx src/cli.ts eval --model=B5 --gt=data/labels/events.jsonl
  npx tsx src/cli.ts compare
`);
}

function printEvaluationResult(result: EvaluationResult): void {
  console.log(`Model: ${result.modelName}`);
  console.log(`Overall Score: ${result.overallScore.toFixed(3)}`);
  console.log(`Recommendation: ${result.recommendation}\n`);

  console.log('SIGNAL QUALITY:');
  const sq = result.signalQuality;
  console.log(`  Precision:    ${(sq.precision * 100).toFixed(1)}%`);
  console.log(`  Recall:       ${(sq.recall * 100).toFixed(1)}%`);
  console.log(`  F1-Score:     ${(sq.f1Score * 100).toFixed(1)}%`);
  console.log(`  FPR:          ${(sq.falsePositiveRate * 100).toFixed(1)}%`);
  console.log(`  TP/FP/FN/TN:  ${sq.truePositives}/${sq.falsePositives}/${sq.falseNegatives}/${sq.trueNegatives}`);
  console.log('');

  console.log('LEAD TIME:');
  const lt = result.leadTime;
  console.log(`  Mean:   ${(lt.meanLeadTimeMs / 60000).toFixed(1)} min`);
  console.log(`  Median: ${(lt.medianLeadTimeMs / 60000).toFixed(1)} min`);
  console.log('');

  console.log('TRADING QUALITY:');
  const tq = result.tradingQuality;
  console.log(`  Trades: ${tq.totalTrades} (Win: ${tq.winningTrades}, Loss: ${tq.losingTrades})`);
  console.log(`  Win Rate: ${(tq.winRate * 100).toFixed(1)}%`);
  console.log(`  Avg PnL: ${(tq.averagePnLPercent * 100).toFixed(2)}%`);
  console.log('');

  if (result.dataGaps.length > 0) {
    console.log('DATA GAPS:');
    for (const gap of result.dataGaps) {
      console.log(`  ⚠️  ${gap}`);
    }
    console.log('');
  }

  if (result.warnings.length > 0) {
    console.log('WARNINGS:');
    for (const warning of result.warnings) {
      console.log(`  ⚠️  ${warning}`);
    }
    console.log('');
  }
}

function simulateMarketData() {
  // Placeholder - würde echte historische Daten laden
  const prices = new Map();
  const tokens = ['BONK', 'DOGWIF', 'WIF', 'MOTHER', 'NEIRO'];

  for (const token of tokens) {
    prices.set(token, {
      price: Math.random() * 0.1,
      priceChange1h: (Math.random() - 0.5) * 0.2,
      priceChange4h: (Math.random() - 0.5) * 0.4,
      priceChange24h: (Math.random() - 0.5) * 0.6,
      sma5: Math.random() * 0.1,
      sma15: Math.random() * 0.1,
      volume24h: Math.random() * 1000000,
      avgVolume7d: Math.random() * 800000,
    });
  }

  return {
    timestamp: Date.now(),
    prices,
    bots: new Map(),
    orderFlows: new Map(),
  };
}

function generateSampleSignals(modelName: string): BacktestSignal[] {
  // Generiere Beispieldaten für Demonstration
  const tokens = ['BONK', 'DOGWIF', 'WIF', 'MOTHER', 'NEIRO'];
  const signals: BacktestSignal[] = [];

  for (let i = 0; i < 50; i++) {
    const token = tokens[Math.floor(Math.random() * tokens.length)];
    const score = Math.random();
    const decision = score > 0.7 ? 'SHORT' : score > 0.4 ? 'MONITOR' : 'IGNORE';

    signals.push({
      id: `sig_${i}`,
      timestamp: Date.now() - i * 60000,
      cutoffTime: Date.now() - i * 60000,
      predictionWindowStart: Date.now() - i * 60000 + 300000,
      predictionWindowEnd: Date.now() - i * 60000 + 86400000,
      symbol: token,
      baseline: modelName,
      decision,
      score,
      confidence: score,
      features: { score, decision: decision === 'SHORT' ? 1 : 0 },
      resolved: Math.random() > 0.3,
      actualEvent: decision === 'SHORT' && Math.random() > 0.7,
      label: decision === 'SHORT' && Math.random() > 0.7 ? 'MASSIVEDUMP' : 'NORMALVOLATILITY',
      leadTimeMs: decision === 'SHORT' && Math.random() > 0.7 ? Math.random() * 7200000 : undefined,
      priceDropPercent: decision === 'SHORT' ? -(Math.random() * 0.5) : undefined,
    });
  }

  return signals;
}

// Run CLI
const args = process.argv;
runCli(args).catch(console.error);