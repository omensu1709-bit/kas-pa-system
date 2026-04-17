/**
 * Ground-Truth Review System — Typdefinitionen
 * KAS PA v4.3 — Pilot Review Round 1
 *
 * WICHTIG: Detection-Reasons und Modell-Predictions werden in PilotEventBlind
 * bewusst NICHT exportiert. Sie sind nur in PilotEventFull vorhanden und
 * dürfen Reviewern NICHT vor dem Labeling gezeigt werden.
 */

// ─── Klassen ────────────────────────────────────────────────────────────────

export type GroundTruthLabel =
  | 'MASSIVE_DUMP'
  | 'NORMAL_VOLATILITY'
  | 'ILLIQUID_RANDOM_MOVE'
  | 'WHALE_SELL_NO_CASCADE'
  | 'BOT_ACTIVITY_NO_PRICE_IMPACT'
  | 'UNCERTAIN'
  | 'DATA_INSUFFICIENT';

// ─── Secondary Review Reason Codes ──────────────────────────────────────────

export type SecondaryReviewReason =
  | 'LOW_CONFIDENCE'
  | 'DATA_GAP'
  | 'CRITICAL_WINDOW_GAP'
  | 'CLASS_CONFLICT_MD_IL'
  | 'CLASS_CONFLICT_MD_WH'
  | 'DISAGREEMENT_UNCERTAIN'
  | 'ALT_LABEL_LOW_CONF'
  | 'UNCERTAIN_HIGH_CONF'
  | 'THRESHOLD_ZONE'
  | 'BOT_PRICE_BORDER'
  | 'NO_TREE_PATH';

// ─── Crash-Metriken (Rohdaten — sichtbar für Reviewer) ──────────────────────

export interface CrashMetrics {
  /** Hawkes Normalization — HIGH dangerous (> 0.8) */
  n: number;
  /** Price Entropy — LOW dangerous (< 0.35) */
  PE: number;
  /** Molloy-Reed Index — LOW dangerous (< 3.0) */
  kappa: number;
  /** Market Fragmentation — HIGH dangerous (> 0.7) */
  fragmentation: number;
  /** Epidemic Rt — HIGH dangerous (> 1.2) */
  rt: number;
  /** Gutenberg-Richter b-value — LOW dangerous (< 1.0) */
  bValue: number;
  /** Cluster Transfer Entropy — HIGH dangerous (> 0.6) */
  CTE: number;
  /** Super-Spreader Index — HIGH dangerous (> 5.0) */
  SSI: number;
  /** Liquidity Flow Index — HIGH dangerous (> 2.0) */
  LFI: number;
}

// ─── Preisstruktur (sichtbar für Reviewer) ──────────────────────────────────

export interface PriceStructure {
  priceChangePct60min: number;       // Δ% in 60 Minuten
  priceChange1min: number;           // Δ% in 1 Minute (Peak)
  priceChange5min: number;           // Δ% in 5 Minuten
  acceleration: number;              // d²P/dt² (positiv = Beschleunigung nach unten)
  isFlashCrash: boolean;             // < 5 Min für > 10% Drop
  lowestPricePct: number;            // Tiefster Punkt vs. Startpreis
  recoveryPct: number;               // Erholung von Tief in 30 Min (% des Drops)
}

// ─── Volumen & Liquidität (sichtbar für Reviewer) ───────────────────────────

export interface VolumeStructure {
  buyVolumePct: number;              // Buy-Anteil am Gesamtvolumen
  sellVolumePct: number;             // Sell-Anteil am Gesamtvolumen
  volumeRatioVsBaseline: number;     // Aktuelles Volumen / 24h-Baseline
  orderBookDepthLevels: number;      // Anzahl aktiver Levels im Order-Book
  spreadVsNormal: number;            // Aktueller Spread / Normalspread
  totalTradesInWindow: number;       // Trades im Beobachtungsfenster
  largestSingleOrderPct: number;     // Größte Einzelorder / Gesamtvolumen
}

// ─── Whale & Bot Signale (sichtbar für Reviewer) ────────────────────────────

export interface StructureSignals {
  whaleWalletIdentified: boolean;
  whaleWalletSizePct: number | null;    // % des Circulating Supply
  whaleTransactionSizePct: number | null; // % des 24h-Volumens
  cascadeFollowsSellCount: number;      // Sells > 1% Vol innerhalb 10 Min nach Whale
  botProbability: number;               // 0–100
  jitoBundleCount: number;
  sandwichCount: number;
  sniperCount: number;
  arbitrageCount: number;
  tradeFrequencyVsBaseline: number;     // x-faches der Baseline-Frequenz
}

// ─── Data Quality ────────────────────────────────────────────────────────────

export interface DataQuality {
  totalTrades: number;
  feedGapMinutes: number;             // Größte Preis-Feed-Lücke
  feedGapInCriticalWindow: boolean;   // Lücke genau während stärkstem Drop?
  metricsAvailable: number;           // Von 9 Metriken berechenbar
  walletDataAvailable: boolean;
  orderBookDataAvailable: boolean;
}

// ─── Pilot Event — BLIND VERSION (für Reviewer) ─────────────────────────────

export interface PilotEventBlind {
  eventId: string;                    // Anonymisiert — kein Token-Name
  windowStart: string;                // ISO8601 — kein Ticker-Hinweis
  windowEnd: string;
  metrics: CrashMetrics;
  price: PriceStructure;
  volume: VolumeStructure;
  structure: StructureSignals;
  dataQuality: DataQuality;
  // KEIN: zone, crashProbability, detectionReason, tokenSymbol, marketCap
}

// ─── Pilot Event — FULL VERSION (intern, nur für Generator) ─────────────────

export interface PilotEventFull extends PilotEventBlind {
  _internal: {
    designedLabel: GroundTruthLabel;    // Was der Designer beabsichtigt hat
    designNotes: string;                // Warum dieser Fall so gesetzt wurde
    expectedDifficulty: 'CLEAR' | 'MODERATE' | 'HARD';
    knownConfusionRisk: string[];       // Klassen mit bekanntem Verwechslungsrisiko
    // Modell-Output — ERST NACH Review zeigen:
    modelZone: string;
    modelCrashProbability: number;
    modelDetectionReason: string;
  };
}

// ─── Review-Formular (Abgabe durch Reviewer) ────────────────────────────────

export interface ReviewSubmission {
  eventId: string;
  reviewerId: string;                 // Anonymisiert
  reviewTimestamp: string;            // ISO8601
  finalLabel: GroundTruthLabel;
  confidence: number;                 // 0.0–1.0 (< 0.6 = Auto-UNCERTAIN)
  alternativeLabel: GroundTruthLabel | null;
  secondaryReviewRequired: boolean;
  secondaryReviewReason: SecondaryReviewReason | null;
  keyEvidence: string[];              // Exakt 2–3 Einträge
  contradictingEvidence: string[];    // 0–2 Einträge
  detectionReasonSeen: boolean;       // MUSS false sein für valides Review
  reviewNote: string;
  dataQualityScore: 1 | 2 | 3 | 4 | 5;
}

// ─── Pair-Vergleich nach beiden Reviews ─────────────────────────────────────

export interface ReviewPair {
  eventId: string;
  reviewA: ReviewSubmission;
  reviewB: ReviewSubmission;
  agreed: boolean;
  sameClass: boolean;
  confidenceDiff: number;
  conflictType: 'NONE' | 'CONFIDENCE_ONLY' | 'ADJACENT_CLASS' | 'CRITICAL_CONFLICT' | 'FULL_DISAGREEMENT';
  requiresSecondary: boolean;
}

// ─── S4-Filter Typen ─────────────────────────────────────────────────────────

/**
 * Deterministischer S4-Filter Input.
 * Wird aus PilotEventBlind.volume und .structure extrahiert.
 */
export interface S4FilterInput {
  eventId: string;
  orderBookDepthLevels: number;
  /** volumeRatioVsBaseline aus VolumeStructure */
  volumeSpikeMultiplier: number;
  /** Welche Labels sind im Konflikt (von ReviewPair abgeleitet) */
  reviewerLabelA: GroundTruthLabel;
  reviewerLabelB: GroundTruthLabel;
}

/** Ergebnis des S4-Pre-Filters für ein Event */
export interface S4FilterResult {
  eventId: string;
  applicable: boolean;           // true wenn MASSIVE_DUMP↔ILLIQUID Konflikt
  deterministicLabel: 'MASSIVE_DUMP' | 'ILLIQUID_RANDOM_MOVE' | 'UNCERTAIN' | 'NOT_APPLICABLE';
  orderBookDepthLevels: number;
  volumeSpikeMultiplier: number;
  volumeCoefficient: number;     // normierter Score 0–1 (hoch = MASSIVE_DUMP-Tendenz)
  splitPoint: 'BELOW_OB_THRESHOLD' | 'ABOVE_OB_THRESHOLD' | 'N/A';
  conflictResolved: boolean;     // true wenn beide Reviewer-Labels durch deterministicLabel eindeutig aufgelöst
  overridesReviewerA: boolean;
  overridesReviewerB: boolean;
  rationale: string;
}

// ─── Asymmetrische Penalty-Matrix ────────────────────────────────────────────

/**
 * Penalty-Gewichte für jeden Konflikttyp im Paar (labelA, labelB).
 * Werte > 1.0 = Übergewichtung (exponentieller Abzug vom Validierungs-Score).
 *
 * EXECUTION_CLASSES = Labels die einen Short-Trade auslösen können: MASSIVE_DUMP
 * NOISE_CLASSES     = Labels die zu keiner Execution führen: ILLIQUID, NORMAL, BOT, DATA_INSUFF
 *
 * Ein Konflikt zwischen EXECUTION und NOISE ist operativ gefährlicher als
 * zwei NOISE-Klassen untereinander — daher asymmetrische Gewichtung.
 */
export type PenaltyMatrix = Record<GroundTruthLabel, Record<GroundTruthLabel, number>>;

/** Ergebnis der gewichteten Kappa-Berechnung */
export interface WeightedAgreementScore {
  /** Linearer Cohen's Kappa (ungewichtet, zur Referenz) */
  cohensKappa: number;
  /**
   * KAS-Score: asymmetrisch gewichteter Validierungs-Score (0–1).
   * Wird durch kritische Konflikte EXECUTION↔NOISE exponentiell gedrückt.
   * Ziel: >= 0.85 für VALIDATED-Status.
   */
  kasScore: number;
  /** Penalty-Faktor der angewendet wurde (1.0 = kein Abzug) */
  penaltyFactor: number;
  /** Welche Konflikte den KAS-Score am stärksten gedrückt haben */
  penaltyBreakdown: Array<{
    eventId: string;
    labelA: GroundTruthLabel;
    labelB: GroundTruthLabel;
    penaltyWeight: number;
    contribution: number; // Anteil am Gesamt-Score-Abzug
  }>;
}

// ─── Validierungs-Status Gate ─────────────────────────────────────────────────

export type ValidationStatus =
  | 'BLOCKED'      // Kritische Konfusions-Zelle MASSIVE_DUMP↔ILLIQUID > 0
  | 'DEGRADED'     // KAS-Score < 0.85 aber keine kritische Zelle verletzt
  | 'VALIDATED'    // KAS-Score >= 0.85 UND kritische Zelle = 0
  | 'CALIBRATING'; // Erst-Pilot, noch keine Baseline

export interface ValidationGate {
  status: ValidationStatus;
  kasScore: number;
  cohensKappa: number;
  rawAgreementPct: number;
  /** Kritische Konfusions-Zelle: MASSIVE_DUMP(A) ↔ ILLIQUID(B) + ILLIQUID(A) ↔ MASSIVE_DUMP(B) */
  criticalCellCount: number;
  /** Wenn BLOCKED: welche Events blockieren den Gate-Übergang */
  blockingEvents: string[];
  /** Nächster Schritt um Status zu verbessern */
  nextAction: string;
}

// ─── Pilot-Report (erweitert) ─────────────────────────────────────────────────

export interface PilotReport {
  totalEvents: number;
  rawAgreementPct: number;
  cohensKappa: number;
  weightedScore: WeightedAgreementScore;
  validationGate: ValidationGate;
  s4FilterResults: S4FilterResult[];
  confusionMatrix: Record<GroundTruthLabel, Record<GroundTruthLabel, number>>;
  conflictPairs: Array<{ pair: [GroundTruthLabel, GroundTruthLabel]; count: number }>;
  uncertainRate: number;
  dataInsufficientRate: number;
  secondaryTriggersByReason: Record<SecondaryReviewReason, number>;
  problematicClassPairs: string[];
  rulesNeedingClarification: string[];
  recommendations: string[];
}
