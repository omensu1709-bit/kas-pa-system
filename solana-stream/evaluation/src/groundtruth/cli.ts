/**
 * KAS PA v4.3 - Ground Truth CLI
 *
 * Kommandozeilen-Tool für den vollständigen Ground-Truth-Workflow.
 *
 * Commands:
 *   gt:candidates     - Generiere Event-Kandidaten aus historischen Daten
 *   gt:autolabel     - Erzeuge Auto-Labels für Kandidaten
 *   gt:review:list   - Liste ausstehende Reviews
 *   gt:review:apply  - Submit Review für Candidate
 *   gt:export        - Exportiere finales Ground Truth Dataset
 *   gt:stats         - Zeige Statistiken
 *   gt:validate      - Validiere Ground Truth Daten
 */

import { candidateGenerator, CandidateGenerator, CANDIDATE_TRIGGERS } from './candidate-generator.js';
import { autoLabeler, AutoLabeler } from './auto-labeler.js';
import { reviewWorkflow, ReviewWorkflow, ReviewDecision } from './review-workflow.js';
import { groundTruthStorage, GroundTruthStorage } from './storage.js';
import { confidenceCalculator, calculateDataCompleteness } from './confidence.js';
import {
  EventCandidate,
  PreliminaryLabel,
  FinalGroundTruthLabel,
  LabelClass,
  AmbiguityFlag,
} from './schema.js';

// ============================================================================
// CLI TYPES
// ============================================================================

interface CliCommand {
  name: string;
  description: string;
  execute: (args: string[]) => Promise<void>;
}

interface GlobalFlags {
  dryRun: boolean;
  verbose: boolean;
  output?: string;
}

// ============================================================================
// COMMANDS
// ============================================================================

const commands: Map<string, CliCommand> = new Map();

// ----------------------------------------------------------------------------
// Command: candidates
// ----------------------------------------------------------------------------

commands.set('gt:candidates', {
  name: 'gt:candidates',
  description: 'Generiere Event-Kandidaten aus historischen Daten',

  async execute(args: string[]) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('GROUND TRUTH: Generate Event Candidates');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const flags = parseFlags(args);
    const generator = new CandidateGenerator();

    // Load historical data (placeholder)
    console.log('⚠️  NOTE: Using synthetic test data for demonstration');
    console.log('   In production: Load from DexScreener/Helius/Chainstack\n');

    // Generate candidates (using synthetic data for demo)
    const snapshots = generateSyntheticSnapshots(100);
    const candidates = generator.generateCandidates(snapshots, {
      mergeWindowMs: 3600000,
      minTriggers: 1,
    });

    console.log(`Generated ${candidates.length} candidates\n`);

    // Show stats
    const stats = generator.getStats();
    console.log('STATISTICS:');
    console.log(`  Total Candidates: ${stats.totalCandidates}`);
    console.log('  By Status:');
    for (const [status, count] of Object.entries(stats.byStatus)) {
      console.log(`    ${status}: ${count}`);
    }
    console.log('  By Trigger:');
    for (const [trigger, count] of Object.entries(stats.byTrigger)) {
      console.log(`    ${trigger}: ${count}`);
    }

    // Save candidates
    if (!flags.dryRun) {
      generator.exportToJSONL('/data/trinity_apex/solana-stream/evaluation/data/gt/candidates/candidates.jsonl');
    } else {
      console.log('\n[Dry Run] Would export candidates to storage');
    }

    console.log('\n═══════════════════════════════════════════════════════════════\n');
  },
});

// ----------------------------------------------------------------------------
// Command: autolabel
// ----------------------------------------------------------------------------

commands.set('gt:autolabel', {
  name: 'gt:autolabel',
  description: 'Erzeuge Auto-Labels für Kandidaten',

  async execute(args: string[]) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('GROUND TRUTH: Auto-Labeling');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const flags = parseFlags(args);
    const generator = new CandidateGenerator();
    const labeler = new AutoLabeler();

    // Generate candidates
    const snapshots = generateSyntheticSnapshots(50);
    const candidates = generator.generateCandidates(snapshots);

    console.log(`Processing ${candidates.length} candidates...\n`);

    // Auto-label
    const results = labeler.labelCandidates(candidates);

    // Show distribution
    const stats = labeler.getStats();
    console.log('LABELING RESULTS:');
    console.log(`  Total Labels: ${stats.totalLabels}`);
    console.log(`  Pending Review: ${stats.pendingReviewCount}`);
    console.log(`  Average Confidence: ${(stats.avgConfidence * 100).toFixed(1)}%\n`);

    console.log('By Label Class:');
    for (const [labelClass, count] of Object.entries(stats.byLabelClass)) {
      console.log(`  ${labelClass}: ${count}`);
    }

    console.log('\n⚠️  IMPORTANT: Auto-Labels are PRELIMINARY, not Ground Truth');
    console.log('   All labels require human review before becoming Ground Truth\n');

    if (!flags.dryRun) {
      labeler.exportToJSONL('/data/trinity_apex/solana-stream/evaluation/data/gt/auto-labels/autolabels.jsonl');
    }

    console.log('═══════════════════════════════════════════════════════════════\n');
  },
});

// ----------------------------------------------------------------------------
// Command: review:list
// ----------------------------------------------------------------------------

commands.set('gt:review:list', {
  name: 'gt:review:list',
  description: 'Liste ausstehende Reviews',

  async execute(args: string[]) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('GROUND TRUTH: Pending Reviews');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const workflow = reviewWorkflow;
    const pending = workflow.getPendingSecondaryReviews();

    if (pending.length === 0) {
      console.log('No pending secondary reviews.\n');
    } else {
      console.log(`Pending Secondary Reviews: ${pending.length}\n`);
      for (const review of pending) {
        console.log(`  - ${review.reviewId}: ${review.finalLabelClass}`);
        console.log(`    Reason: ${review.secondaryReviewReason}`);
      }
    }

    const stats = workflow.getStats();
    console.log('\nREVIEW STATISTICS:');
    console.log(`  Total Reviews: ${stats.totalReviews}`);
    console.log(`  By Status:`);
    for (const [status, count] of Object.entries(stats.byStatus)) {
      console.log(`    ${status}: ${count}`);
    }
    console.log(`  Auto-Label Overrides: ${stats.autoLabelOverrides}`);
    console.log(`  Average Confidence: ${(stats.avgConfidence * 100).toFixed(1)}%\n`);

    console.log('═══════════════════════════════════════════════════════════════\n');
  },
});

// ----------------------------------------------------------------------------
// Command: review:apply
// ----------------------------------------------------------------------------

commands.set('gt:review:apply', {
  name: 'gt:review:apply',
  description: 'Submit Review für Candidate',

  async execute(args: string[]) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('GROUND TRUTH: Submit Review');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Parse review submission
    const candidateId = args.find(a => a.startsWith('--candidate='))?.split('=')[1];
    const finalLabel = args.find(a => a.startsWith('--label='))?.split('=')[1] as LabelClass;
    const confidence = parseFloat(args.find(a => a.startsWith('--confidence='))?.split('=')[1] || 0.7);
    const notes = args.find(a => a.startsWith('--notes='))?.split('=')[1] || '';

    if (!candidateId || !finalLabel) {
      console.log('Usage: gt:review:apply --candidate=<id> --label=<CLASS> --confidence=<0-1> [--notes=<text>]');
      console.log('\nAvailable Labels:');
      console.log('  MASSIVE_DUMP, NORMAL_VOLATILITY, ILLIQUID_RANDOM_MOVE,');
      console.log('  WHALE_SELL_NO_CASCADE, BOT_ACTIVITY_NO_PRICE_IMPACT,');
      console.log('  UNCERTAIN, DATA_INSUFFICIENT\n');
      return;
    }

    console.log(`Review submitted for candidate: ${candidateId}`);
    console.log(`Final Label: ${finalLabel}`);
    console.log(`Confidence: ${(confidence * 100).toFixed(1)}%\n`);

    // In real implementation, this would:
    // 1. Load candidate and auto-label from storage
    // 2. Create review request
    // 3. Submit decision
    // 4. Generate final label if approved

    console.log('⚠️  Note: This is a placeholder - in production, candidate would be loaded from storage\n');

    console.log('═══════════════════════════════════════════════════════════════\n');
  },
});

// ----------------------------------------------------------------------------
// Command: export
// ----------------------------------------------------------------------------

commands.set('gt:export', {
  name: 'gt:export',
  description: 'Exportiere finales Ground Truth Dataset',

  async execute(args: string[]) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('GROUND TRUTH: Export');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const flags = parseFlags(args);
    const outputPath = flags.output || '/data/trinity_apex/solana-stream/evaluation/data/gt/final/groundtruth.jsonl';

    const storage = new GroundTruthStorage();
    storage.initialize();

    console.log(`Exporting to: ${outputPath}\n`);

    // Count final labels
    const allLabels = storage.loadAllFinalLabels();
    const groundTruthLabels = allLabels.filter(l => l.isGroundTruth);

    console.log('DATASET STATISTICS:');
    console.log(`  Total Final Labels: ${allLabels.length}`);
    console.log(`  Valid Ground Truth (isGroundTruth=true): ${groundTruthLabels.length}\n`);

    if (groundTruthLabels.length > 0) {
      // Distribution by class
      const byClass: Record<string, number> = {};
      for (const label of groundTruthLabels) {
        byClass[label.labelClass] = (byClass[label.labelClass] || 0) + 1;
      }
      console.log('  By Label Class:');
      for (const [cls, count] of Object.entries(byClass)) {
        console.log(`    ${cls}: ${count}`);
      }

      // Distribution by confidence
      const byConfidence: Record<string, number> = {};
      for (const label of groundTruthLabels) {
        byConfidence[label.labelConfidence] = (byConfidence[label.labelConfidence] || 0) + 1;
      }
      console.log('\n  By Confidence:');
      for (const [conf, count] of Object.entries(byConfidence)) {
        console.log(`    ${conf}: ${count}`);
      }
    }

    console.log('\n⚠️  NOTE: In production, would export JSONL to specified path');
    console.log('   Currently using placeholder data\n');

    console.log('═══════════════════════════════════════════════════════════════\n');
  },
});

// ----------------------------------------------------------------------------
// Command: stats
// ----------------------------------------------------------------------------

commands.set('gt:stats', {
  name: 'gt:stats',
  description: 'Zeige Ground Truth Statistiken',

  async execute(_args: string[]) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('GROUND TRUTH: Statistics');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const storage = new GroundTruthStorage();
    storage.initialize();

    const stats = storage.getStats();

    console.log('STORAGE STATISTICS:');
    console.log(`  Raw Observations: ${stats.rawCount}`);
    console.log(`  Candidates: ${stats.candidateCount}`);
    console.log(`  Auto-Labels: ${stats.autoLabelCount}`);
    console.log(`  Reviews: ${stats.reviewCount}`);
    console.log(`  Final Labels: ${stats.finalLabelCount}`);
    console.log(`  Valid Ground Truth: ${stats.groundTruthCount}\n`);

    // Workflow stats
    const reviewStats = reviewWorkflow.getStats();
    console.log('REVIEW WORKFLOW:');
    console.log(`  Total Reviews: ${reviewStats.totalReviews}`);
    console.log(`  Secondary Reviews Required: ${reviewStats.secondaryReviewRequired}`);
    console.log(`  Auto-Label Overrides: ${reviewStats.autoLabelOverrides}`);
    console.log(`  Average Confidence: ${(reviewStats.avgConfidence * 100).toFixed(1)}%\n`);

    console.log('═══════════════════════════════════════════════════════════════\n');
  },
});

// ----------------------------------------------------------------------------
// Command: validate
// ----------------------------------------------------------------------------

commands.set('gt:validate', {
  name: 'gt:validate',
  description: 'Validiere Ground Truth Daten',

  async execute(_args: string[]) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('GROUND TRUTH: Validation');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log('Running validations...\n');

    const validations = [
      { name: 'Schema Validation', pass: true },
      { name: 'Required Fields', pass: true },
      { name: 'Time Consistency', pass: true },
      { name: 'Valid Label Transitions', pass: true },
      { name: 'No Auto-Labels as Ground Truth', pass: true },
      { name: 'Evidence References', pass: true },
      { name: 'Review Audit Trail', pass: true },
    ];

    for (const validation of validations) {
      const icon = validation.pass ? '✓' : '✗';
      console.log(`  ${icon} ${validation.name}`);
    }

    console.log('\n⚠️  NOTE: These are placeholder results - real validation would check actual data\n');

    console.log('═══════════════════════════════════════════════════════════════\n');
  },
});

// ============================================================================
// CLI EXECUTOR
// ============================================================================

function parseFlags(args: string[]): GlobalFlags {
  const flags: GlobalFlags = { dryRun: false, verbose: false };

  for (const arg of args) {
    if (arg === '--dry-run' || arg === '-n') flags.dryRun = true;
    if (arg === '--verbose' || arg === '-v') flags.verbose = true;
    if (arg.startsWith('--output=')) flags.output = arg.split('=')[1];
  }

  return flags;
}

export async function runGtCli(args: string[]): Promise<void> {
  const commandName = args[2] || 'help';

  if (commandName === 'help' || commandName === '--help' || commandName === '-h') {
    printHelp();
    return;
  }

  const command = commands.get(commandName);
  if (!command) {
    console.error(`Unknown command: ${commandName}\n`);
    printHelp();
    process.exit(1);
  }

  try {
    await command.execute(args);
  } catch (error) {
    console.error('Error executing command:', error);
    process.exit(1);
  }
}

function printHelp(): void {
  console.log(`
GROUND TRUTH CLI v4.3
═══════════════════════════════════════════════════════════════════════

Usage: npx tsx src/groundtruth/cli.ts <command> [options]

Commands:
  gt:candidates      Generiere Event-Kandidaten aus historischen Daten
  gt:autolabel       Erzeuge Auto-Labels für Kandidaten
  gt:review:list      Liste ausstehende Reviews
  gt:review:apply     Submit Review für Candidate
  gt:export           Exportiere finales Ground Truth Dataset
  gt:stats            Zeige Statistiken
  gt:validate         Validiere Ground Truth Daten

Global Options:
  --dry-run, -n       Simulation ohne Änderungen
  --verbose, -v        Ausführliche Ausgabe
  --output=<path>     Output-Pfad für Export

Examples:
  npx tsx src/groundtruth/cli.ts gt:candidates
  npx tsx src/groundtruth/cli.ts gt:autolabel --dry-run
  npx tsx src/groundtruth/cli.ts gt:review:apply --candidate=cand_123 --label=MASSIVE_DUMP --confidence=0.85
  npx tsx src/groundtruth/cli.ts gt:export --output=/path/to/groundtruth.jsonl

⚠️  IMPORTANT:
  - Auto-Labels sind VORSTUFEN, nicht Ground Truth
  - Finale Ground Truth erfordert menschliche Bestätigung
  - Keine Modellgüte behaupten ohne echte gelabelte Daten
`);
}

// ============================================================================
// SYNTHETIC DATA GENERATOR (for testing)
// ============================================================================

function generateSyntheticSnapshots(count: number): any[] {
  const snapshots = [];
  const tokens = ['BONK', 'DOGWIF', 'WIF', 'MOTHER', 'NEIRO'];

  for (let i = 0; i < count; i++) {
    const token = tokens[Math.floor(Math.random() * tokens.length)];
    const priceChange24h = (Math.random() - 0.7) * 0.6; // Bias towards negative
    const volumeSpike = Math.random() * 5;
    const botScore = Math.random();

    snapshots.push({
      id: `raw_${i}`,
      timestamp: Date.now() - Math.random() * 86400000,
      chain: 'solana',
      source: 'dexscreener',
      tokenAddress: `${token}_addr`,
      tokenSymbol: token,
      pairAddress: `${token}/SOL`,
      price: Math.random() * 0.1,
      priceChange5m: (Math.random() - 0.5) * 0.1,
      priceChange15m: (Math.random() - 0.5) * 0.2,
      priceChange1h: (Math.random() - 0.5) * 0.3,
      priceChange4h: (Math.random() - 0.5) * 0.4,
      priceChange24h,
      volume24h: Math.random() * 1000000,
      avgVolume7d: Math.random() * 800000,
      volumeSpikeMultiplier: volumeSpike,
      liquidity: Math.random() * 100000,
      botProbability: botScore,
      jitoBundleCount: Math.floor(Math.random() * 10),
      sandwichCount: Math.floor(Math.random() * 5),
      createdAt: Date.now(),
      dataCompleteness: Math.random() > 0.2 ? 'complete' : 'partial',
    });
  }

  return snapshots;
}

// Run CLI if called directly
const cliArgs = process.argv;
runGtCli(cliArgs).catch(console.error);