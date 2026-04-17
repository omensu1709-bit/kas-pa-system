/**
 * KAS PA v4.3 - Time-Correct Backtesting Engine
 *
 * Führt zeitkorrekten Replay von Signalen durch.
 * Stellt sicher, dass pro Zeitpunkt t nur Informationen bis t verwendet werden.
 *
 * Zeitkorrekter Replay:
 * 1. Feature-Matrix wird nur bis Cutoff-Zeitpunkt berechnet
 * 2. Signale werden für Fenster [t+5min, t+24h] generiert
 * 3. Labels werden nach dem 24h Window vergeben
 */

import { BaselineSignal } from './baselines/baselines.js';
import { GroundTruthRecord, EventLabel } from './labels/schema.js';

export interface BacktestSignal {
  // Identifikation
  id: string;
  timestamp: number;
  cutoffTime: number;           // Wann der Cutoff war
  predictionWindowStart: number; // Wann das Signal wirksam wird
  predictionWindowEnd: number;  // Wann das Fenster schließt

  // Signal Info
  symbol: string;
  baseline: string;            // 'B1', 'B2', ..., 'KASPA'
  decision: 'SHORT' | 'IGNORE' | 'MONITOR';
  score: number;                // 0-1
  confidence: number;           // 0-1

  // Feature Snapshot (nur Features verfügbar AT cutoff)
  features: Record<string, number>;

  // Ergebnis (wird nach Resolution gefüllt)
  resolved: boolean;
  label?: EventLabel;
  actualEvent?: boolean;         // true = MASSIVEDUMP occurred
  leadTimeMs?: number;          // Zeit zwischen Signal und Event
  priceDropPercent?: number;

  // Trade-Info (falls SHORT)
  entryPrice?: number;
  exitPrice?: number;
  pnlPercent?: number;
  holdingTimeMs?: number;
}

export interface BacktestResult {
  runId: string;
  startTime: number;
  endTime: number;
  totalSignals: number;
  signals: BacktestSignal[];
  groundTruth: GroundTruthRecord[];
}

export interface MarketSnapshotAtTime {
  timestamp: number;
  prices: Map<string, {
    price: number;
    priceChange1h: number;
    priceChange4h: number;
    priceChange24h: number;
    sma5: number;
    sma15: number;
    volume24h: number;
    avgVolume7d: number;
  }>;
  bots: Map<string, {
    botProbability: number;
    jitoBundleCount: number;
    sandwichCount: number;
    liquidationCount: number;
  }>;
  orderFlows: Map<string, {
    tfi: number;
    buyVolume: number;
    sellVolume: number;
    volumeRatio: number;
  }>;
}

export class BacktestEngine {
  private signals: BacktestSignal[] = [];
  private groundTruth: GroundTruthRecord[] = [];

  // Konfiguration
  private predictionWindowStartMs = 5 * 60 * 1000;   // 5 min nach Cutoff
  private predictionWindowEndMs = 24 * 60 * 60 * 1000; // 24h nach Cutoff

  /**
   * Füge einen Signal-Cutoff hinzu (zeitkorrekt)
   */
  addSignalCutoff(
    symbol: string,
    baseline: string,
    decision: 'SHORT' | 'IGNORE' | 'MONITOR',
    score: number,
    confidence: number,
    features: Record<string, number>,
    timestamp?: number
  ): BacktestSignal {
    const now = timestamp || Date.now();
    const cutoff = now;

    const signal: BacktestSignal = {
      id: `sig_${now}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: now,
      cutoffTime: cutoff,
      predictionWindowStart: cutoff + this.predictionWindowStartMs,
      predictionWindowEnd: cutoff + this.predictionWindowEndMs,
      symbol,
      baseline,
      decision,
      score,
      confidence,
      features,
      resolved: false,
    };

    this.signals.push(signal);
    return signal;
  }

  /**
   * Füge Ground Truth Event hinzu
   */
  addGroundTruth(event: GroundTruthRecord): void {
    this.groundTruth.push(event);
  }

  /**
   * Lade Ground Truth aus JSONL
   */
  loadGroundTruthFromJSONL(jsonlPath: string): number {
    // Placeholder - würde echte Datei lesen
    console.log(`Would load ground truth from: ${jsonlPath}`);
    return 0;
  }

  /**
   * Resolviere Signale gegen Ground Truth
   *
   * Regel:
   * - Signal = MASSIVEDUMP wenn im Window [cutoff+5min, cutoff+24h] ein MASSIVEDUMP eintrat
   * - Lead Time = Zeit zwischen predictionWindowStart und Event-Start
   */
  resolveSignals(): void {
    for (const signal of this.signals) {
      if (signal.resolved) continue;

      // Finde passende Ground Truth Events
      const matchingEvents = this.groundTruth.filter(event => {
        return event.token === signal.symbol &&
          event.label === 'MASSIVEDUMP' &&
          this.eventInWindow(event, signal);
      });

      if (matchingEvents.length > 0) {
        // Nehme das erste passende Event
        const event = matchingEvents[0];
        const eventStart = new Date(event.eventStartTime).getTime();

        signal.resolved = true;
        signal.label = 'MASSIVEDUMP';
        signal.actualEvent = true;
        signal.leadTimeMs = eventStart - signal.predictionWindowStart;
        signal.priceDropPercent = event.priceDrop24h || event.priceDrop4h;
      } else {
        // Kein passendes Event gefunden = kein Crash
        signal.resolved = true;
        signal.label = 'NORMALVOLATILITY';
        signal.actualEvent = false;
      }
    }
  }

  /**
   * Prüfe ob Event im Prediction Window liegt
   */
  private eventInWindow(event: GroundTruthRecord, signal: BacktestSignal): boolean {
    const eventStart = new Date(event.eventStartTime).getTime();
    return eventStart >= signal.predictionWindowStart &&
           eventStart <= signal.predictionWindowEnd;
  }

  /**
   * Generiere Backtest Report
   */
  generateReport(): BacktestResult {
    return {
      runId: `run_${Date.now()}`,
      startTime: Math.min(...this.signals.map(s => s.timestamp)),
      endTime: Math.max(...this.signals.map(s => s.timestamp)),
      totalSignals: this.signals.length,
      signals: this.signals,
      groundTruth: this.groundTruth,
    };
  }

  /**
   * Statistiken
   */
  getStats(): {
    totalSignals: number;
    resolvedSignals: number;
    unresolvedSignals: number;
    signalsByBaseline: Record<string, number>;
    signalsByDecision: Record<string, number>;
  } {
    const signalsByBaseline: Record<string, number> = {};
    const signalsByDecision: Record<string, number> = {};

    for (const signal of this.signals) {
      signalsByBaseline[signal.baseline] = (signalsByBaseline[signal.baseline] || 0) + 1;
      signalsByDecision[signal.decision] = (signalsByDecision[signal.decision] || 0) + 1;
    }

    return {
      totalSignals: this.signals.length,
      resolvedSignals: this.signals.filter(s => s.resolved).length,
      unresolvedSignals: this.signals.filter(s => !s.resolved).length,
      signalsByBaseline,
      signalsByDecision,
    };
  }

  /**
   * Exportiere Signale als JSONL
   */
  exportSignalsToJSONL(path: string): void {
    const jsonl = this.signals.map(s => JSON.stringify(s)).join('\n');
    // writeFileSync(path, jsonl + '\n');
    console.log(`Would export ${this.signals.length} signals to: ${path}`);
  }

  /**
   * Setze Engine zurück
   */
  reset(): void {
    this.signals = [];
    this.groundTruth = [];
  }

  /**
   * Simulation von Market Data zu gegebenem Zeitpunkt
   * (Für echtes Backtesting würde dies Daten aus einer DB laden)
   */
  simulateMarketSnapshot(timeMs: number): MarketSnapshotAtTime {
    // Placeholder - würde echte historische Daten laden
    return {
      timestamp: timeMs,
      prices: new Map(),
      bots: new Map(),
      orderFlows: new Map(),
    };
  }
}

// Export singleton
export const backtestEngine = new BacktestEngine();