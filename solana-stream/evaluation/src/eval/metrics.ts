/**
 * KAS PA v4.3 - Evaluation Metrics
 *
 * Berechnet alle Pflicht-Metriken pro Modell und pro Event.
 * Trennt strikt zwischen:
 * - Signalqualität (Precision, Recall, FPR, etc.)
 * - Handelsqualität (PnL, Win Rate, etc.)
 * - Risikoqualität (Max Drawdown, Sharpe, etc.)
 */

import { BacktestSignal } from './backtest/engine.js';
import { GroundTruthRecord } from './labels/schema.js';

// ============================================================================
// SIGNAL QUALITY METRICS
// ============================================================================

export interface SignalQualityMetrics {
  // Core Metrics
  precision: number;           // TP / (TP + FP)
  recall: number;              // TP / (TP + FN)
  f1Score: number;             // 2 * (P * R) / (P + R)
  falsePositiveRate: number;   // FP / (FP + TN)
  falseNegativeRate: number;   // FN / (TP + FN)

  // Counts
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;

  // Extended
  specificity: number;         // TN / (TN + FP)
  accuracy: number;            // (TP + TN) / Total
  prevalence: number;          // Wie oft tritt MASSIVEDUMP auf?
}

export interface LeadTimeMetrics {
  meanLeadTimeMs: number;
  medianLeadTimeMs: number;
  minLeadTimeMs: number;
  maxLeadTimeMs: number;
  leadTimeDistribution: Record<string, number>; // z.B. {"<30min": 5, "30-60min": 3}
}

// ============================================================================
// TRADING QUALITY METRICS
// ============================================================================

export interface TradingQualityMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;             // winningTrades / totalTrades

  averagePnLSol: number;       // Durchschnittlicher PnL in SOL
  totalPnLSol: number;         // Gesamter PnL
  medianPnLSol: number;

  averagePnLPercent: number;
  bestTradePercent: number;
  worstTradePercent: number;

  // Risk-Adjusted
  sharpeRatio: number;         // (Rp - Rf) / σp
  sortinoRatio: number;         // (Rp - Rf) / σdown
  profitFactor: number;        // Gross Profit / Gross Loss
}

// ============================================================================
// RISK QUALITY METRICS
// ============================================================================

export interface RiskQualityMetrics {
  maxDrawdownPercent: number;
  maxDrawdownDurationMs: number;
  calmarRatio: number;         // Annual Return / Max Drawdown

  // Volatility
  volatilityDaily: number;
  volatilityAnnualized: number;

  // Exposure
  maxPositionsHeld: number;
  avgPositionDurationMs: number;

  // Consecutive Losses
  maxConsecutiveLosses: number;
  avgConsecutiveLosses: number;
}

// ============================================================================
// COMBINED EVALUATION RESULT
// ============================================================================

export interface EvaluationResult {
  modelName: string;

  // Kategorien
  signalQuality: SignalQualityMetrics;
  leadTime: LeadTimeMetrics;
  tradingQuality: TradingQualityMetrics;
  riskQuality: RiskQualityMetrics;

  // Summary
  overallScore: number;         // Gewichteter Score über alle Kategorien
  recommendation: 'USE' | 'RECONSIDER' | 'ABANDON';

  // Diagnostics
  dataGaps: string[];          // Welche Daten fehlen?
  warnings: string[];           // Warnungen (z.B. zu wenig Samples)
}

export class Evaluator {
  /**
   * Berechne alle Metriken für ein Modell
   */
  evaluate(
    modelName: string,
    signals: BacktestSignal[],
    groundTruth: GroundTruthRecord[]
  ): EvaluationResult {
    // Filter nur SHORT Signale für Trading-Metriken
    const shortSignals = signals.filter(s => s.decision === 'SHORT');
    const resolvedSignals = signals.filter(s => s.resolved);

    // Signal Quality
    const signalQuality = this.computeSignalQuality(resolvedSignals);

    // Lead Time
    const leadTime = this.computeLeadTime(resolvedSignals.filter(s => s.actualEvent));

    // Trading Quality
    const tradingQuality = this.computeTradingQuality(shortSignals.filter(s => s.resolved));

    // Risk Quality
    const riskQuality = this.computeRiskQuality(shortSignals.filter(s => s.resolved));

    // Overall Score (gewichtet)
    const overallScore = this.computeOverallScore(signalQuality, leadTime, tradingQuality, riskQuality);

    // Recommendation
    const recommendation = this.computeRecommendation(signalQuality, overallScore);

    // Data gaps
    const dataGaps = this.identifyDataGaps(signals, groundTruth);

    // Warnings
    const warnings = this.identifyWarnings(signals, signalQuality);

    return {
      modelName,
      signalQuality,
      leadTime,
      tradingQuality,
      riskQuality,
      overallScore,
      recommendation,
      dataGaps,
      warnings,
    };
  }

  private computeSignalQuality(signals: BacktestSignal[]): SignalQualityMetrics {
    const shortSignals = signals.filter(s => s.decision === 'SHORT');
    const noShortSignals = signals.filter(s => s.decision !== 'SHORT');

    const actualCrashes = signals.filter(s => s.actualEvent === true);
    const noCrashes = signals.filter(s => s.actualEvent === false);

    // True Positives: SHORT signal + actual crash
    const truePositives = shortSignals.filter(s => s.actualEvent === true).length;

    // False Positives: SHORT signal + no crash
    const falsePositives = shortSignals.filter(s => s.actualEvent === false).length;

    // True Negatives: IGNORE/MONITOR + no crash
    const trueNegatives = noShortSignals.filter(s => s.actualEvent === false).length;

    // False Negatives: IGNORE/MONITOR + actual crash
    const falseNegatives = noShortSignals.filter(s => s.actualEvent === true).length;

    const total = signals.length || 1;

    const precision = truePositives / (truePositives + falsePositives) || 0;
    const recall = truePositives / (truePositives + falseNegatives) || 0;
    const f1Score = 2 * (precision * recall) / (precision + recall) || 0;
    const falsePositiveRate = falsePositives / (falsePositives + trueNegatives) || 0;
    const falseNegativeRate = falseNegatives / (truePositives + falseNegatives) || 0;
    const specificity = trueNegatives / (trueNegatives + falsePositives) || 0;
    const accuracy = (truePositives + trueNegatives) / total;
    const prevalence = (truePositives + falseNegatives) / total;

    return {
      precision,
      recall,
      f1Score,
      falsePositiveRate,
      falseNegativeRate,
      truePositives,
      falsePositives,
      trueNegatives,
      falseNegatives,
      specificity,
      accuracy,
      prevalence,
    };
  }

  private computeLeadTime(crashedSignals: BacktestSignal[]): LeadTimeMetrics {
    if (crashedSignals.length === 0) {
      return {
        meanLeadTimeMs: 0,
        medianLeadTimeMs: 0,
        minLeadTimeMs: 0,
        maxLeadTimeMs: 0,
        leadTimeDistribution: {},
      };
    }

    const leadTimes = crashedSignals
      .filter(s => s.leadTimeMs !== undefined)
      .map(s => s.leadTimeMs!);

    if (leadTimes.length === 0) {
      return {
        meanLeadTimeMs: 0,
        medianLeadTimeMs: 0,
        minLeadTimeMs: 0,
        maxLeadTimeMs: 0,
        leadTimeDistribution: {},
      };
    }

    const sorted = [...leadTimes].sort((a, b) => a - b);
    const sum = leadTimes.reduce((a, b) => a + b, 0);

    // Distribution buckets (in Minuten)
    const distribution: Record<string, number> = {
      '<15min': 0,
      '15-30min': 0,
      '30-60min': 0,
      '1-2h': 0,
      '2-4h': 0,
      '>4h': 0,
    };

    for (const lt of leadTimes) {
      const min = lt / 60000;
      if (min < 15) distribution['<15min']++;
      else if (min < 30) distribution['15-30min']++;
      else if (min < 60) distribution['30-60min']++;
      else if (min < 120) distribution['1-2h']++;
      else if (min < 240) distribution['2-4h']++;
      else distribution['>4h']++;
    }

    return {
      meanLeadTimeMs: sum / leadTimes.length,
      medianLeadTimeMs: sorted[Math.floor(sorted.length / 2)],
      minLeadTimeMs: sorted[0],
      maxLeadTimeMs: sorted[sorted.length - 1],
      leadTimeDistribution: distribution,
    };
  }

  private computeTradingQuality(signals: BacktestSignal[]): TradingQualityMetrics {
    const trades = signals.filter(s => s.pnlPercent !== undefined);

    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        averagePnLSol: 0,
        totalPnLSol: 0,
        medianPnLSol: 0,
        averagePnLPercent: 0,
        bestTradePercent: 0,
        worstTradePercent: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        profitFactor: 0,
      };
    }

    const winningTrades = trades.filter(t => (t.pnlPercent || 0) > 0);
    const losingTrades = trades.filter(t => (t.pnlPercent || 0) < 0);

    const pnls = trades.map(t => t.pnlPercent || 0);
    const sortedPnls = [...pnls].sort((a, b) => a - b);

    const totalPnL = pnls.reduce((a, b) => a + b, 0);
    const avgPnL = totalPnL / pnls.length;

    // Sharpe (vereinfacht, ohne Risk-Free Rate)
    const returnsStd = this.std(pnls);
    const sharpe = returnsStd > 0 ? avgPnL / returnsStd : 0;

    // Downside deviation for Sortino
    const downsideReturns = pnls.filter(p => p < 0);
    const downsideStd = downsideReturns.length > 0 ? this.std(downsideReturns) : 0;
    const sortino = downsideStd > 0 ? avgPnL / downsideStd : 0;

    // Profit Factor
    const grossProfit = winningTrades.reduce((sum, t) => sum + (t.pnlPercent || 0), 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnlPercent || 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;

    return {
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: winningTrades.length / trades.length,
      averagePnLSol: 0, // Would need position size to compute
      totalPnLSol: 0,
      medianPnLSol: sortedPnls[Math.floor(sortedPnls.length / 2)],
      averagePnLPercent: avgPnL,
      bestTradePercent: sortedPnls[sortedPnls.length - 1],
      worstTradePercent: sortedPnls[0],
      sharpeRatio: sharpe,
      sortinoRatio: sortino,
      profitFactor,
    };
  }

  private computeRiskQuality(signals: BacktestSignal[]): RiskQualityMetrics {
    // Placeholder - würde komplexere Drawdown-Berechnung erfordern
    return {
      maxDrawdownPercent: 0,
      maxDrawdownDurationMs: 0,
      calmarRatio: 0,
      volatilityDaily: 0,
      volatilityAnnualized: 0,
      maxPositionsHeld: 0,
      avgPositionDurationMs: 0,
      maxConsecutiveLosses: 0,
      avgConsecutiveLosses: 0,
    };
  }

  private computeOverallScore(
    signal: SignalQualityMetrics,
    _leadTime: LeadTimeMetrics,
    trading: TradingQualityMetrics,
    _risk: RiskQualityMetrics
  ): number {
    // Gewichtete Kombination
    const signalWeight = 0.4;
    const tradingWeight = 0.4;
    const leadTimeWeight = 0.2;

    // F1 als Signal-Score
    const signalScore = signal.f1Score;

    // Win Rate als Trading-Score
    const tradingScore = trading.winRate;

    // Mean Lead Time Score ( >2h = gut, <30min = schlecht)
    // Normalisiert auf 0-1
    const leadTimeScore = 0.5; // Placeholder

    return signalWeight * signalScore + tradingWeight * tradingScore + leadTimeWeight * leadTimeScore;
  }

  private computeRecommendation(signal: SignalQualityMetrics, overallScore: number): 'USE' | 'RECONSIDER' | 'ABANDON' {
    // Harte Kriterien
    if (signal.precision < 0.15 && overallScore < 0.2) {
      return 'ABANDON';
    }
    if (signal.precision > 0.30 && signal.recall > 0.15 && overallScore > 0.35) {
      return 'USE';
    }
    return 'RECONSIDER';
  }

  private identifyDataGaps(signals: BacktestSignal[], groundTruth: GroundTruthRecord[]): string[] {
    const gaps: string[] = [];

    if (groundTruth.length === 0) {
      gaps.push('Keine Ground-Truth Labels vorhanden');
    }

    if (signals.length < 30) {
      gaps.push(`Nur ${signals.length} Signale - statistisch nicht signifikant`);
    }

    const resolved = signals.filter(s => s.resolved);
    if (resolved.length < 10) {
      gaps.push(`Nur ${resolved.length} resolved Signale`);
    }

    return gaps;
  }

  private identifyWarnings(signals: BacktestSignal[], signal: SignalQualityMetrics): string[] {
    const warnings: string[] = [];

    if (signal.truePositives === 0 && signal.falsePositives > 10) {
      warnings.push('Hohe False Positive Rate ohne jemals True Positive');
    }

    if (signal.recall < 0.05) {
      warnings.push('Sehr niedrige Recall - meisten Crashes werden verpasst');
    }

    const shorts = signals.filter(s => s.decision === 'SHORT');
    if (shorts.length > signals.length * 0.5) {
      warnings.push('Über 50% der Signale sind SHORT - möglicherweise zu aggressiv');
    }

    return warnings;
  }

  private std(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
  }
}

// Export singleton
export const evaluator = new Evaluator();

/**
 * Vergleiche mehrere Modelle nebeneinander
 */
export function compareModels(results: EvaluationResult[]): {
  rankings: { model: string; overallScore: number; recommendation: string }[];
  bestModel: string;
  improvements: { from: string; to: string; metric: string; improvement: number }[];
} {
  const rankings = results
    .map(r => ({
      model: r.modelName,
      overallScore: r.overallScore,
      recommendation: r.recommendation,
    }))
    .sort((a, b) => b.overallScore - a.overallScore);

  const bestModel = rankings[0]?.model || 'NONE';

  // Berechne Verbesserungen gegenüber Baseline B1 (Random)
  const baseline = results.find(r => r.modelName.includes('B1'));
  const improvements: { from: string; to: string; metric: string; improvement: number }[] = [];

  if (baseline) {
    for (const result of results) {
      if (result.modelName !== baseline.modelName) {
        const precisionImprovement = result.signalQuality.precision - baseline.signalQuality.precision;
        if (precisionImprovement > 0.05) {
          improvements.push({
            from: baseline.modelName,
            to: result.modelName,
            metric: 'precision',
            improvement: precisionImprovement,
          });
        }
      }
    }
  }

  return { rankings, bestModel, improvements };
}