/**
 * KAS PA v4.3 - Ground Truth Label Schema
 *
 * Maschinenlesbares Schema für Event-Labels.
 * Jedes Event repräsentiert ein potenzielles Crash-/Dump-Signal mit Zeitfenster.
 *
 * Label-Kategorien:
 * - MASSIVEDUMP: Preisverlust >= Threshold in Zeitfenster
 * - NORMALVOLATILITY: Normale Marktbewegung, kein Crash
 * - ILLIQUIDRANDOMMOVE: Illiquider Einmal-Move ohne strukturelle Vorbereitung
 * - WHALESELLNOCASCADE: Einzelner Whale-Exit ohne Follow-on
 * - BOTACTIVITYNOPRICEIMPACT: Bot-Aktivität ohne nachhaltigen Preiseffekt
 */

export type EventLabel =
  | 'MASSIVEDUMP'
  | 'NORMALVOLATILITY'
  | 'ILLIQUIDRANDOMMOVE'
  | 'WHALESELLNOCASCADE'
  | 'BOTACTIVITYNOPRICEIMPACT'
  | 'PENDING'  // Für Event-Level Labels die noch nicht resolved sind
  | 'UNKNOWN'; // Für Datenlücken

export type DumpSeverity = 'SEVERE' | 'MAJOR' | 'MODERATE' | 'MINIMAL';

export type TimeWindowMinutes = 5 | 15 | 60 | 240 | 1440; // 5m, 15m, 1h, 4h, 24h

export interface PriceChange {
  percent: number;          // z.B. -0.35 = -35%
  windowMinutes: number;    // Zeitfenster in Minuten
  startPrice: number;
  endPrice: number;
}

export interface VolumeSpike {
  multiplier: number;       // Volume / 24h_avg
  absoluteVolume: number;
  avgVolume24h: number;
}

export interface LiquidityChange {
  percentChange: number;    // z.B. -0.50 = -50%
  beforeLiquidity: number;
  afterLiquidity: number;
}

export interface BotMetrics {
  botProbability: number;   // 0-1
  jitoBundleCount: number;
  sandwichCount: number;
  liquidationCount: number;
  // Weitere Bot-Metriken optional
}

export interface GroundTruthEvent {
  // Identifikation
  id: string;               // UUID oder timestamp-basiert
  token: string;            // Symbol, z.B. "BONK"
  pair: string;              // Trading Pair, z.B. "BONK/SOL"

  // Zeitstempel (ISO 8601)
  eventStartTime: string;   // Wann begann das Event (UTC)
  eventEndTime: string;      // Wann endete das Event (UTC)
  labelTime: string;         // Wann wurde das Label vergeben

  // Label
  label: EventLabel;
  severity?: DumpSeverity;   // Nur für MASSIVEDUMP relevant
  confidence: number;       // 0-1, wie sicher ist das Label

  // Preisverlust-Details (pro TimeWindow)
  priceChanges: {
    '5min'?: PriceChange;
    '15min'?: PriceChange;
    '1h'?: PriceChange;
    '4h'?: PriceChange;
    '24h'?: PriceChange;
  };

  // Strukturelle Merkmale
  volumeSpike?: VolumeSpike;
  liquidityChange?: LiquidityChange;
  botMetrics?: BotMetrics;

  // Zusätzliche Kontext-Info
  sourceNotes: string;       // Manuell dokumentierte Beobachtungen
  labelerId?: string;       // Wer hat gelabelt (für Audit)

  // Referenzen
  txHashes?: string[];       // Relevante Transaktionen
  walletCluster?: string;   // Falls identifiziert

  // Metadata
  dataSource: 'manual' | 'semi-automatic' | 'automatic';
  createdAt: string;
  updatedAt: string;
}

/**
 * Schema für Ground Truth Datenbank (JSONL)
 * Eine Zeile pro Event
 */
export interface GroundTruthRecord {
  // Flattened für JSONL Effizienz
  id: string;
  token: string;
  pair: string;
  label: EventLabel;
  severity?: DumpSeverity;

  // Zeitfenster
  eventStartTime: string;
  eventEndTime: string;

  // Preisverluste (serialisiert als JSON strings)
  priceDrop5m?: number;      // Prozent, negativ = Verlust
  priceDrop15m?: number;
  priceDrop1h?: number;
  priceDrop4h?: number;
  priceDrop24h?: number;

  // Strukturelle Merkmale
  volumeSpikeMultiplier?: number;
  liquidityChangePercent?: number;
  botProbability?: number;

  // Konfidenz
  confidence: number;

  // Notes
  sourceNotes: string;

  // Metadata
  dataSource: string;
  createdAt: string;
}

/**
 * Konverter zwischen kompaktem und vollem Schema
 */
export function toRecord(event: GroundTruthEvent): GroundTruthRecord {
  return {
    id: event.id,
    token: event.token,
    pair: event.pair,
    label: event.label,
    severity: event.severity,
    eventStartTime: event.eventStartTime,
    eventEndTime: event.eventEndTime,
    priceDrop5m: event.priceChanges['5min']?.percent,
    priceDrop15m: event.priceChanges['15min']?.percent,
    priceDrop1h: event.priceChanges['1h']?.percent,
    priceDrop4h: event.priceChanges['4h']?.percent,
    priceDrop24h: event.priceChanges['24h']?.percent,
    volumeSpikeMultiplier: event.volumeSpike?.multiplier,
    liquidityChangePercent: event.liquidityChange?.percentChange,
    botProbability: event.botMetrics?.botProbability,
    confidence: event.confidence,
    sourceNotes: event.sourceNotes,
    dataSource: event.dataSource,
    createdAt: event.createdAt,
  };
}

/**
 * Schwellenwerte für Label-Zuordnung
 */
export const LABEL_THRESHOLDS = {
  MASSIVEDUMP: {
    priceDrop24h: -0.30,       // >= 30% Verlust in 24h
    priceDrop4h: -0.20,        // >= 20% in 4h
    minSeverity: 'MODERATE' as DumpSeverity,
  },
  NORMALVOLATILITY: {
    priceDrop24h: -0.15,       // < 15% Verlust in 24h
    priceDrop4h: -0.08,        // < 8% in 4h
    maxVolumeSpike: 2.0,       // < 2x durchschnittliches Volume
  },
  ILLIQUIDRANDOMMOVE: {
    priceDrop1h: -0.20,        // > 20% in 1h
    maxDurationMinutes: 60,    // < 1 Stunde
    minLiquidityDrop: -0.50,   // > 50% Liquiditätsabnahme
  },
  WHALESELLNOCASCADE: {
    minWhaleVolumeSol: 100,    // > 100 SOL
    maxFollowOnTxs: 2,         // < 2 Follow-on Transaktionen
    priceDrop4h: -0.25,        // Verlust aber keine Kaskade
  },
  BOTACTIVITYNOPRICEIMPACT: {
    minBotProbability: 0.70,
    maxPriceDrop4h: -0.05,     // < 5% Preisverlust trotz Bot-Aktivität
  }
} as const;

/**
 * Event-Suche für Evaluation
 */
export function matchesLabel(event: GroundTruthRecord, label: EventLabel): boolean {
  return event.label === label;
}

export function isMassiveDump(event: GroundTruthRecord): boolean {
  return event.label === 'MASSIVEDUMP';
}

export function isFalsePositive(event: GroundTruthRecord): boolean {
  return event.label !== 'MASSIVEDUMP';
}