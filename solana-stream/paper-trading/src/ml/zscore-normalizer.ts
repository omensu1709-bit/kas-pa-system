/**
 * Z-Score Normalizer für Crash Metrics
 *
 * Berechnet echte Z-scores für alle 9 Crash-Metriken.
 * Z-scores zeigen, wie weit ein Wert vom historischen Mittelwert abweicht
 * (in Standardabweichungen). Das ist entscheidend für LightGBM Training.
 */

import { METRIC_COEFFICIENTS } from '../metrics/index.js';

export interface MetricBaselines {
  // Mittelwerte (µ) für jede Metrik
  mean_n: number;
  mean_PE: number;
  mean_kappa: number;
  mean_fragmentation: number;
  mean_rt: number;
  mean_bValue: number;
  mean_CTE: number;
  mean_SSI: number;
  mean_LFI: number;

  // Standardabweichungen (σ) für jede Metrik
  std_n: number;
  std_PE: number;
  std_kappa: number;
  std_fragmentation: number;
  std_rt: number;
  std_bValue: number;
  std_CTE: number;
  std_SSI: number;
  std_LFI: number;

  // Historische Samples für adaptive Berechnung
  samples_n: number[];
  samples_PE: number[];
  samples_kappa: number[];
  samples_fragmentation: number[];
  samples_rt: number[];
  samples_bValue: number[];
  samples_CTE: number[];
  samples_SSI: number[];
  samples_LFI: number[];

  // Wann letzte Aktualisierung
  lastUpdate: number;
}

export interface ZScoreResult {
  z_n: number;
  z_PE: number;
  z_kappa: number;
  z_fragmentation: number;
  z_rt: number;
  z_bValue: number;
  z_CTE: number;
  z_SSI: number;
  z_LFI: number;

  // Gesamt-Crash-Wahrscheinlichkeit aus Z-scores
  crashProbability: number;
  confirmingMetrics: number;
}

const DEFAULT_BASELINES: MetricBaselines = {
  // Typische Solana Memecoin Werte (basierend auf Forschung)
  mean_n: 0.55,
  mean_PE: 0.65,
  mean_kappa: 4.5,
  mean_fragmentation: 0.45,
  mean_rt: 0.85,
  mean_bValue: 1.8,
  mean_CTE: 0.35,
  mean_SSI: 3.0,
  mean_LFI: 1.2,

  std_n: 0.15,
  std_PE: 0.12,
  std_kappa: 1.2,
  std_fragmentation: 0.15,
  std_rt: 0.25,
  std_bValue: 0.5,
  std_CTE: 0.15,
  std_SSI: 1.5,
  std_LFI: 0.6,

  samples_n: [],
  samples_PE: [],
  samples_kappa: [],
  samples_fragmentation: [],
  samples_rt: [],
  samples_bValue: [],
  samples_CTE: [],
  samples_SSI: [],
  samples_LFI: [],

  lastUpdate: Date.now(),
};

export class ZScoreNormalizer {
  private baselines: MetricBaselines;
  private readonly MAX_SAMPLES = 10000; // Rolling window
  private readonly MIN_SAMPLES_FOR_ADAPTIVE = 100; // Mindestens 100 Samples für adaptive Z-scores

  constructor(initialBaselines?: Partial<MetricBaselines>) {
    this.baselines = { ...DEFAULT_BASELINES, ...initialBaselines };
  }

  /**
   * Fügt neue Rohwerte hinzu und aktualisiert die Baselines
   */
  addSample(raw: {
    n: number;
    PE: number;
    kappa: number;
    fragmentation: number;
    rt: number;
    bValue: number;
    CTE: number;
    SSI: number;
    LFI: number;
  }): void {
    const now = Date.now();

    // Nur Samples mit gültigen Werten hinzufügen
    if (raw.n > 0) this.addToSamples('n', raw.n);
    if (raw.PE > 0) this.addToSamples('PE', raw.PE);
    if (raw.kappa > 0) this.addToSamples('kappa', raw.kappa);
    if (raw.fragmentation >= 0) this.addToSamples('fragmentation', raw.fragmentation);
    if (raw.rt > 0) this.addToSamples('rt', raw.rt);
    if (raw.bValue > 0) this.addToSamples('bValue', raw.bValue);
    if (raw.CTE >= 0) this.addToSamples('CTE', raw.CTE);
    if (raw.SSI >= 0) this.addToSamples('SSI', raw.SSI);
    if (raw.LFI >= 0) this.addToSamples('LFI', raw.LFI);

    // Alle 100 Samples die Statistiken neu berechnen
    if (now - this.baselines.lastUpdate > 60000) { // Max 1x pro Minute
      this.recomputeStatistics();
      this.baselines.lastUpdate = now;
    }
  }

  private addToSamples(metric: keyof typeof DEFAULT_BASELINES, value: number): void {
    const samples = this.baselines[`samples_${metric.toLowerCase()}` as keyof MetricBaselines] as number[];
    if (Array.isArray(samples)) {
      samples.push(value);
      if (samples.length > this.MAX_SAMPLES) {
        samples.shift();
      }
    }
  }

  /**
   * Berechnet Statistiken neu aus den Samples
   */
  private recomputeStatistics(): void {
    const metrics = ['n', 'PE', 'kappa', 'fragmentation', 'rt', 'bValue', 'CTE', 'SSI', 'LFI'] as const;

    for (const metric of metrics) {
      const samples = this.baselines[`samples_${metric}` as keyof MetricBaselines] as number[];
      if (samples && samples.length >= this.MIN_SAMPLES_FOR_ADAPTIVE) {
        const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
        const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
        const std = Math.sqrt(variance);

        this.baselines[`mean_${metric}` as keyof MetricBaselines] = mean;
        this.baselines[`std_${metric}` as keyof MetricBaselines] = Math.max(std, 0.001); // Prevent division by zero
      }
    }
  }

  /**
   * Berechnet Z-scores für gegebene Rohwerte
   */
  computeZScores(raw: {
    n: number;
    PE: number;
    kappa: number;
    fragmentation: number;
    rt: number;
    bValue: number;
    CTE: number;
    SSI: number;
    LFI: number;
  }): ZScoreResult {
    // Z-score = (x - µ) / σ
    const z_n = this.zScore(raw.n, 'n');
    const z_PE = this.zScore(raw.PE, 'PE');
    const z_kappa = this.zScore(raw.kappa, 'kappa');
    const z_fragmentation = this.zScore(raw.fragmentation, 'fragmentation');
    const z_rt = this.zScore(raw.rt, 'rt');
    const z_bValue = this.zScore(raw.bValue, 'bValue');
    const z_CTE = this.zScore(raw.CTE, 'CTE');
    const z_SSI = this.zScore(raw.SSI, 'SSI');
    const z_LFI = this.zScore(raw.LFI, 'LFI');

    // Crash Probability aus Z-scores (wie in metrics/index.ts)
    const { probability, confirmingMetrics } = this.computeCrashFromZScores({
      n: z_n,
      PE: z_PE,
      kappa: z_kappa,
      fragmentation: z_fragmentation,
      rt: z_rt,
      bValue: z_bValue,
      CTE: z_CTE,
      SSI: z_SSI,
      LFI: z_LFI,
    });

    return {
      z_n,
      z_PE,
      z_kappa,
      z_fragmentation,
      z_rt,
      z_bValue,
      z_CTE,
      z_SSI,
      z_LFI,
      crashProbability: probability,
      confirmingMetrics,
    };
  }

  private zScore(value: number, metric: string): number {
    const mean = this.baselines[`mean_${metric}` as keyof MetricBaselines] as number;
    const std = this.baselines[`std_${metric}` as keyof MetricBaselines] as number;

    if (std === 0 || !isFinite(std)) {
      return 0;
    }

    return (value - mean) / std;
  }

  /**
   * Berechnet Crash-Wahrscheinlichkeit aus Z-scores
   * (identisch mit metrics/index.ts computeCrashProbability)
   */
  private computeCrashFromZScores(z: {
    n: number;
    PE: number;
    kappa: number;
    fragmentation: number;
    rt: number;
    bValue: number;
    CTE: number;
    SSI: number;
    LFI: number;
  }): { probability: number; confirmingMetrics: number } {
    const c = METRIC_COEFFICIENTS;

    const linearPredictor =
      c.beta0 +
      c.beta1_kappa * z.kappa +
      c.beta2_rt * z.rt +
      c.beta3_PE * z.PE +
      c.beta4_CTE * z.CTE +
      c.beta5_bValue * z.bValue +
      c.beta6_n * z.n +
      c.beta7_fragmentation * z.fragmentation +
      c.beta8_SSI * z.SSI +
      c.beta9_LFI * z.LFI +
      c.gamma1_kappa_n * z.kappa * z.n +
      c.gamma2_PE_fragmentation * z.PE * z.fragmentation +
      c.gamma3_LFI_SSI * z.LFI * z.SSI;

    const probability = 1 / (1 + Math.exp(-linearPredictor));

    // Count confirming metrics (|z| > 1.5 typically indicates danger)
    let confirmingMetrics = 0;
    if (z.n > 1.5) confirmingMetrics++;
    if (z.PE < -1.5) confirmingMetrics++;
    if (z.kappa < -1.5) confirmingMetrics++;
    if (z.fragmentation > 1.5) confirmingMetrics++;
    if (z.rt > 1.5) confirmingMetrics++;
    if (z.bValue < -1.5) confirmingMetrics++;
    if (z.CTE > 1.5) confirmingMetrics++;
    if (z.SSI > 1.5) confirmingMetrics++;
    if (z.LFI > 1.5) confirmingMetrics++;

    return { probability, confirmingMetrics };
  }

  /**
   * Exportiert aktuelle Baselines für Persistence
   */
  exportBaselines(): MetricBaselines {
    return { ...this.baselines };
  }

  /**
   * Importiert gespeicherte Baselines
   */
  importBaselines(baselines: MetricBaselines): void {
    this.baselines = { ...baselines };
  }

  /**
   * Gibt Statistiken zurück
   */
  getStats(): {
    totalSamples: number;
    hasAdaptiveZScores: boolean;
    baselinesAge: number;
  } {
    const totalSamples = (
      this.baselines.samples_n.length +
      this.baselines.samples_PE.length +
      this.baselines.samples_kappa.length
    );

    return {
      totalSamples,
      hasAdaptiveZScores: totalSamples >= this.MIN_SAMPLES_FOR_ADAPTIVE,
      baselinesAge: Date.now() - this.baselines.lastUpdate,
    };
  }
}

// Singleton instance
let zScoreNormalizer: ZScoreNormalizer | null = null;

export function getZScoreNormalizer(): ZScoreNormalizer {
  if (!zScoreNormalizer) {
    zScoreNormalizer = new ZScoreNormalizer();
  }
  return zScoreNormalizer;
}
