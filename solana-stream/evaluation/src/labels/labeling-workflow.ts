/**
 * KAS PA v4.3 - Labeling Workflow Executor
 *
 * Real nutzbarer Workflow für Ground-Truth Erstellung.
 *
 * Input: Historische Preis-, Volumen-, Liquiditäts- und Bot-Daten
 * Output: Gelabelte Events im definierten Schema
 *
 * WICHTIG: Solange kein Ground Truth existiert, sind alle Metriken
 * (Precision, FPR, Ranking) nur hypothetisch - keine empirische Aussagekraft.
 */

import { GroundTruthEvent, EventLabel, toRecord, GroundTruthRecord } from './schema.js';
import { AUTOMATIC_LABEL_HEURISTICS, MANUAL_LABEL_RULES, CONFIDENCE_THRESHOLDS } from './ground-truth-plan.js';

export interface HistoricalDataPoint {
  timestamp: number;
  token: string;
  pair: string;

  // Preis
  price: number;
  priceChange5m?: number;
  priceChange15m?: number;
  priceChange1h?: number;
  priceChange4h?: number;
  priceChange24h?: number;

  // Volume
  volume24h?: number;
  avgVolume7d?: number;
  volumeSpikeMultiplier?: number;

  // Liquidity
  liquidityBefore?: number;
  liquidityAfter?: number;
  liquidityChangePercent?: number;

  // Bot
  botProbability?: number;
  jitoBundleCount?: number;
  sandwichCount?: number;
  liquidationCount?: number;

  // Whale
  whaleVolumeSol?: number;
  followOnTxs?: number;
}

export interface LabelingResult {
  events: GroundTruthEvent[];
  stats: {
    totalProcessed: number;
    labeled: number;
    autoLabeled: number;
    manualLabeled: number;
    flaggedForReview: number;
    byLabel: Record<EventLabel, number>;
  };
  dataGaps: string[];
  warnings: string[];
}

export class LabelingWorkflowExecutor {
  private events: GroundTruthEvent[] = [];
  private processedTokens: Set<string> = new Set();

  /**
   * Verarbeite historische Daten und generiere Labels
   *
   * @param dataPoints Array von HistoricalDataPoint
   * @param options Konfiguration für Labeling
   */
  processData(
    dataPoints: HistoricalDataPoint[],
    options: {
      minConfidenceForAutoLabel: number;
      requireManualReviewBelowConfidence: number;
    } = {
      minConfidenceForAutoLabel: 0.85,
      requireManualReviewBelowConfidence: 0.70,
    }
  ): LabelingResult {
    const dataGaps: string[] = [];
    const warnings: string[] = [];
    let autoLabeled = 0;
    let manualLabeled = 0;
    let flaggedForReview = 0;

    // Gruppiere nach Token
    const byToken = new Map<string, HistoricalDataPoint[]>();
    for (const dp of dataPoints) {
      if (!byToken.has(dp.token)) {
        byToken.set(dp.token, []);
      }
      byToken.get(dp.token)!.push(dp);
    }

    // Verarbeite jeden Token
    for (const [token, points] of byToken) {
      this.processedTokens.add(token);

      // Sortiere nach Zeit
      points.sort((a, b) => a.timestamp - b.timestamp);

      // Finde potenzielle Events
      const potentialEvents = this.identifyPotentialEvents(points);

      // Label jedes Event
      for (const event of potentialEvents) {
        const labelResult = this.labelEvent(event, options);

        if (labelResult.needsManualReview) {
          flaggedForReview++;
          warnings.push(`Event ${event.id} flagged for manual review (confidence: ${labelResult.confidence})`);
        }

        if (labelResult.labelSource === 'automatic') {
          autoLabeled++;
        } else {
          manualLabeled++;
        }

        this.events.push(labelResult.event);
      }
    }

    // Statistiken
    const byLabel: Record<EventLabel, number> = {
      MASSIVEDUMP: 0,
      NORMALVOLATILITY: 0,
      ILLIQUIDRANDOMMOVE: 0,
      WHALESELLNOCASCADE: 0,
      BOTACTIVITYNOPRICEIMPACT: 0,
      PENDING: 0,
      UNKNOWN: 0,
    };

    for (const event of this.events) {
      byLabel[event.label]++;
    }

    return {
      events: this.events,
      stats: {
        totalProcessed: dataPoints.length,
        labeled: this.events.length,
        autoLabeled,
        manualLabeled,
        flaggedForReview,
        byLabel,
      },
      dataGaps,
      warnings,
    };
  }

  /**
   * Identifiziere potenzielle Crash-Events
   */
  private identifyPotentialEvents(points: HistoricalDataPoint[]): HistoricalDataPoint[] {
    const events: HistoricalDataPoint[] = [];

    for (let i = 0; i < points.length; i++) {
      const point = points[i];

      // Prüfe auf signifikanten Preisverlust
      const hasSignificantDrop =
        (point.priceChange24h !== undefined && point.priceChange24h <= -0.20) ||
        (point.priceChange4h !== undefined && point.priceChange4h <= -0.15) ||
        (point.priceChange1h !== undefined && point.priceChange1h <= -0.10);

      if (hasSignificantDrop) {
        events.push(point);
      }
    }

    return events;
  }

  /**
   * Label ein einzelnes Event
   */
  private labelEvent(
    dataPoint: HistoricalDataPoint,
    options: { minConfidenceForAutoLabel: number; requireManualReviewBelowConfidence: number }
  ): { event: GroundTruthEvent; labelSource: 'automatic' | 'manual'; needsManualReview: boolean; confidence: number } {
    // Wende automatische Heuristiken an
    let label: EventLabel = 'UNKNOWN';
    let confidence = 0;
    let labelSource: 'automatic' | 'manual' = 'automatic';

    // Check automatic heuristics
    for (const heuristic of AUTOMATIC_LABEL_HEURISTICS) {
      const result = this.evaluateHeuristic(heuristic, dataPoint);
      if (result.matches && result.confidence > confidence) {
        label = heuristic.label as EventLabel;
        confidence = result.confidence;
        labelSource = 'automatic';
      }
    }

    // Fallback zu Manual Rules wenn keine Auto-Regel passt
    if (label === 'UNKNOWN') {
      for (const rule of MANUAL_LABEL_RULES) {
        const result = this.evaluateHeuristic(rule, dataPoint);
        if (result.matches) {
          label = rule.label as EventLabel;
          confidence = result.confidence * 0.8; // Manual ist weniger confident
          labelSource = 'manual';
        }
      }
    }

    // Default zu NORMALVOLATILITY wenn nichts anderes passt
    if (label === 'UNKNOWN') {
      label = 'NORMALVOLATILITY';
      confidence = 0.5;
    }

    // Check ob Manual Review erforderlich
    const needsManualReview = confidence < options.requireManualReviewBelowConfidence;

    // Erstelle Event
    const now = new Date().toISOString();
    const eventStart = new Date(dataPoint.timestamp).toISOString();

    const event: GroundTruthEvent = {
      id: `evt_${dataPoint.timestamp}_${dataPoint.token}`,
      token: dataPoint.token,
      pair: dataPoint.pair,
      eventStartTime: eventStart,
      eventEndTime: now, // Wird später aktualisiert
      labelTime: now,
      label,
      confidence,
      priceChanges: {
        '5min': dataPoint.priceChange5m !== undefined ? {
          percent: dataPoint.priceChange5m,
          windowMinutes: 5,
          startPrice: dataPoint.price,
          endPrice: dataPoint.price * (1 + dataPoint.priceChange5m),
        } : undefined,
        '1h': dataPoint.priceChange1h !== undefined ? {
          percent: dataPoint.priceChange1h,
          windowMinutes: 60,
          startPrice: dataPoint.price,
          endPrice: dataPoint.price * (1 + dataPoint.priceChange1h),
        } : undefined,
        '4h': dataPoint.priceChange4h !== undefined ? {
          percent: dataPoint.priceChange4h,
          windowMinutes: 240,
          startPrice: dataPoint.price,
          endPrice: dataPoint.price * (1 + dataPoint.priceChange4h),
        } : undefined,
        '24h': dataPoint.priceChange24h !== undefined ? {
          percent: dataPoint.priceChange24h,
          windowMinutes: 1440,
          startPrice: dataPoint.price,
          endPrice: dataPoint.price * (1 + dataPoint.priceChange24h),
        } : undefined,
      },
      volumeSpike: dataPoint.volumeSpikeMultiplier !== undefined ? {
        multiplier: dataPoint.volumeSpikeMultiplier,
        absoluteVolume: dataPoint.volume24h || 0,
        avgVolume24h: dataPoint.avgVolume7d || 0,
      } : undefined,
      liquidityChange: dataPoint.liquidityChangePercent !== undefined ? {
        percentChange: dataPoint.liquidityChangePercent,
        beforeLiquidity: dataPoint.liquidityBefore || 0,
        afterLiquidity: dataPoint.liquidityAfter || 0,
      } : undefined,
      botMetrics: dataPoint.botProbability !== undefined ? {
        botProbability: dataPoint.botProbability,
        jitoBundleCount: dataPoint.jitoBundleCount || 0,
        sandwichCount: dataPoint.sandwichCount || 0,
        liquidationCount: dataPoint.liquidationCount || 0,
      } : undefined,
      sourceNotes: `Labeled by ${labelSource} workflow at ${now}`,
      dataSource: labelSource === 'automatic' ? 'semi-automatic' : 'manual',
      createdAt: now,
      updatedAt: now,
    };

    return { event, labelSource, needsManualReview, confidence };
  }

  /**
   * Evaluiere eine Heuristik gegen ein Data Point
   */
  private evaluateHeuristic(
    heuristic: { name: string; conditions: string; label: string },
    dataPoint: HistoricalDataPoint
  ): { matches: boolean; confidence: number } {
    // Parsed conditions (vereinfacht - in Produktion would use proper parser)
    const conditions = heuristic.conditions.toLowerCase();

    let matches = true;
    let confidence = 0.8;

    // Prüfe priceChange24h
    if (conditions.includes('pricechange24h')) {
      if (dataPoint.priceChange24h === undefined) {
        matches = false;
      } else if (conditions.includes('<=')) {
        const threshold = this.extractThreshold(conditions, 'pricechange24h');
        if (dataPoint.priceChange24h > threshold) {
          matches = false;
        } else {
          confidence = Math.min(confidence + 0.1, 0.95);
        }
      }
    }

    // Prüfe priceChange4h
    if (matches && conditions.includes('pricechange4h')) {
      if (dataPoint.priceChange4h === undefined) {
        matches = false;
      } else if (conditions.includes('<=')) {
        const threshold = this.extractThreshold(conditions, 'pricechange4h');
        if (dataPoint.priceChange4h > threshold) {
          matches = false;
        }
      }
    }

    // Prüfe volume spike
    if (matches && conditions.includes('volume')) {
      if (dataPoint.volumeSpikeMultiplier !== undefined) {
        const threshold = this.extractThreshold(conditions, 'volume');
        if (dataPoint.volumeSpikeMultiplier < threshold) {
          matches = false;
        }
      }
    }

    // Prüfe bot probability
    if (matches && conditions.includes('botprobability')) {
      if (dataPoint.botProbability === undefined) {
        matches = false;
      } else if (conditions.includes('>=')) {
        const threshold = this.extractThreshold(conditions, 'botprobability');
        if (dataPoint.botProbability < threshold) {
          matches = false;
        }
      }
    }

    return { matches, confidence };
  }

  /**
   * Extrahiere Schwellenwert aus Condition-String
   */
  private extractThreshold(condition: string, field: string): number {
    // Vereinfacht - sucht nach Muster wie "> 0.70" nach field-Name
    const regex = new RegExp(`${field}[^0-9]*(-?\\d+\\.?\\d*)`, 'i');
    const match = condition.match(regex);
    return match ? parseFloat(match[1]) : 0;
  }

  /**
   * Exportiere als JSONL
   */
  exportToJSONL(path: string): number {
    const records = this.events.map(e => toRecord(e));
    const jsonl = records.map(r => JSON.stringify(r)).join('\n');
    // writeFileSync(path, jsonl + '\n');
    console.log(`Would export ${records.length} labeled events to ${path}`);
    return records.length;
  }

  /**
   * Statistiken
   */
  getStats() {
    return {
      totalEvents: this.events.length,
      processedTokens: this.processedTokens.size,
      byLabel: Object.fromEntries(
        Object.entries(
          this.events.reduce((acc, e) => {
            acc[e.label] = (acc[e.label] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        )
      ),
    };
  }
}

// ============================================================================
// BEISPIEL: WIE MAN DEN WORKFLOW NUTZT
// ============================================================================

/**
 * Usage Example:
 *
 * ```typescript
 * // 1. Sammle historische Daten
 * const historicalData: HistoricalDataPoint[] = await collectHistoricalData({
 *   tokens: ['BONK', 'DOGWIF', 'WIF'],
 *   startTime: Date.now() - 14 * 24 * 60 * 60 * 1000,
 *   endTime: Date.now(),
 * });
 *
 * // 2. Führe Labeling Workflow aus
 * const executor = new LabelingWorkflowExecutor();
 * const result = executor.processData(historicalData, {
 *   minConfidenceForAutoLabel: 0.85,
 *   requireManualReviewBelowConfidence: 0.70,
 * });
 *
 * // 3. Statistiken
 * console.log('Labeled:', result.stats.labeled);
 * console.log('By Label:', result.stats.byLabel);
 * console.log('Flagged for Review:', result.stats.flaggedForReview);
 *
 * // 4. Export
 * executor.exportToJSONL('/path/to/ground_truth.jsonl');
 * ```
 */

export const labelingWorkflowExecutor = new LabelingWorkflowExecutor();