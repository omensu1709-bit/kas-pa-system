/**
 * KAS PA v4.3 - Ground Truth Aufbauplan
 *
 * Dokumentiert den Prozess zur Erstellung eines validierten Ground-Truth Datasets.
 * Solange kein Ground Truth existiert, sind alle Metriken (Precision, FPR, Ranking)
 * nur hypothetisch - keine empirische Aussagekraft.
 */

export interface GroundTruthPlan {
  // Phase 1: Daten sammeln
  dataRequirements: {
    priceData: DataRequirement;
    volumeData: DataRequirement;
    liquidityData: DataRequirement;
    botData: DataRequirement;
  };

  // Phase 2: Event-Identifikation
  eventIdentification: {
    automaticHeuristics: LabelRule[];
    manualRules: LabelRule[];
    confidenceThresholds: ConfidenceThreshold[];
  };

  // Phase 3: Label-Anwendung
  labeling: {
    workflow: LabelingWorkflow;
    minEventsPerClass: Record<string, number>;
    qualityChecks: QualityCheck[];
  };

  // Phase 4: Speicherformat
  storage: {
    format: 'jsonl';
    schema: string;
    path: string;
  };
}

interface DataRequirement {
  source: string;
  resolution: string;
  timeRange: string;
  tokens: string[];
  missingDataHandling: 'skip' | 'interpolate' | 'halt';
}

interface LabelRule {
  name: string;
  conditions: string;
  label: string;
  type: 'automatic' | 'manual';
  priority: number;
}

interface ConfidenceThreshold {
  minConfidence: number;
  label: string;
  requiresManualReview: boolean;
}

interface LabelingWorkflow {
  step1: { name: string; description: string };
  step2: { name: string; description: string };
  step3: { name: string; description: string };
  step4: { name: string; description: string };
}

interface QualityCheck {
  check: string;
  failCondition: string;
  action: string;
}

// ============================================================================
// PHASE 1: DATENANFORDERUNGEN
// ============================================================================

export const GROUND_TRUTH_DATA_REQUIREMENTS: GroundTruthPlan['dataRequirements'] = {
  priceData: {
    source: 'DexScreener / Binance / Chainstack',
    resolution: '1-Sekunde',
    timeRange: '14 Tage (für Walk-Forward)',
    tokens: '35 hardcoded + 24 DexScreener = 59 Tokens',
    missingDataHandling: 'skip',
  },

  volumeData: {
    source: 'DexScreener / OrderBook',
    resolution: '30-Sekunden',
    timeRange: '14 Tage',
    tokens: '59 Tokens',
    missingDataHandling: 'interpolate',
  },

  liquidityData: {
    source: 'DexScreener /流动性监控',
    resolution: '5-Minuten',
    timeRange: '14 Tage',
    tokens: '59 Tokens',
    missingDataHandling: 'skip',
  },

  botData: {
    source: 'Chainstack / Helius RPC',
    resolution: '5-Sekunden',
    timeRange: '14 Tage',
    tokens: '59 Tokens',
    missingDataHandling: 'skip',
  },
};

// ============================================================================
// PHASE 2: EVENT-IDENTIFIKATION
// ============================================================================

export const AUTOMATIC_LABEL_HEURISTICS: LabelRule[] = [
  {
    name: 'AUTOMATIC_MASSIVEDUMP_24H',
    conditions: 'priceChange24h <= -0.30',
    label: 'MASSIVEDUMP',
    type: 'automatic',
    priority: 1,
  },
  {
    name: 'AUTOMATIC_MASSIVEDUMP_4H',
    conditions: 'priceChange4h <= -0.20',
    label: 'MASSIVEDUMP',
    type: 'automatic',
    priority: 2,
  },
  {
    name: 'AUTOMATIC_VOLUMESPIKE',
    conditions: 'volume24h > 3 * avgVolume7d AND priceChange4h < -0.10',
    label: 'MASSIVEDUMP',
    type: 'automatic',
    priority: 3,
  },
  {
    name: 'AUTOMATIC_NORMAL_VOLATILITY',
    conditions: 'priceChange24h > -0.15 AND volumeSpike < 2.0',
    label: 'NORMALVOLATILITY',
    type: 'automatic',
    priority: 1,
  },
  {
    name: 'AUTOMATIC_ILLIQUID_RANDOM',
    conditions: 'priceChange1h <= -0.20 AND liquidityDrop > 0.50 AND botActivity < 0.5',
    label: 'ILLIQUIDRANDOMMOVE',
    type: 'automatic',
    priority: 2,
  },
  {
    name: 'AUTOMATIC_WHALE_SELL',
    conditions: 'whaleVolume > 100 SOL AND followOnTxs < 3 AND priceChange4h < -0.25',
    label: 'WHALESELLNOCASCADE',
    type: 'automatic',
    priority: 2,
  },
  {
    name: 'AUTOMATIC_BOT_NO_IMPACT',
    conditions: 'botProbability >= 0.70 AND priceChange4h > -0.05',
    label: 'BOTACTIVITYNOPRICEIMPACT',
    type: 'automatic',
    priority: 1,
  },
];

export const MANUAL_LABEL_RULES: LabelRule[] = [
  {
    name: 'MANUAL_CASCADE_VERIFICATION',
    conditions: 'Event hat >= 2 Follow-on Transaktionen innerhalb 1h',
    label: 'MASSIVEDUMP',
    type: 'manual',
    priority: 1,
  },
  {
    name: 'MANUAL_COORDINATION_CHECK',
    conditions: '>= 3 Wallets mit koordinierter Aktivität',
    label: 'MASSIVEDUMP',
    type: 'manual',
    priority: 2,
  },
  {
    name: 'MANUAL_CONTEXT_EVALUATION',
    conditions: 'Ereignis hat bekannte externe Ursache (News, Rug, etc.)',
    label: 'NORMALVOLATILITY',
    type: 'manual',
    priority: 1,
  },
  {
    name: 'MANUAL_MARKET_REGIME_CHECK',
    conditions: 'Event tritt in bekannter Volatilitätsphase auf',
    label: 'NORMALVOLATILITY',
    type: 'manual',
    priority: 2,
  },
];

export const CONFIDENCE_THRESHOLDS: ConfidenceThreshold[] = [
  {
    minConfidence: 0.9,
    label: 'MASSIVEDUMP',
    requiresManualReview: false,
  },
  {
    minConfidence: 0.8,
    label: 'MASSIVEDUMP',
    requiresManualReview: true,
  },
  {
    minConfidence: 0.7,
    label: 'NORMALVOLATILITY',
    requiresManualReview: false,
  },
  {
    minConfidence: 0.6,
    label: '*',
    requiresManualReview: true, // Alles unter 60% muss manuell geprüft werden
  },
];

// ============================================================================
// PHASE 3: LABELING WORKFLOW
// ============================================================================

export const LABELING_WORKFLOW: GroundTruthPlan['labeling'] = {
  workflow: {
    step1: {
      name: 'Data Collection',
      description: 'Sammle 14 Tage historische Daten für 59 Tokens',
    },
    step2: {
      name: 'Automatic Labeling',
      description: 'Wende automatische Heuristiken auf alle Zeitpunkte an',
    },
    step3: {
      name: 'Confidence Scoring',
      description: 'Berechne Konfidenz-Score pro Event',
    },
    step4: {
      name: 'Manual Review',
      description: 'Menschen prüfen Events mit Confidence < 0.8',
    },
  },

  minEventsPerClass: {
    MASSIVEDUMP: 30,      // Minimum für statistische Signifikanz
    NORMALVOLATILITY: 100, // Majority class
    ILLIQUIDRANDOMMOVE: 15,
    WHALESELLNOCASCADE: 15,
    BOTACTIVITYNOPRICEIMPACT: 20,
  },

  qualityChecks: [
    {
      check: 'Label Distribution',
      failCondition: 'MASSIVEDUMP < 10% oder > 50%',
      action: 'Revidiere Schwellenwerte',
    },
    {
      check: 'Temporal Coverage',
      failCondition: 'Lücken > 4h ohne Daten',
      action: 'Ergänze Daten oder markiere Lücke',
    },
    {
      check: 'Class Balance',
      failCondition: 'Jede Klasse < minEventsPerClass',
      action: 'Sammle mehr Daten',
    },
    {
      check: 'Inter-Rater Reliability',
      failCondition: 'Cohen`s Kappa < 0.7',
      action: 'Überarbeite Label-Regeln',
    },
  ],
};

// ============================================================================
// PHASE 4: SPEICHERFORMAT
// ============================================================================

export const GROUND_TRUTH_STORAGE = {
  format: 'jsonl',  // Eine Zeile pro Event, komprimierbar
  schema: 'GroundTruthRecord', // Definiert in labels/schema.ts
  path: '/data/trinity_apex/solana-stream/evaluation/data/labels/',

  // Partitionierung nach Zeitraum
  partitioning: {
    byDay: true,
    byToken: true,
  },

  // Dateiname-Konvention
  filenamePattern: 'ground_truth_{token}_{date}.jsonl',

  // Komprimierung
  compression: 'zstd',
};

// ============================================================================
// IMPLEMENTATION: LABELING WORKFLOW EXECUTOR
// ============================================================================

export class GroundTruthBuilder {
  private events: Map<string, any> = new Map();
  private automaticLabels: number = 0;
  private manualLabels: number = 0;

  /**
   * Führe automatische Labeling durch
   */
  runAutomaticLabeling(priceData: Map<string, number>, volumeData: Map<string, number>): number {
    let labeled = 0;

    for (const [token, priceChange24h] of priceData) {
      const label = this.autoLabel({ priceChange24h, volumeData });

      if (label) {
        this.automaticLabels++;
        labeled++;
      }
    }

    return labeled;
  }

  /**
   * Auto-Label Funktion basierend auf Heuristiken
   */
  private autoLabel(data: {
    priceChange24h?: number;
    priceChange4h?: number;
    volume24h?: number;
    botProbability?: number;
  }): string | null {
    // MASSIVEDUMP Check
    if (data.priceChange24h !== undefined && data.priceChange24h <= -0.30) {
      return 'MASSIVEDUMP';
    }

    if (data.priceChange4h !== undefined && data.priceChange4h <= -0.20) {
      return 'MASSIVEDUMP';
    }

    // BOTACTIVITYNOPRICEIMPACT Check
    if (data.botProbability !== undefined && data.botProbability >= 0.70) {
      if (data.priceChange4h === undefined || data.priceChange4h > -0.05) {
        return 'BOTACTIVITYNOPRICEIMPACT';
      }
    }

    // NORMALVOLATILITY (Default)
    return 'NORMALVOLATILITY';
  }

  /**
   * Manueller Review für low-confidence Events
   */
  flagForManualReview(eventId: string): void {
    // Markiere Event für manuelle Prüfung
    const event = this.events.get(eventId);
    if (event) {
      event.needsManualReview = true;
    }
  }

  /**
   * Statistiken
   */
  getStats(): {
    totalEvents: number;
    byLabel: Record<string, number>;
    automaticLabels: number;
    manualLabels: number;
    flaggedForReview: number;
  } {
    const byLabel: Record<string, number> = {};
    let flaggedForReview = 0;

    for (const event of this.events.values()) {
      byLabel[event.label] = (byLabel[event.label] || 0) + 1;
      if (event.needsManualReview) flaggedForReview++;
    }

    return {
      totalEvents: this.events.size,
      byLabel,
      automaticLabels: this.automaticLabels,
      manualLabels: this.manualLabels,
      flaggedForReview,
    };
  }

  /**
   * Exportiere als JSONL
   */
  exportToJSONL(path: string): void {
    const lines: string[] = [];
    for (const event of this.events.values()) {
      lines.push(JSON.stringify(event));
    }
    // writeFileSync(path, lines.join('\n') + '\n');
    console.log(`Would export ${lines.length} events to ${path}`);
  }
}

// ============================================================================
// CHECKLISTE: GROUND TRUTH AUFBAU
// ============================================================================

export const GROUND_TRUTH_CHECKLIST = [
  {
    step: 1,
    task: 'Historische Preis-Daten sammeln',
    status: 'PENDING',
    owner: 'Data Collection',
    estimatedHours: 8,
  },
  {
    step: 2,
    task: 'Volume-Daten aggregieren',
    status: 'PENDING',
    owner: 'Data Collection',
    estimatedHours: 4,
  },
  {
    step: 3,
    task: 'Bot-Aktivität-Daten回放',
    status: 'PENDING',
    owner: 'Data Collection',
    estimatedHours: 6,
  },
  {
    step: 4,
    task: 'Automatische Labeling ausführen',
    status: 'PENDING',
    owner: 'Automatic Labeling',
    estimatedHours: 2,
  },
  {
    step: 5,
    task: 'Low-Confidence Events manuell prüfen',
    status: 'PENDING',
    owner: 'Manual Review',
    estimatedHours: 16,
  },
  {
    step: 6,
    task: 'Quality Checks durchführen',
    status: 'PENDING',
    owner: 'QA',
    estimatedHours: 4,
  },
  {
    step: 7,
    task: 'Ground Truth Dataset validieren',
    status: 'PENDING',
    owner: 'Validation',
    estimatedHours: 8,
  },
  {
    step: 8,
    task: 'Backtesting Engine mit echten Daten füttern',
    status: 'PENDING',
    owner: 'Backtesting',
    estimatedHours: 4,
  },
];

/**
 * Geschätzter Aufwand:
 *
 * Phase 1-3 (Data Collection + Labeling): ~40 Stunden
 * Phase 4-7 (Manual Review + QA): ~28 Stunden
 * Phase 8 (Backtesting Setup): ~4 Stunden
 *
 * GESAMT: ~72 Stunden (2 Wochen Vollzeit)
 *
 * Alternativ: Mit halb-automatischer Pipeline ~40 Stunden
 */