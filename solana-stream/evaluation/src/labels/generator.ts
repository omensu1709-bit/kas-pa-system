/**
 * KAS PA v4.3 - Label Generator
 *
 * Generiert Ground-Truth Labels aus historischen Daten.
 * Kann halb-automatisch oder manuell verwendet werden.
 */

import { GroundTruthEvent, GroundTruthRecord, EventLabel, DumpSeverity, toRecord, LABEL_THRESHOLDS } from './schema.js';

export interface LabelGeneratorConfig {
  priceDataPath?: string;
  outputPath: string;
  minConfidence: number;
}

export class LabelGenerator {
  private events: GroundTruthEvent[] = [];

  /**
   * Füge ein Event manuell hinzu
   */
  addEvent(event: Omit<GroundTruthEvent, 'id' | 'createdAt' | 'updatedAt'>): GroundTruthEvent {
    const now = new Date().toISOString();
    const fullEvent: GroundTruthEvent = {
      ...event,
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: now,
      updatedAt: now,
    };
    this.events.push(fullEvent);
    return fullEvent;
  }

  /**
   * Generiere Label basierend auf Schwellenwerten
   * Automatische Zuordnung basierend auf numerischen Kriterien
   */
  static autoLabel(event: {
    priceDrop24h?: number;
    priceDrop4h?: number;
    priceDrop1h?: number;
    volumeSpikeMultiplier?: number;
    botProbability?: number;
  }): EventLabel {
    // MASSIVEDUMP Check
    if (
      (event.priceDrop24h && event.priceDrop24h <= LABEL_THRESHOLDS.MASSIVEDUMP.priceDrop24h) ||
      (event.priceDrop4h && event.priceDrop4h <= LABEL_THRESHOLDS.MASSIVEDUMP.priceDrop4h)
    ) {
      return 'MASSIVEDUMP';
    }

    // BOTACTIVITYNOPRICEIMPACT Check
    if (
      event.botProbability &&
      event.botProbability >= LABEL_THRESHOLDS.BOTACTIVITYNOPRICEIMPACT.minBotProbability &&
      (!event.priceDrop4h || event.priceDrop4h > LABEL_THRESHOLDS.BOTACTIVITYNOPRICEIMPACT.maxPriceDrop4h)
    ) {
      return 'BOTACTIVITYNOPRICEIMPACT';
    }

    // ILLIQUIDRANDOMMOVE Check
    if (
      event.priceDrop1h &&
      event.priceDrop1h <= LABEL_THRESHOLDS.ILLIQUIDRANDOMMOVE.priceDrop1h
    ) {
      return 'ILLIQUIDRANDOMMOVE';
    }

    // NORMALVOLATILITY Check (default)
    return 'NORMALVOLATILITY';
  }

  /**
   * Schätze Severity für MASSIVEDUMP
   */
  static estimateSeverity(priceDrop24h?: number, priceDrop4h?: number): DumpSeverity {
    const maxDrop = Math.max(
      Math.abs(priceDrop24h || 0),
      Math.abs(priceDrop4h || 0)
    );

    if (maxDrop >= 0.50) return 'SEVERE';
    if (maxDrop >= 0.30) return 'MAJOR';
    if (maxDrop >= 0.20) return 'MODERATE';
    return 'MINIMAL';
  }

  /**
   * Exportiere alle Events als JSONL
   */
  exportToJSONL(outputPath: string): number {
    const records = this.events.map(e => toRecord(e));
    const jsonl = records.map(r => JSON.stringify(r)).join('\n');
    writeFileSync(outputPath, jsonl + '\n');
    return records.length;
  }

  /**
   * Exportiere alle Events als JSON (lesbar)
   */
  exportToJSON(outputPath: string): number {
    const json = JSON.stringify(this.events, null, 2);
    writeFileSync(outputPath, json);
    return this.events.length;
  }

  /**
   * Statistiken über gelabelte Events
   */
  getStats(): {
    total: number;
    byLabel: Record<EventLabel, number>;
    bySeverity: Record<DumpSeverity, number>;
  } {
    const byLabel: Record<EventLabel, number> = {
      MASSIVEDUMP: 0,
      NORMALVOLATILITY: 0,
      ILLIQUIDRANDOMMOVE: 0,
      WHALESELLNOCASCADE: 0,
      BOTACTIVITYNOPRICEIMPACT: 0,
      PENDING: 0,
      UNKNOWN: 0,
    };

    const bySeverity: Record<DumpSeverity, number> = {
      SEVERE: 0,
      MAJOR: 0,
      MODERATE: 0,
      MINIMAL: 0,
    };

    for (const event of this.events) {
      byLabel[event.label]++;
      if (event.severity) {
        bySeverity[event.severity]++;
      }
    }

    return {
      total: this.events.length,
      byLabel,
      bySeverity,
    };
  }
}

/**
 * CLI Interface für Label Generator
 */
export function runLabelGenerator(args: string[]): void {
  const generator = new LabelGenerator();

  // Beispiel: Füge ein manuelles Event hinzu
  const exampleEvent = generator.addEvent({
    token: 'EXAMPLE',
    pair: 'EXAMPLE/SOL',
    eventStartTime: '2024-03-15T12:00:00Z',
    eventEndTime: '2024-03-15T18:00:00Z',
    labelTime: new Date().toISOString(),
    label: 'MASSIVEDUMP',
    severity: 'MAJOR',
    priceChanges: {
      '1h': { percent: -0.15, windowMinutes: 60, startPrice: 0.05, endPrice: 0.043 },
      '4h': { percent: -0.32, windowMinutes: 240, startPrice: 0.05, endPrice: 0.034 },
      '24h': { percent: -0.45, windowMinutes: 1440, startPrice: 0.05, endPrice: 0.027 },
    },
    volumeSpike: { multiplier: 4.5, absoluteVolume: 500000, avgVolume24h: 111111 },
    botMetrics: { botProbability: 0.72, jitoBundleCount: 15, sandwichCount: 8, liquidationCount: 3 },
    sourceNotes: 'Manually labeled based on known market event',
    dataSource: 'manual',
  });

  console.log('Label Generator initialized');
  console.log(`Example event: ${exampleEvent.id}`);
  console.log('Stats:', generator.getStats());
}

// Export für Verwendung in anderen Modulen
export const labelGenerator = new LabelGenerator();