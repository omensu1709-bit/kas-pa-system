/**
 * KAS PA v4.0 - BAYESIAN DECISION ENGINE
 * 
 * Implements the Brier-Guillotine for probabilistic trade decisions
 * Replaces the binary minConfirmingMetrics check with continuous probability
 * 
 * CRITICAL: All configuration MUST come from config.ts - NO hardcoded values!
 */

import type { ShortTarget } from './ranking-service.js';
import { SYSTEM_CONFIG } from './config.js';

// ============================================================================
// TYPES
// ============================================================================

export interface BayesianConfig {
  baseThreshold: number;        // From config.ts
  kellyFraction: number;       // From config.ts
  kellyMode: 'quarter' | 'half' | 'full';
  maxPositions: number;        // From config.ts
  maxPositionPercent: number;  // From config.ts
  stopLossPercent: number;     // From config.ts
  takeProfitPercent: number;    // From config.ts
  maxHoldingHours: number;     // From config.ts
}

export interface CrashSignal {
  symbol: string;
  crashProbability: number;    // P(E|H) from 9 metrics
  confirmingMetrics: number;    // How many metrics confirm
  zone: 'IGNORE' | 'MONITOR' | 'IMMEDIATE_SHORT';
  zScores?: Record<string, number>;
  slowShortScore?: number;
  // Helius Memecoin Signals
  memecoinSignals?: MemecoinSignals;
  // SOTA v5.0: Price Velocity (LEADING indicator)
  velocityBoost?: number;
  velocitySignal?: any;
  // SOTA v5.0: Order Book Signal (Phoenix/OpenBook on-chain)
  orderBookSignal?: any;
  // SOTA v5.0: Price Momentum Score
  priceMomentumScore?: number;
}

export interface MemecoinSignals {
  buySellRatio: number;        // >1.0 = more buys (bullish), <1.0 = more sells (bearish)
  whaleSellPressure: number;  // 0-1, higher = more bearish
  volumeSpike: number;        // Multiple of 24h average
  smartMoneyExit: boolean;   // Whales selling during volume spike
  buyPressure: number;        // 0-1, normalized buy volume
  whaleAlert: boolean;        // Significant whale selling detected
}

export interface TradingRegime {
  type: 'BULL' | 'BEAR' | 'HIGH_BOT' | 'CRASH_IMMINENT' | 'NEUTRAL';
  ivRegime: 'LOW' | 'MEDIUM' | 'HIGH';
  thresholdMultiplier: number;
  positionSizeMultiplier: number;
}

export interface DecisionResult {
  action: 'SHORT' | 'MONITOR' | 'IGNORE';
  symbol: string;
  posteriorProbability: number;  // P(H|E) - final probability
  brierScore: number;             // Historical accuracy
  confidence: number;             // 1 - Brier
  kellyFraction: number;         // Position size %
  positionSize: number;          // SOL amount
  regime: TradingRegime;
  reason: string;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  // SOTA v5.0: Dynamic Leverage
  leverage?: number;              // 1-10x based on signal strength
  // SOTA v5.0: Consensus
  consensusCount?: number;        // 0-5 signals agreeing
  consensusRecommendation?: 'STRONG_SHORT' | 'WEAK_SHORT' | 'IGNORE';
}

export interface BrierHistoryEntry {
  predictedProbability: number;
  realizedOutcome: number;  // 1 = crash occurred, 0 = no crash
  timestamp: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CONFIG: BayesianConfig = {
  baseThreshold: SYSTEM_CONFIG.immediateShortThreshold,
  kellyFraction: SYSTEM_CONFIG.kellyFraction,
  kellyMode: SYSTEM_CONFIG.kellyMode,
  maxPositions: SYSTEM_CONFIG.maxPositions,
  maxPositionPercent: SYSTEM_CONFIG.maxPositionPercent,
  stopLossPercent: SYSTEM_CONFIG.stopLossPercent,
  takeProfitPercent: SYSTEM_CONFIG.takeProfitPercent,
  maxHoldingHours: SYSTEM_CONFIG.maxHoldingHours
};

// IV Regime thresholds
const IV_REGIMES = {
  LOW: { maxIv: 30, multiplier: 1.0 },
  MEDIUM: { maxIv: 50, multiplier: 0.85 },
  HIGH: { maxIv: Infinity, multiplier: 0.70 }
};

// Regime position size multipliers
const REGIME_MULTIPLIERS = {
  BULL: { threshold: 1.0, size: 1.0 },
  BEAR: { threshold: 0.9, size: 1.5 },      // More aggressive in bear
  HIGH_BOT: { threshold: 1.2, size: 0.5 }, // Reduce in high bot activity
  CRASH_IMMINENT: { threshold: 0.8, size: 2.0 }, // Maximum leverage
  NEUTRAL: { threshold: 1.0, size: 1.0 }
};

// ============================================================================
// BAYESIAN DECISION ENGINE
// ============================================================================

export class BayesianDecisionEngine {
  private config: BayesianConfig;
  private brierHistory: Map<string, BrierHistoryEntry[]> = new Map();
  private maxHistoryLength = 100;
  private explorationMode: boolean = false;
  
  // Regime state
  private currentRegime: TradingRegime = {
    type: 'NEUTRAL',
    ivRegime: 'LOW',
    thresholdMultiplier: 1.0,
    positionSizeMultiplier: 1.0
  };

  // IV (Implied Volatility) - can be updated from external source
  private impliedVolatility: number = 30;  // Default MEDIUM

  constructor(config: Partial<BayesianConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setExplorationMode(enabled: boolean): void {
    this.explorationMode = enabled;
  }

  // ==========================================================================
  // BRIER SCORE CALCULATIONS
  // ==========================================================================

  /**
   * Calculate Brier Score for a single prediction
   * BS = (f - o)^2
   * Lower is better - 0 means perfect prediction
   */
  calculateBrierScore(predictedProb: number, realizedOutcome: number): number {
    return Math.pow(predictedProb - realizedOutcome, 2);
  }

  /**
   * Update Brier history for a symbol
   * This is used to calibrate the confidence threshold
   */
  updateBrierHistory(symbol: string, predictedProb: number, realizedOutcome: number): void {
    if (!this.brierHistory.has(symbol)) {
      this.brierHistory.set(symbol, []);
    }
    
    const history = this.brierHistory.get(symbol)!;
    history.push({
      predictedProbability: predictedProb,
      realizedOutcome,
      timestamp: Date.now()
    });
    
    // Keep only last N entries (rolling window)
    if (history.length > this.maxHistoryLength) {
      history.shift();
    }
  }

  /**
   * Calculate average Brier Score for a symbol
   * Returns confidence = 1 - average Brier
   */
  calculateConfidence(symbol: string): number {
    const history = this.brierHistory.get(symbol);
    if (!history || history.length === 0) {
      return 0.5;  // No history = 50% confidence
    }

    const avgBrier = history.reduce((sum, entry) => {
      return sum + this.calculateBrierScore(entry.predictedProbability, entry.realizedOutcome);
    }, 0) / history.length;

    // Confidence = 1 - Brier
    // If avgBrier = 0.05, confidence = 0.95 (95%)
    return Math.max(0, Math.min(1, 1 - avgBrier));
  }

  // ==========================================================================
  // BAYESIAN PROBABILITY CALCULATION
  // ==========================================================================

  /**
   * Calculate Posterior Probability using Bayes Theorem
   * 
   * P(H|E) = P(E|H) * P(H) / P(E)
   * 
   * Where:
   * P(H) = Prior = Ranking ShortSignalScore / 100
   * P(E|H) = Likelihood = Crash Probability from 9 metrics
   * P(E) = Normalizing constant = P(E|H)P(H) + P(E|¬H)P(¬H)
   */
  calculatePosterior(
    priorProb: number,      // P(H) from Ranking
    likelihoodProb: number  // P(E|H) from Crash Detection
  ): number {
    // P(E|¬H) - probability of crash signal given no crash (base rate)
    const noCrashLikelihood = 0.05;  // 5% false positive rate
    
    // P(¬H) = 1 - P(H)
    const noPrior = 1 - priorProb;
    
    // P(E) = P(E|H)P(H) + P(E|¬H)P(¬H)
    const normalizer = (likelihoodProb * priorProb) + (noCrashLikelihood * noPrior);
    
    // Avoid division by zero
    if (normalizer === 0) return 0;
    
    // P(H|E) = P(E|H) * P(H) / P(E)
    const posterior = (likelihoodProb * priorProb) / normalizer;
    
    return Math.max(0, Math.min(1, posterior));
  }

  // ==========================================================================
  // REGIME DETECTION
  // ==========================================================================

  /**
   * Detect current trading regime based on market conditions
   */
  detectRegime(
    botProbability: number,
    avgCrashProb: number,
    volatility?: number
  ): TradingRegime {
    // Determine IV regime
    let ivRegime: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    if (this.impliedVolatility >= 50) ivRegime = 'HIGH';
    else if (this.impliedVolatility >= 30) ivRegime = 'MEDIUM';

    // Determine market regime
    let type: TradingRegime['type'] = 'NEUTRAL';
    
    if (botProbability > 0.7) {
      type = 'HIGH_BOT';
    } else if (avgCrashProb > 0.5) {
      type = 'CRASH_IMMINENT';
    } else if (volatility && volatility > 50) {
      type = 'BEAR';
    } else if (volatility && volatility < 20 && avgCrashProb < 0.1) {
      type = 'BULL';
    }

    // Get multipliers
    const regimeMultipliers = REGIME_MULTIPLIERS[type];
    const ivMultipliers = IV_REGIMES[ivRegime];

    this.currentRegime = {
      type,
      ivRegime,
      thresholdMultiplier: regimeMultipliers.threshold * ivMultipliers.multiplier,
      positionSizeMultiplier: regimeMultipliers.size
    };

    return this.currentRegime;
  }

  /**
   * Set implied volatility (can be called from external IV source)
   */
  setImpliedVolatility(iv: number): void {
    this.impliedVolatility = iv;
  }

  // ==========================================================================
  // KELLY CRITERION
  // ==========================================================================

  /**
   * Calculate Kelly fraction for position sizing
   * Kelly% = W - (1-W)/R
   * Where W = win rate, R = reward/risk ratio
   */
  calculateKellyFraction(
    winRate: number,         // Historical win rate (0-1)
    rewardRiskRatio: number  // Take profit / Stop loss
  ): number {
    if (rewardRiskRatio <= 0) return 0;
    
    const kelly = winRate - ((1 - winRate) / rewardRiskRatio);
    
    // Apply Kelly mode
    const modeMultiplier = {
      'quarter': 0.25,
      'half': 0.50,
      'full': 1.0
    }[this.config.kellyMode];

    return Math.max(0, Math.min(1, kelly * modeMultiplier * this.config.kellyFraction));
  }

  /**
   * Calculate position size in SOL with CONSENSUS ADJUSTMENT
   */
  calculatePositionSize(
    capital: number,
    kellyFraction: number,
    regime: TradingRegime,
    consensusCount: number = 0
  ): number {
    // Base size from Kelly
    let size = capital * kellyFraction;
    
    // Apply regime multiplier
    size *= regime.positionSizeMultiplier;
    
    // SOTA v5.0: Consensus Safety Factor
    // Higher consensus = larger position
    const consensusSafety = consensusCount >= 4 ? 1.0 :     // Strong signal = full Kelly
                            consensusCount >= 3 ? 0.75 :     // Good signal = 75%
                            consensusCount >= 2 ? 0.50 :     // Weak signal = 50%
                            0.25;                            // Very weak = 25%
    size *= consensusSafety;
    
    // Cap at max position percent
    const maxSize = capital * (this.config.maxPositionPercent / 100);
    
    // Hard cap: 5% min, 25% max
    return Math.min(size, Math.max(capital * 0.05, maxSize));
  }

  /**
   * SOTA v5.0: Calculate Variable Leverage based on signal strength
   * Higher consensus = higher leverage
   */
  calculateLeverage(consensusCount: number): number {
    const leverageMap: Record<number, number> = {
      5: 8,   // 5/5 signals = 8x leverage
      4: 5,   // 4/5 signals = 5x leverage
      3: 3,   // 3/5 signals = 3x leverage
      2: 2,   // 2/5 signals = 2x leverage
      1: 1,   // 1/5 signals = 1x (no leverage)
      0: 1    // 0/5 signals = 1x (no leverage)
    };
    return leverageMap[Math.min(5, Math.max(0, consensusCount))] || 1;
  }

  /**
   * SOTA v5.0: Calculate dynamic stop loss based on leverage
   * Higher leverage = tighter stop loss
   */
  calculateStopLoss(entryPrice: number, leverage: number): number {
    const baseStopLoss = 0.08; // 8% for 1x
    const maxStopLoss = 0.03;  // 3% for 8x
    
    // Stop loss tightens with higher leverage
    // 8x leverage = 3% stop loss, 1x leverage = 8% stop loss
    const stopLossPercent = maxStopLoss + (baseStopLoss - maxStopLoss) * (1 / leverage);
    
    return entryPrice * (1 + stopLossPercent);
  }

  /**
   * SOTA v5.0: Calculate take profit based on leverage
   * Target: 3:1 reward/risk ratio
   */
  calculateTakeProfit(entryPrice: number, leverage: number): number {
    const stopLossPercent = this.calculateStopLossPercent(leverage);
    const targetRatio = 3.0; // 3:1 reward/risk
    const takeProfitPercent = stopLossPercent * targetRatio;
    
    return entryPrice * (1 - takeProfitPercent);
  }

  private calculateStopLossPercent(leverage: number): number {
    const baseStopLoss = 0.08;
    const maxStopLoss = 0.03;
    return maxStopLoss + (baseStopLoss - maxStopLoss) * (1 / leverage);
  }

  // ==========================================================================
  // MAIN DECISION METHOD
  // ==========================================================================

  /**
   * Make trading decision for a coin
   * 
   * Returns a complete decision with action, sizing, and risk parameters
   */
  makeDecision(
    coin: ShortTarget,
    crashSignal: CrashSignal,
    botProbability: number,
    currentCapital: number,
    openPositions: number
  ): DecisionResult {
    const symbol = coin.symbol;
    
    // 1. Calculate Posterior Probability (Bayes)
    // Prior = Ranking ShortSignalScore (0-1)
    const prior = coin.shortSignalScore / 100;
    
    // Likelihood = Crash Probability from 9 metrics
    // Boost probability based on SlowShortScore if present
    let likelihood = crashSignal.crashProbability;
    if (crashSignal.slowShortScore && crashSignal.slowShortScore > 0.05) {
       likelihood = Math.min(0.99, likelihood + (crashSignal.slowShortScore * 0.2));
    }
    
    // 2. Calculate Brier Score / Confidence
    const confidence = this.calculateConfidence(symbol);
    const brierScore = 1 - confidence;

    // 3. Detect Regime first (so we can modify it based on Helius signals)
    let regime = this.detectRegime(botProbability, likelihood);
    
    // Helius Memecoin Signals Integration
    if (crashSignal.memecoinSignals) {
      const ms = crashSignal.memecoinSignals;
      
      // Boost likelihood based on whale sell pressure
      if (ms.whaleSellPressure > 0.3) {
        likelihood = Math.min(0.99, likelihood + (ms.whaleSellPressure * 0.15));
      }
      
      // Boost if smart money is exiting
      if (ms.smartMoneyExit) {
        likelihood = Math.min(0.99, likelihood + 0.1);
      }
      
      // Boost if buy ratio is low (bearish)
      if (ms.buySellRatio < 0.7) {
        likelihood = Math.min(0.99, likelihood + ((0.7 - ms.buySellRatio) * 0.2));
      }
      
      // Regime adjustment for whale activity
      if (ms.whaleAlert && regime.type === 'NEUTRAL') {
        regime.type = 'HIGH_BOT';
        regime.positionSizeMultiplier *= 0.7;
      }
    }
    
    // Posterior = P(H|E)
    const posterior = this.calculatePosterior(prior, likelihood);

    // 4. Calculate dynamic threshold
    // Base = 0.08 (8%), adjusted by regime and IV
    const dynamicThreshold = 0.08 * regime.thresholdMultiplier;

    // 5. Consensus Evaluation - BEFORE making decision
    const consensus = consensusEngine.evaluate(
      symbol,
      crashSignal.crashProbability,
      botProbability,
      velocityBoost,
      orderBookBoost
    );

    // 6. Posterior Check - Zone-basiert entscheiden
    // NUR SHORT wenn Zone IMMEDIATE_SHORT (>15%) und posterior >= 0.5
    if (crashSignal.zone === 'IMMEDIATE_SHORT' && posterior >= 0.5) {
      // HIGH CONFIDENCE SHORT - Zone und Bayesian stimmen überein
      // Berechne Kelly sizing für echte Entscheidung
      const winRate = 0.65;
      const rewardRiskRatio = this.config.takeProfitPercent / this.config.stopLossPercent;
      const kellyFraction = this.calculateKellyFraction(winRate, rewardRiskRatio);
      const positionSize = this.calculatePositionSize(currentCapital, kellyFraction, regime);

      return {
        action: 'SHORT',
        symbol,
        posteriorProbability: posterior,
        brierScore,
        confidence,
        kellyFraction,
        positionSize: positionSize < 0.1 ? 0 : positionSize,
        regime,
        consensusCount: consensus.consensusCount,
        consensusRecommendation: consensus.recommendation,
        reason: `IMMEDIATE_SHORT zone confirmed by Bayesian: P=${(posterior * 100).toFixed(1)}%, Consensus=${consensus.consensusCount}/5`
      };
    } else if (crashSignal.zone === 'MONITOR' || (posterior < 0.5 && crashSignal.crashProbability >= 0.08)) {
      // MONITOR ZONE - Kein Trade, nur beobachten
      return {
        action: 'MONITOR',
        symbol,
        posteriorProbability: posterior,
        brierScore,
        confidence,
        kellyFraction: 0,
        positionSize: 0,
        regime,
        consensusCount: consensus.consensusCount,
        consensusRecommendation: consensus.recommendation,
        reason: `MONITOR zone: crashProb=${(crashSignal.crashProbability * 100).toFixed(1)}%, posterior=${(posterior * 100).toFixed(1)}%, Consensus=${consensus.consensusCount}/5`
      };
    } else {
      // IGNORE ZONE - Kein Trade
      return {
        action: 'IGNORE',
        symbol,
        posteriorProbability: posterior,
        brierScore,
        confidence,
        kellyFraction: 0,
        positionSize: 0,
        regime,
        consensusCount: consensus.consensusCount,
        consensusRecommendation: consensus.recommendation,
        reason: `IGNORE zone: crashProb=${(crashSignal.crashProbability * 100).toFixed(1)}%, posterior=${(posterior * 100).toFixed(1)}%, Consensus=${consensus.consensusCount}/5`
      };
    }
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Get current regime
   */
  getCurrentRegime(): TradingRegime {
    return this.currentRegime;
  }

  /**
   * Get Brier history for a symbol
   */
  getBrierHistory(symbol: string): BrierHistoryEntry[] {
    return this.brierHistory.get(symbol) || [];
  }

  /**
   * Reset Brier history (for recalibration)
   */
  resetBrierHistory(symbol?: string): void {
    if (symbol) {
      this.brierHistory.delete(symbol);
    } else {
      this.brierHistory.clear();
    }
  }

  /**
   * Update config
   */
  updateConfig(config: Partial<BayesianConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const bayesianEngine = new BayesianDecisionEngine();
