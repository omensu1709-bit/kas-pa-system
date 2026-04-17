/**
 * KAS PA v4.3 - Ground Truth Workflow
 *
 * Vollständiger, methodisch sauberer Workflow zur Erstellung von Ground-Truth-Daten.
 *
 * ARCHITEKTUR-PRINZIPIEN:
 * 1. Klare Trennung zwischen Rohdaten, Kandidaten, Auto-Labels, Reviews und finaler Ground Truth
 * 2. Jeder Schritt ist auditierbar und reproduzierbar
 * 3. Keine stillschweigenden Annahmen - alles explizit dokumentiert
 * 4. Auto-Labels sind VORSTUFEN, nicht Wahrheit
 * 5. Finale Ground Truth erfordert menschliche Bestätigung
 *
 * LAYER:
 * Layer 1: RAW_OBSERVATION - Rohdatenpunkte
 * Layer 2: EVENT_CANDIDATE - Erkannte Kandidaten
 * Layer 3: PRELIMINARY_LABEL - Auto-Labels (vorläufig)
 * Layer 4: HUMAN_REVIEW - Manuelle Prüfung
 * Layer 5: FINAL_GROUND_TRUTH - Bestätigte Labels
 */

// ============================================================================
// PHASE 1: DATA MODEL - 5 LAYERS
// ============================================================================

/**
 * Layer 1: Raw Observation
 * Einzelne Rohdatenpunkte / Snapshots / API-Antworten
 */
export interface RawObservation {
  // Identifikation
  id: string;
  timestamp: number;
  chain: 'solana' | 'ethereum' | 'other';
  source: 'chainstack' | 'helius' | 'dexscreener' | 'binance' | 'internal';

  // Token Info
  tokenAddress: string;
  tokenSymbol: string;
  pairAddress: string;

  // Preis-Daten
  price?: number;
  priceChange5m?: number;
  priceChange15m?: number;
  priceChange1h?: number;
  priceChange4h?: number;
  priceChange24h?: number;

  // Volume-Daten
  volume24h?: number;
  avgVolume7d?: number;
  volumeSpikeMultiplier?: number;

  // Liquidity-Daten
  liquidity?: number;
  liquidityChange24h?: number;

  // OrderFlow
  buyVolume?: number;
  sellVolume?: number;
  buySellImbalance?: number;  // -1 bis 1

  // Bot-Daten
  botProbability?: number;
  jitoBundleCount?: number;
  sandwichCount?: number;
  liquidationCount?: number;
  backrunCount?: number;

  // Smart Money / Whale
  smartMoneyFlow?: number;  // positiv = net buy, negativ = net sell
  whaleTransactionCount?: number;
  whaleVolumeSol?: number;

  // Holder
  holderCount?: number;
  holderFragmentation?: number;

  // Transaktionen
  txCount?: number;
  txBurstScore?: number;

  // Graph-Metriken
  clusterScore?: number;
  structuralBreakScore?: number;

  // Raw JSON für Debugging
  rawJson?: Record<string, unknown>;

  // Meta
  createdAt: number;
  dataCompleteness: 'complete' | 'partial' | 'insufficient';
}

/**
 * Layer 2: Event Candidate
 * Automatisch oder halbautomatisch erkannter Kandidat
 */
export interface EventCandidate {
  // Identifikation
  candidateId: string;
  tokenAddress: string;
  tokenSymbol: string;
  pairAddress: string;
  chain: string;
  marketType: 'memecoin' | 'defi' | 'other';

  // Zeitstempel
  detectionTimestamp: number;
  candidateWindowStart: number;    // Wann das Event beginnt
  candidateWindowEnd: number;     // Wann das Event endet (kann geschätzt sein)
  triggerTime?: number;           // Wann der eigentliche Trigger ausgelöst wurde

  // Trigger-Info
  detectionRule: string;         // Welche Regel hat den Candidate erzeugt
  detectionConfidence: number;     // Wie sicher ist die Detection
  preliminaryEvidence: EvidenceRef[];

  // Event-Merkmale (berechnet aus Raw Observations)
  priceChange5m?: number;
  priceChange15m?: number;
  priceChange1h?: number;
  priceChange4h?: number;
  priceChange24h?: number;
  maxDrawdownDuringEvent?: number;

  volumeChange5m?: number;
  volumeChange1h?: number;
  liquidityChange?: number;
  buySellImbalance?: number;

  botActivityScore?: number;
  smartMoneyActivity?: number;
  whaleConcentration?: number;
  holderFragmentation?: number;
  transactionBurstScore?: number;
  clusterScore?: number;
  structuralBreakScore?: number;

  // Status
  status: 'candidate' | 'processing' | 'labeled' | 'reviewed' | 'final';
  version: number;

  // Referenzen
  sourceObservationIds: string[];  // Welche Raw Observations wurden verwendet

  // Meta
  createdAt: number;
  updatedAt: number;
  createdBy: 'system' | 'analyst';
  notes?: string;
}

/**
 * Evidence Reference
 * Verweis auf eine Evidenzquelle
 */
export interface EvidenceRef {
  type: 'price_drop' | 'volume_spike' | 'liquidity_drop' | 'bot_activity' |
        'whale_activity' | 'smart_money' | 'orderflow_imbalance' | 'transaction_burst' |
        'structural_break' | 'manual';
  sourceId: string;
  weight: number;  // 0-1, wie stark diese Evidenz für das Event spricht
  timestamp: number;
  details?: Record<string, unknown>;
}

/**
 * Layer 3: Preliminary Label
 * Vorläufiges maschinelles oder heuristisches Label
 */
export interface PreliminaryLabel {
  // Identifikation
  candidateId: string;
  labelId: string;

  // Label-Info
  labelClass: LabelClass;
  labelConfidence: number;         // 0-1
  labelingRule: string;            // Welche Regel/Heuristik wurde verwendet
  labelingReasons: string[];       // Dokumentation der Entscheidung

  // Evidenz
  supportingEvidence: EvidenceRef[];
  contradictingEvidence: EvidenceRef[];
  dataGaps: string[];              // Welche Daten fehlen für sichere Klassifikation

  // Status
  status: 'pending_review' | 'in_review' | 'reviewed' | 'approved' | 'rejected' | 'uncertain';
  version: number;

  // Meta
  labeledAt: number;
  labeledBy: 'system' | 'analyst';
  systemVersion?: string;          // Falls automatisch, welche Version des Systems

  // Dokumentation bekannter Schwächen
  knownWeaknesses: string[];       // z.B. "Regel funktioniert schlecht bei illiquiden Tokens"
  expectedFalsePositives: string[]; // Dokumentierte erwartete FP-Risiken
  expectedFalseNegatives: string[];// Dokumentierte erwartete FN-Risiken
}

/**
 * Label Classes
 */
export type LabelClass =
  | 'MASSIVE_DUMP'      // >= 30% Verlust in 24h, mit strukturellen Indikatoren
  | 'NORMAL_VOLATILITY' // Normale Marktbewegung, kein signifikantes Event
  | 'ILLIQUID_RANDOM_MOVE'  // Illiquider Einmal-Exit ohne Kaskade
  | 'WHALE_SELL_NO_CASCADE' // Einzelner Whale-Exit ohne Follow-on
  | 'BOT_ACTIVITY_NO_PRICE_IMPACT' // Bot-Aktivität ohne nachhaltigen Preiseffekt
  | 'UNCERTAIN'         // Strittiger Fall, nicht eindeutig klassifizierbar
  | 'DATA_INSUFFICIENT'; // Nicht genug Daten für Klassifikation

/**
 * Layer 4: Human Review
 * Manuelle Prüfung durch Analyst
 */
export interface HumanReview {
  // Identifikation
  candidateId: string;
  reviewId: string;

  // Review-Entscheidung
  finalLabelClass: LabelClass;
  reviewerConfidence: number;  // 0-1

  // Review-Notizen
  reviewNotes: string;
  evidenceSummary: string;    // Zusammenfassung derEvidenz

  // Ambiguitäten
  ambiguityFlags: AmbiguityFlag[];
  disagreementWithAutoLabel: boolean;
  disagreementReason?: string;

  // Review-Status
  status: 'primary_review' | 'secondary_review' | 'approved' | 'rejected' | 'escalated';
  needsSecondaryReview: boolean;
  secondaryReviewReason?: string;

  // Reviewer
  primaryReviewerId: string;
  secondaryReviewerId?: string;
  reviewTimestamp: number;

  // Meta
  reviewDurationMinutes?: number;
  toolUsed?: string;  // CLI, Web-Interface, etc.

  // Überschriebene Auto-Label?
  autoLabelOverridden: boolean;
  originalAutoLabel?: LabelClass;
}

/**
 * Ambiguity Flags
 */
export interface AmbiguityFlag {
  type: 'whale_vs_dump' | 'bot_vs_human' | 'illiquid_vs_cascade' |
        'data_conflict' | 'boundary_case' | 'missing_data' |
        'temporal_overlap' | 'classification_conflict';
  severity: 'low' | 'medium' | 'high';
  description: string;
  resolution?: string;
}

/**
 * Layer 5: Final Ground Truth Label
 * Final bestätigtes, versioniertes Label
 */
export interface FinalGroundTruthLabel {
  // Identifikation
  eventId: string;
  candidateId: string;

  // Token Info
  tokenAddress: string;
  tokenSymbol: string;
  pairAddress: string;
  chain: string;
  marketType: 'memecoin' | 'defi' | 'other';

  // Zeitstempel (EXAKT dokumentiert)
  startTime: number;         // Wann das Event begann
  triggerTime?: number;       // Wann der Trigger ausgelöst wurde
  peakImpactTime?: number;   // Wann der maximale Impact war
  recoveryTime?: number;      // Wann eine Erholung begann (optional)
  endTime?: number;           // Wann das Event offiziell endete

  // Label
  labelClass: LabelClass;
  labelVersion: string;       // Versionsstring
  labelStatus: 'preliminary' | 'reviewed' | 'approved' | 'rejected';
  labelConfidence: 'HIGH' | 'MEDIUM' | 'LOW';

  // Review
  reviewStatus: 'pending' | 'primary_reviewed' | 'secondary_reviewed' | 'final';
  reviewerId: string;
  reviewTimestamp: number;

  // Datenqualität
  dataCompleteness: 'complete' | 'partial' | 'insufficient';
  dataGaps: string[];

  // Numerische Event-Merkmale
  priceChange5m?: number;
  priceChange15m?: number;
  priceChange1h?: number;
  priceChange4h?: number;
  priceChange24h?: number;
  maxDrawdownDuringEvent?: number;

  volumeChange5m?: number;
  volumeChange1h?: number;
  liquidityChange?: number;
  buySellImbalance?: number;

  botActivityScore?: number;
  smartMoneyActivity?: number;
  whaleConcentration?: number;
  holderFragmentation?: number;
  transactionBurstScore?: number;
  clusterScore?: number;
  structuralBreakScore?: number;

  // Dokumentation
  notes?: string;
  evidenceSummary: string;

  // Referenzen
  sourceSet: string[];        // Welche Datenquellen wurden verwendet
  rawEvidenceRefs: string[]; // Referenzen zu Rohdaten
  featureSnapshotRefs: string[];
  reviewHistory: ReviewHistoryEntry[];

  // Meta
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  derivedFrom: string[];     // Welche Vorstufen wurden verwendet

  // Ambiguitäten
  ambiguityFlags: AmbiguityFlag[];

  // Finale Anmerkung
  isGroundTruth: boolean;     // Muss true sein für finale GT
}

/**
 * Review History Entry
 */
export interface ReviewHistoryEntry {
  timestamp: number;
  action: 'created' | 'auto_labeled' | 'primary_review' | 'secondary_review' |
          'approved' | 'rejected' | 'modified' | 'escalated';
  actor: string;
  details?: string;
  previousValue?: string;
  newValue?: string;
}

// ============================================================================
// PHASE 2: LABEL CLASS DEFINITIONS
// ============================================================================

export interface LabelClassDefinition {
  class: LabelClass;
  description: string;
  inclusionCriteria: string[];
  exclusionCriteria: string[];
  typicalFalsePositiveConfusions: string[];
  typicalFalseNegativeConfusions: string[];
  minimumDataRequirements: string[];
  confidenceFactors: string[];
}

export const LABEL_CLASS_DEFINITIONS: Record<LabelClass, LabelClassDefinition> = {
  MASSIVE_DUMP: {
    class: 'MASSIVE_DUMP',
    description: 'Signifikanter, anhaltender Preisverlust mit struktureller Vorbereitung',
    inclusionCriteria: [
      'Preisverlust >= 30% in 24h ODER >= 20% in 4h',
      'Mindestens 2 proxy-Metriken zeigen Anomalien (Bot, Liquidity, Volume)',
      'Mindestens 1 strukturelle Bedingung (Konsolidierung, Volume-Spike, Cluster)',
      'Preisverlust PERSISTIERT über >= 1h (nicht nur Flash-Crash)'
    ],
    exclusionCriteria: [
      'Isolierter Whale-Trade ohne Follow-on',
      'Illiquider Markt ohne normale Handelsaktivität',
      'Preisverlust < 15% in 24h',
      'Flash-Crash mit Erholung > 50% innerhalb 1h',
      'Datenlücken die > 30% der Zeitperiode abdecken'
    ],
    typicalFalsePositiveConfusions: [
      'NORMAL_VOLATILITY: Zu aggressive Volume-Spike-Interpretation',
      'ILLIQUID_RANDOM_MOVE: Verwechselung mit illiquider Volatilität'
    ],
    typicalFalseNegativeConfusions: [
      'Langsame продолжительный Dump über 48h+ wird als mehrere Events gezählt',
      'Koordinierte Whale-Aktivität wird als natürliche Marktbewegung fehlinterpretiert'
    ],
    minimumDataRequirements: [
      'Preisdaten: 24h Window mit 1min Auflösung',
      'Volume-Daten: Verfügbar für 24h',
      'Bot-Daten: Verfügbar für >= 12h vor Event'
    ],
    confidenceFactors: [
      'Anzahl bestätigender Metriken',
      'Konsistenz der Preisverlust-Messungen über Time-Windows',
      'Vorhandensein von Vorboten (Bot-Aktivität, Smart-Money-Exits)',
      'Datenqualität und -vollständigkeit'
    ]
  },

  NORMAL_VOLATILITY: {
    class: 'NORMAL_VOLATILITY',
    description: 'Normale Marktbewegung ohne signifikante strukturelle Ereignisse',
    inclusionCriteria: [
      'Preisverlust < 15% in 24h',
      'Keine ungewöhnlichen Bot-Aktivitäts-Cluster',
      'Volume innerhalb 2x des 7-Tage-Durchschnitts',
      'Keine klaren strukturellen Brüche'
    ],
    exclusionCriteria: [
      'Preisverlust >= 15% in 24h',
      'Bot-Probability >= 0.70',
      'Volume > 3x 7-Tage-Durchschnitt',
      'Liquidity-Abnahme > 50%'
    ],
    typicalFalsePositiveConfusions: [
      'MASSIVE_DUMP: Normale Abwärtsvolatilität wird als Dump missinterpretiert'
    ],
    typicalFalseNegativeConfusions: [
      'Langsame продолжительный Dump wird als "normal" fehlklassifiziert'
    ],
    minimumDataRequirements: [
      'Preisdaten: 4h Window',
      'Volume-Daten: Verfügbar'
    ],
    confidenceFactors: [
      'Konsistenz über Time-Windows',
      'Abwesenheit von anomalen Metriken'
    ]
  },

  ILLIQUID_RANDOM_MOVE: {
    class: 'ILLIQUID_RANDOM_MOVE',
    description: 'Illiquider Einmal-Exit ohne Follow-on-Kaskade oder strukturelle Vorbereitung',
    inclusionCriteria: [
      'Preisverlust >= 20% in < 1h',
      'Keine strukturelle Vorbereitung (keine Konsolidierung davor)',
      'Liquiditätsabnahme > 50%',
      'Keine Follow-on Transaktionen (Wallet Cluster < 3)',
      'Bot-Aktivität < 0.50'
    ],
    exclusionCriteria: [
      'Mehr als 2 Follow-on Transaktionen',
      'Bot-Aktivität >= 0.50',
      'Volume > 3x Durchschnitt (eher strukturelles Event)',
      'Preisverlust setzt sich fort über weitere 4h'
    ],
    typicalFalsePositiveConfusions: [
      'MASSIVE_DUMP: Illiquider Move mit Follow-on wird als Dump missinterpretiert'
    ],
    typicalFalseNegativeConfusions: [
      'Whale Sell mit subtiler Kaskade wird als "illiquid" fehlklassifiziert'
    ],
    minimumDataRequirements: [
      'Preisdaten: 1h Window mit 1min Auflösung',
      'Liquidity-Daten: Verfügbar',
      'Transaktionsdaten: Verfügbar für >= 2h nach Event'
    ],
    confidenceFactors: [
      'Eindeutigkeit der Illiquidität',
      'Abwesenheit von Follow-on-Aktivität',
      'Schnelle Erholung nach Move'
    ]
  },

  WHALE_SELL_NO_CASCADE: {
    class: 'WHALE_SELL_NO_CASCADE',
    description: 'Einzelner Whale-Exit ohne nachhaltige Preisbewegung oder Kaskade',
    inclusionCriteria: [
      'Einzelne Wallet mit >= 100 SOL Verkaufsvolumen',
      'Preisverlust < 25% in 4h',
      'Follow-on Transaktionen < 3',
      'Keine koordinierte Aktivität (Cluster < 3 Wallets)',
      'Bot-Aktivität normal (nicht erhöht)'
    ],
    exclusionCriteria: [
      'Preisverlust >= 25% in 4h (eher MASSIVE_DUMP)',
      '>= 3 Follow-on Transaktionen (Kaskade)',
      'Cluster von >= 3 Wallets',
      'Bot-Aktivität >= 0.70'
    ],
    typicalFalsePositiveConfusions: [
      'MASSIVE_DUMP: Koordinierte Whale-Aktivität wird als einzelner Exit missinterpretiert'
    ],
    typicalFalseNegativeConfusions: [
      'Sequenz von kleineren Whale-Exits wird nicht als Whale-Aktivität erkannt'
    ],
    minimumDataRequirements: [
      'Wallet-Cluster-Daten',
      'Transaktionsvolumen',
      'Preisdaten für >= 4h nach Event'
    ],
    confidenceFactors: [
      'Eindeutigkeit des Whale-Exit',
      'Abwesenheit von Follow-on',
      'Begrenzte Preisauswirkung'
    ]
  },

  BOT_ACTIVITY_NO_PRICE_IMPACT: {
    class: 'BOT_ACTIVITY_NO_PRICE_IMPACT',
    description: 'Erhöhte Bot-Aktivität ohne nachhaltigen Preiseffekt',
    inclusionCriteria: [
      'Bot-Probability >= 0.70',
      'Preisverlust < 5% in 4h',
      'Volume erhöht aber symmetrisch (kein klares Ungleichgewicht)',
      'Preis stabilisiert sich schnell'
    ],
    exclusionCriteria: [
      'Preisverlust >= 5% in 4h (dann eher anderes Label)',
      'Klares Buy/Sell-Imbalance > 0.3',
      'Follow-on Effekt auf Preis erkennbar'
    ],
    typicalFalsePositiveConfusions: [
      'MASSIVE_DUMP: Bot-Aktivität vor Dump wird als "Bot ohne Impact" fehlklassifiziert'
    ],
    typicalFalseNegativeConfusions: [
      'Langfristige Bot-Dominanz wird als "kein Impact" fehlklassifiziert, obwohl struktureller Effekt'
    ],
    minimumDataRequirements: [
      'Bot-Daten: Verfügbar mit >= 1h Auflösung',
      'Preisdaten: 4h Window'
    ],
    confidenceFactors: [
      'Bot-Typ Identifikation (Jito, Sandwich, etc.)',
      'Symmetrie der Volume-Aktivität',
      'Schnelle Preisstabilisierung'
    ]
  },

  UNCERTAIN: {
    class: 'UNCERTAIN',
    description: 'Strittiger Fall - nicht eindeutig klassifizierbar',
    inclusionCriteria: [
      'Widersprüchliche Evidenz aus verschiedenen Quellen',
      'Boundary-Case nahe an mehreren Label-Klassen',
      'Ambiguität in der Dateninterpretation'
    ],
    exclusionCriteria: [
      'Klar erfüllte Kriterien für eine andere Klasse',
      'Daten reichen für klare Klassifikation'
    ],
    typicalFalsePositiveConfusions: [
      'Eigentlich MASSIVE_DUMP, wird als UNCERTAIN markiert wegen Datenproblemen'
    ],
    typicalFalseNegativeConfusions: [
      'Eigentlich NORMAL_VOLATILITY, wird als UNCERTAIN markiert wegen Überschätzung der Anomalie'
    ],
    minimumDataRequirements: [
      'Grundsätzliche Daten vorhanden, aber Interpretation unklar'
    ],
    confidenceFactors: [
      'Grad der Widersprüchlichkeit',
      'Anzahl der konkurrierenden Interpretationen',
      'Klarheit der Datenlage'
    ]
  },

  DATA_INSUFFICIENT: {
    class: 'DATA_INSUFFICIENT',
    description: 'Nicht genug Daten für irgend eine Klassifikation',
    inclusionCriteria: [
      'Datenlücken > 30% des relevanten Zeitfensters',
      'Kritische Datenfeeds nicht verfügbar',
      'Zu wenige Datenpunkte für statistische Aussage'
    ],
    exclusionCriteria: [
      'Grundsätzliche Daten vorhanden, die Klassifikation erlauben'
    ],
    typicalFalsePositiveConfusions: [
      'Eigentlich klassifizierbar, aber fälschlich als DATA_INSUFFICIENT markiert wegen Overfitting an Datenqualität'
    ],
    typicalFalseNegativeConfusions: [
      'Daten werden als "ausreichend" interpretiert, obwohl kritische Lücken bestehen'
    ],
    minimumDataRequirements: [
      'Mindestens Preisdaten für das relevante Window'
    ],
    confidenceFactors: [
      'Prozentualer Anteil der fehlenden Daten',
      'Kritikalität der fehlenden Daten für Klassifikation',
      'Möglichkeit der Interpolation'
    ]
  }
};

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export function isValidLabelClass(label: string): label is LabelClass {
  return ['MASSIVE_DUMP', 'NORMAL_VOLATILITY', 'ILLIQUID_RANDOM_MOVE',
          'WHALE_SELL_NO_CASCADE', 'BOT_ACTIVITY_NO_PRICE_IMPACT',
          'UNCERTAIN', 'DATA_INSUFFICIENT'].includes(label);
}

export function isFinalGroundTruth(event: FinalGroundTruthLabel): boolean {
  return event.isGroundTruth === true &&
         event.labelStatus === 'approved' &&
         event.reviewStatus === 'final';
}

export function requiresSecondaryReview(review: HumanReview): boolean {
  return review.needsSecondaryReview ||
         review.disagreementWithAutoLabel ||
         review.ambiguityFlags.some(f => f.severity === 'high');
}