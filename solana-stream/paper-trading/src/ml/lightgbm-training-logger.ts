/**
 * KAS PA - LightGBM Training Data Logger
 *
 * Protokolliert ALLE Features die für LightGBM Training benötigt werden:
 * - 9 Crash Metrics (Rohwerte)
 * - 9 Z-Scores
 * - Bot Detection Features
 * - Orderflow Features (TFI, OBI)
 * - Velocity Features
 * - Trade Outcomes mit echten Labels
 *
 * Diese Daten ermöglichen späteres Training eines ML-Modells.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface LightGbmFeatures {
  // === IDENTIFIER ===
  timestamp: number;
  slot: number;
  cycleNumber: number;
  symbol: string;

  // === 9 CRASH METRICS (ROHWERTE) ===
  raw_n: number;
  raw_PE: number;
  raw_kappa: number;
  raw_fragmentation: number;
  raw_rt: number;
  raw_bValue: number;
  raw_CTE: number;
  raw_SSI: number;
  raw_LFI: number;

  // === 9 Z-SCORES (FÜR LIGHTGBM WICHTIG!) ===
  z_n: number;
  z_PE: number;
  z_kappa: number;
  z_fragmentation: number;
  z_rt: number;
  z_bValue: number;
  z_CTE: number;
  z_SSI: number;
  z_LFI: number;

  // === BAYESIAN OUTPUT ===
  crashProbability: number;
  zone: 'IGNORE' | 'MONITOR' | 'IMMEDIATE_SHORT';
  confirmingMetrics: number;

  // === BOT DETECTION FEATURES ===
  botProbability: number;
  jitoBundleCount: number;
  sandwichCount: number;
  sniperCount: number;
  liquidationCount: number;
  arbitrageCount: number;
  backrunCount: number;
  highPriorityTxCount: number;
  veryHighPriorityTxCount: number;
  avgFee: number;

  // === ORDER FLOW FEATURES ===
  tfi: number;                    // Trade Flow Imbalance (-1 to +1)
  tfi_pressure: string;           // 'strong_sell' | 'sell' | 'neutral' | 'buy' | 'strong_buy'
  obi: number;                   // Order Book Imbalance (-1 to +1)
  buyVolume: number;
  sellVolume: number;
  volumeRatio: number;            // buyVolume / totalVolume

  // === VELOCITY FEATURES ===
  priceChange1min: number;
  priceChange5min: number;
  priceChange15min: number;
  priceChange1h: number;
  acceleration: number;
  jerk: number;
  isFlashCrash: boolean;
  isSteadyDump: boolean;
  isMomentumReversal: boolean;

  // === PRICE FEATURES ===
  price: number;
  priceChange24h: number;
  liquidity: number;
  volume24h: number;

  // === TIME FEATURES (CYCLICAL) ===
  hourOfDay: number;             // 0-23
  dayOfWeek: number;             // 0-6
  isWeekend: boolean;

  // === DECISION FEATURES ===
  decision: 'SHORT' | 'MONITOR' | 'IGNORE' | 'NO_SIGNAL';
  decisionConfidence: number;
  kellyFraction: number;
  positionSize: number;

  // === TRADE OUTCOME (NACH EXIT) ===
  tradeAction?: 'OPEN' | 'EXIT';
  tradeReason?: string;           // 'TAKE_PROFIT' | 'STOP_LOSS' | 'TIME_EXIT' | etc.
  entryPrice?: number;
  exitPrice?: number;
  pnlSol?: number;
  pnlPercent?: number;
  holdingHours?: number;

  // === CRASH VERIFICATION (FÜR TRAININGSLABELS) ===
  // Diese werden 24h nach Prediction gesetzt
  actualCrashOccurred?: boolean;  // TRUE LABEL: Preis drop >= 3%?
  actualDrop24h?: number;         // Tatsächlicher Preissturz in %
  verificationStatus?: 'PENDING' | 'VERIFIED' | 'FALSE_POSITIVE' | 'TRUE_POSITIVE' | 'TRUE_NEGATIVE' | 'FALSE_NEGATIVE';
}

export interface TrainingDataConfig {
  logPath: string;
  verificationIntervalMs: number;  // 24 * 60 * 60 * 1000 = 24h
  enableVerification: boolean;
}

export class LightGbmTrainingLogger {
  private features: LightGbmFeatures[] = [];
  private pendingVerifications: Map<string, LightGbmFeatures> = new Map();
  private readonly logPath: string;
  private readonly verificationIntervalMs: number;
  private readonly enableVerification: boolean;
  private cycleCount: number = 0;
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(config: TrainingDataConfig) {
    this.logPath = config.logPath;
    this.verificationIntervalMs = config.verificationIntervalMs;
    this.enableVerification = config.enableVerification;

    // Ensure directory exists
    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Flush to disk every 100 records
    this.flushInterval = setInterval(() => {
      if (this.features.length > 0) {
        this.flushToDisk();
      }
    }, 60000); // Every minute
  }

  /**
   * Loggt Features für einen Cycle
   */
  logCycle(data: {
    slot: number;
    symbol: string;
    rawMetrics: Record<string, number>;
    zScores: Record<string, number>;
    crashProbability: number;
    zone: string;
    confirmingMetrics: number;
    botMetrics: Record<string, number>;
    tfi?: { tfi: number; pressure: string; buyVolume?: number; sellVolume?: number; volumeRatio?: number };
    obi?: { obi: number };
    velocity?: Record<string, any>;
    price: number;
    priceChange24h: number;
    liquidity?: number;
    volume24h?: number;
    decision: { action: string; confidence: number };
    kellyFraction?: number;
    positionSize?: number;
  }): void {
    this.cycleCount++;

    const now = Date.now();
    const date = new Date(now);

    const features: LightGbmFeatures = {
      // === IDENTIFIER ===
      timestamp: now,
      slot: data.slot,
      cycleNumber: this.cycleCount,
      symbol: data.symbol,

      // === 9 CRASH METRICS (ROHWERTE) ===
      raw_n: data.rawMetrics.n || 0,
      raw_PE: data.rawMetrics.PE || 0,
      raw_kappa: data.rawMetrics.kappa || 0,
      raw_fragmentation: data.rawMetrics.fragmentation || 0,
      raw_rt: data.rawMetrics.rt || 0,
      raw_bValue: data.rawMetrics.bValue || 0,
      raw_CTE: data.rawMetrics.CTE || 0,
      raw_SSI: data.rawMetrics.SSI || 0,
      raw_LFI: data.rawMetrics.LFI || 0,

      // === 9 Z-SCORES (FÜR LIGHTGBM WICHTIG!) ===
      z_n: data.zScores.z_n || 0,
      z_PE: data.zScores.z_PE || 0,
      z_kappa: data.zScores.z_kappa || 0,
      z_fragmentation: data.zScores.z_fragmentation || 0,
      z_rt: data.zScores.z_rt || 0,
      z_bValue: data.zScores.z_bValue || 0,
      z_CTE: data.zScores.z_CTE || 0,
      z_SSI: data.zScores.z_SSI || 0,
      z_LFI: data.zScores.z_LFI || 0,

      // === BAYESIAN OUTPUT ===
      crashProbability: data.crashProbability,
      zone: data.zone as any,
      confirmingMetrics: data.confirmingMetrics,

      // === BOT DETECTION FEATURES ===
      botProbability: data.botMetrics.botProbability || 0,
      jitoBundleCount: data.botMetrics.jitoBundleCount || 0,
      sandwichCount: data.botMetrics.sandwichCount || 0,
      sniperCount: data.botMetrics.sniperCount || 0,
      liquidationCount: data.botMetrics.liquidationCount || 0,
      arbitrageCount: data.botMetrics.arbitrageCount || 0,
      backrunCount: data.botMetrics.backrunCount || 0,
      highPriorityTxCount: data.botMetrics.highPriorityTxCount || 0,
      veryHighPriorityTxCount: data.botMetrics.veryHighPriorityTxCount || 0,
      avgFee: data.botMetrics.avgFee || 0,

      // === ORDER FLOW FEATURES ===
      tfi: data.tfi?.tfi || 0,
      tfi_pressure: data.tfi?.pressure || 'neutral',
      obi: data.obi?.obi || 0,
      buyVolume: data.tfi && (data.tfi as any).buyVolume || 0,
      sellVolume: data.tfi && (data.tfi as any).sellVolume || 0,
      volumeRatio: data.tfi && (data.tfi as any).volumeRatio || 0.5,

      // === VELOCITY FEATURES ===
      priceChange1min: data.velocity?.change_1min || 0,
      priceChange5min: data.velocity?.change_5min || 0,
      priceChange15min: data.velocity?.change_15min || 0,
      priceChange1h: data.velocity?.change_1h || 0,
      acceleration: data.velocity?.acceleration || 0,
      jerk: data.velocity?.jerk || 0,
      isFlashCrash: data.velocity?.isFlashCrash || false,
      isSteadyDump: data.velocity?.isSteadyDump || false,
      isMomentumReversal: data.velocity?.isMomentumReversal || false,

      // === PRICE FEATURES ===
      price: data.price,
      priceChange24h: data.priceChange24h,
      liquidity: data.liquidity || 0,
      volume24h: data.volume24h || 0,

      // === TIME FEATURES (CYCLICAL) ===
      hourOfDay: date.getHours(),
      dayOfWeek: date.getDay(),
      isWeekend: date.getDay() === 0 || date.getDay() === 6,

      // === DECISION FEATURES ===
      decision: data.decision.action as any || 'NO_SIGNAL',
      decisionConfidence: data.decision.confidence || 0,
      kellyFraction: data.kellyFraction || 0,
      positionSize: data.positionSize || 0,

      // === TRADE OUTCOME (initial) ===
      verificationStatus: 'PENDING',
    };

    // Store in memory
    this.features.push(features);

    // Add to pending verification
    if (this.enableVerification) {
      const key = `${data.symbol}:${Math.floor(now / this.verificationIntervalMs)}`;
      this.pendingVerifications.set(key, features);
    }

    // Write to disk immediately for critical data
    this.appendToFile(features);
  }

  /**
   * Loggt ein Trade OPEN Event
   */
  logTradeOpen(
    symbol: string,
    entryPrice: number,
    amount: number,
    crashProbability: number
  ): void {
    const key = `${symbol}:${crashProbability.toFixed(3)}`;
    const features = this.pendingVerifications.get(key);

    if (features) {
      features.tradeAction = 'OPEN';
      features.entryPrice = entryPrice;
      features.positionSize = amount;
    }
  }

  /**
   * Loggt ein Trade EXIT Event und berechnet PnL
   */
  logTradeExit(
    symbol: string,
    exitPrice: number,
    reason: string,
    entryPrice: number,
    holdingHours: number
  ): void {
    // Find pending OPEN trade for this symbol
    for (const [key, features] of this.pendingVerifications.entries()) {
      if (key.startsWith(symbol) && features.tradeAction === 'OPEN') {
        features.tradeAction = 'EXIT';
        features.exitPrice = exitPrice;
        features.tradeReason = reason;
        features.holdingHours = holdingHours;

        // Calculate PnL ( SHORT position: profit when price drops )
        const priceDrop = (entryPrice - exitPrice) / entryPrice;
        features.pnlPercent = priceDrop * 100;
        features.pnlSol = priceDrop * features.positionSize;

        // Update on disk
        this.updateOnDisk(features);

        this.pendingVerifications.delete(key);
        break;
      }
    }
  }

  /**
   * Führt Crash Verification nach 24h durch
   */
  async verifyPendingCrashes(
    getCurrentPrice: (symbol: string) => Promise<number>
  ): Promise<void> {
    if (!this.enableVerification) return;

    const now = Date.now();
    const verified: LightGbmFeatures[] = [];

    for (const [key, features] of this.pendingVerifications.entries()) {
      const elapsed = now - features.timestamp;

      // Only verify after 24h
      if (elapsed < this.verificationIntervalMs) continue;

      // Get current price and calculate actual drop
      try {
        const currentPrice = await getCurrentPrice(features.symbol);
        const actualDrop24h = ((features.price - currentPrice) / features.price) * 100;

        features.actualDrop24h = actualDrop24h;
        features.actualCrashOccurred = actualDrop24h >= 3; // 3% threshold

        if (features.zone === 'IGNORE') {
          features.verificationStatus = actualDrop24h < 3 ? 'TRUE_NEGATIVE' : 'FALSE_NEGATIVE';
        } else if (features.tradeAction === 'OPEN') {
          features.verificationStatus = actualDrop24h >= 3 ? 'TRUE_POSITIVE' : 'FALSE_POSITIVE';
        } else {
          features.verificationStatus = 'VERIFIED';
        }

        // Update on disk
        this.updateOnDisk(features);
        verified.push(features);

      } catch (error) {
        console.error(`[LightGbmLogger] Verification failed for ${key}:`, error);
      }

      this.pendingVerifications.delete(key);
    }

    if (verified.length > 0) {
      console.log(`[LightGbmLogger] Verified ${verified.length} predictions`);
    }
  }

  /**
   * Append single record to file (streaming)
   */
  private appendToFile(features: LightGbmFeatures): void {
    const line = JSON.stringify(features);
    fs.appendFileSync(this.logPath, line + '\n');
  }

  /**
   * Update existing record on disk
   */
  private updateOnDisk(updatedFeatures: LightGbmFeatures): void {
    // For updates, we append a special UPDATE record
    // The training script will handle deduplication
    const updateRecord = {
      ...updatedFeatures,
      _update: true,
      _originalTimestamp: updatedFeatures.timestamp,
    };
    fs.appendFileSync(this.logPath, JSON.stringify(updateRecord) + '\n');
  }

  /**
   * Flush all in-memory features to disk
   */
  private flushToDisk(): void {
    for (const features of this.features) {
      this.appendToFile(features);
    }
    this.features = [];
  }

  /**
   * Get current training data statistics
   */
  getStats(): {
    totalRecords: number;
    pendingVerifications: number;
    verified: number;
    unverified: number;
    crashes: number;
    noCrashes: number;
  } {
    let verified = 0;
    let crashes = 0;
    let noCrashes = 0;

    for (const f of this.features) {
      if (f.verificationStatus !== 'PENDING') {
        verified++;
        if (f.actualCrashOccurred) crashes++;
        else noCrashes++;
      }
    }

    return {
      totalRecords: this.features.length,
      pendingVerifications: this.pendingVerifications.size,
      verified,
      unverified: this.features.length - verified,
      crashes,
      noCrashes,
    };
  }

  /**
   * Export as CSV for training
   */
  exportCSV(): string {
    if (this.features.length === 0) return '';

    const headers = Object.keys(this.features[0]);
    const rows = this.features.map(f => headers.map(h => {
      const val = (f as any)[h];
      return typeof val === 'string' ? `"${val}"` : (val ?? '');
    }).join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flushToDisk();
  }
}

// Singleton instance
let trainingLogger: LightGbmTrainingLogger | null = null;

export function getTrainingLogger(): LightGbmTrainingLogger {
  if (!trainingLogger) {
    trainingLogger = new LightGbmTrainingLogger({
      logPath: process.env.TRAINING_DATA_PATH || './logs/lightgbm-training.jsonl',
      verificationIntervalMs: 24 * 60 * 60 * 1000, // 24h
      enableVerification: true,
    });
  }
  return trainingLogger;
}
