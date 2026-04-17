/**
 * Crash Signal Adapter
 * 
 * Verbindet das Crash Detection System mit dem Paper Trading Engine.
 * Übersetzt Crash Probability Signale in handelbare Positionen.
 * 
 * Implementiert:
 * - Drei-Zonen Logik (IGNORE/MONITOR/IMMEDIATE_SHORT)
 * - Kelly Position Sizing
 * - Drawdown Circuit Breaker
 * - Take-Profit Ladder
 */

import { PaperTradingEngine } from './engine/paper-trading-engine.js';
import type {
  EngineConfig,
  Position,
  OpenPositionResult,
  ClosePositionResult,
  PerformanceStats
} from './engine/paper-trading-engine.js';
import { SYSTEM_CONFIG } from './config.js';

export interface CrashSignal {
  token: string;
  crashProbability: number;
  confirmingMetrics: number;
  zScores: Record<string, number>;
  slot: number;
  timestamp: number;
  zone: SignalZone;
}

export enum SignalZone {
  IGNORE = 'IGNORE',           // P < 0.10
  MONITOR = 'MONITOR',         // 0.10 <= P < 0.20
  IMMEDIATE_SHORT = 'IMMEDIATE_SHORT'  // P >= 0.20
}

export interface CrashTradingConfig {
  // Thresholds
  ignoreThreshold: number;     // From config.ts
  monitorThreshold: number;     // From config.ts
  
  // Position Sizing (Kelly)
  kellyFraction: number;       // Full Kelly (e.g., 0.55)
  kellyMode: 'full' | 'half' | 'quarter';  // Default: quarter
  
  // Risk Limits
  maxPositionPercent: number;  // Max 25% per position
  maxTotalExposure: number;   // Max 50% total
  maxPositions: number;        // Max 4 simultaneous
  
  // Drawdown Circuit Breakers
  drawdown10Percent: number;   // -10% → reduce 50%
  drawdown20Percent: number;   // -20% → halt 24h
  drawdown30Percent: number;   // -30% → full audit
  
  // Exit Rules
  stopLossPercent: number;     // From config.ts
  takeProfitLevels: TakeProfitLevel[];
  maxHoldingHours: number;     // From config.ts
  
  // Leverage
  leverage: number;            // 10x for SPL tokens
  
  // Minimum confirming metrics for IMMEDIATE_SHORT
  minConfirmingMetrics: number; // Default: 3
}

export interface TakeProfitLevel {
  percentDrop: number;   // e.g., 0.03 for 3%
  exitPercent: number;   // e.g., 0.40 for 40% of position
}

export interface CrashTradingState {
  isHalted: boolean;
  haltUntil?: number;
  sizingMultiplier: number;
  currentDrawdown: number;
  activeSignals: Map<string, CrashSignal>;
}

export const DEFAULT_CRASH_TRADING_CONFIG: CrashTradingConfig = {
  ignoreThreshold: SYSTEM_CONFIG.ignoreThreshold,
  monitorThreshold: SYSTEM_CONFIG.monitorThreshold,
  kellyFraction: SYSTEM_CONFIG.kellyFraction,
  kellyMode: SYSTEM_CONFIG.kellyMode as 'full' | 'half' | 'quarter',
  maxPositionPercent: SYSTEM_CONFIG.maxPositionPercent,
  maxTotalExposure: 50,
  maxPositions: SYSTEM_CONFIG.maxPositions,
  drawdown10Percent: 0.10,
  drawdown20Percent: 0.20,
  drawdown30Percent: 0.30,
  stopLossPercent: SYSTEM_CONFIG.stopLossPercent,
  takeProfitLevels: [
    { percentDrop: 0.03, exitPercent: 0.40 },  // 3% crash → exit 40%
    { percentDrop: 0.05, exitPercent: 0.30 },  // 5% crash → exit 30%
    { percentDrop: 0.08, exitPercent: 0.20 },  // 8% crash → exit 20%
    // 10% runner with trailing stop
  ],
  maxHoldingHours: SYSTEM_CONFIG.maxHoldingHours,
  leverage: 10,
  minConfirmingMetrics: 3,
};

export class CrashSignalAdapter {
  private engine: PaperTradingEngine;
  private config: CrashTradingConfig;
  private state: CrashTradingState;
  private startingCapital: number;
  private operatorPubkey: string;

  constructor(
    engine: PaperTradingEngine,
    config: Partial<CrashTradingConfig> = {},
    operatorPubkey: string = 'system'
  ) {
    this.engine = engine;
    this.config = { ...DEFAULT_CRASH_TRADING_CONFIG, ...config };
    this.operatorPubkey = operatorPubkey;
    this.startingCapital = 100; // Default 100 SOL
    this.state = {
      isHalted: false,
      sizingMultiplier: 1.0,
      currentDrawdown: 0,
      activeSignals: new Map(),
    };
  }

  /**
   * Bestimmt die Signal-Zone basierend auf Crash Probability
   */
  getZone(crashProbability: number): SignalZone {
    if (crashProbability < this.config.ignoreThreshold) {
      return SignalZone.IGNORE;
    } else if (crashProbability < this.config.monitorThreshold) {
      return SignalZone.MONITOR;
    } else {
      return SignalZone.IMMEDIATE_SHORT;
    }
  }

  /**
   * Berechnet Kelly Position Size
   */
  calculateKellySize(currentCapital: number): number {
    const { kellyFraction, kellyMode } = this.config;
    
    let kelly = kellyFraction;
    if (kellyMode === 'half') kelly *= 0.5;
    if (kellyMode === 'quarter') kelly *= 0.25;
    
    // Apply sizing multiplier from drawdown circuit breakers
    kelly *= this.state.sizingMultiplier;
    
    // Cap at max position percent
    const maxSize = currentCapital * (this.config.maxPositionPercent / 100);
    const kellySize = currentCapital * kelly;
    
    return Math.min(kellySize, maxSize);
  }

  /**
   * Verarbeitet ein Crash Signal und führt ggf. Trades aus
   */
  async processSignal(signal: CrashSignal): Promise<SignalProcessingResult> {
    const result: SignalProcessingResult = {
      signal,
      zone: signal.zone,
      action: 'ignored',
      details: {},
    };

    // Check halt status
    if (this.state.isHalted) {
      if (signal.timestamp < (this.state.haltUntil || 0)) {
        result.action = 'halted';
        result.details.reason = 'System is halted';
        return result;
      } else {
        this.state.isHalted = false;
        this.state.haltUntil = undefined;
      }
    }

    // Update active signal
    this.state.activeSignals.set(signal.token, signal);

    const zone = this.getZone(signal.crashProbability);
    result.zone = zone;

    if (zone === SignalZone.IGNORE) {
      result.action = 'ignored';
      result.details.reason = 'Probability below threshold';
      return result;
    }

    if (zone === SignalZone.MONITOR) {
      result.action = 'monitoring';
      result.details.reason = 'In MONITOR zone - preparing only';
      return result;
    }

    // IMMEDIATE_SHORT zone
    if (zone === SignalZone.IMMEDIATE_SHORT) {
      // Check minimum confirming metrics
      if (signal.confirmingMetrics < this.config.minConfirmingMetrics) {
        result.action = 'rejected';
        result.details.reason = `Only ${signal.confirmingMetrics} confirming metrics, need ${this.config.minConfirmingMetrics}`;
        return result;
      }

      // Get current performance
      const performance = this.engine.getPerformance();
      const currentCapital = performance.currentCapital;

      // Check total exposure limit
      const openPositions = performance.openPositions;
      const totalExposure = openPositions.reduce(
        (sum, pos) => sum + (pos.amount * pos.entryPrice),
        0
      );
      
      if (totalExposure / currentCapital >= this.config.maxTotalExposure / 100) {
        result.action = 'rejected';
        result.details.reason = 'Max total exposure reached';
        return result;
      }

      // Check position count limit
      if (openPositions.length >= this.config.maxPositions) {
        result.action = 'rejected';
        result.details.reason = 'Max positions reached';
        return result;
      }

      // Check drawdown and adjust sizing
      this.checkDrawdown(performance);

      // Calculate position size
      const positionSize = this.calculateKellySize(currentCapital);

      // Scale by number of confirming metrics
      let sizeMultiplier = 0.5;
      if (signal.confirmingMetrics === 3) sizeMultiplier = 0.75;
      if (signal.confirmingMetrics === 4) sizeMultiplier = 1.0;
      if (signal.confirmingMetrics >= 5) sizeMultiplier = 1.25;

      const finalSize = positionSize * sizeMultiplier;

      if (finalSize < 0.1) {
        result.action = 'rejected';
        result.details.reason = 'Position size too small';
        return result;
      }

      // Open position
      try {
        const openResult = await this.engine.openPosition(
          signal.token,
          finalSize,
          `crash_detection:${signal.crashProbability.toFixed(4)}`
        );

        if (openResult.success && openResult.position) {
          result.action = 'position_opened';
          result.details = {
            positionId: openResult.position.id,
            size: finalSize,
            entryPrice: openResult.position.entryPrice,
            crashProbability: signal.crashProbability,
            confirmingMetrics: signal.confirmingMetrics,
          };
        } else {
          result.action = 'rejected';
          result.details.reason = openResult.error || 'Unknown error';
        }
      } catch (error) {
        result.action = 'error';
        result.details.reason = String(error);
      }
    }

    return result;
  }

  /**
   * Prüft Drawdown und löst Circuit Breaker aus
   */
  private checkDrawdown(performance: PerformanceStats): void {
    const drawdown = (this.startingCapital - performance.currentCapital) / this.startingCapital;
    this.state.currentDrawdown = drawdown;

    if (drawdown >= this.config.drawdown30Percent) {
      // Full halt - requires manual intervention
      this.state.isHalted = true;
      this.state.haltUntil = undefined; // Manual restart required
      this.state.sizingMultiplier = 0;
      console.error('[CrashSignalAdapter] DRAWDDOWN 30% TRIGGERED - FULL HALT');
    } else if (drawdown >= this.config.drawdown20Percent) {
      // 24h halt
      this.state.isHalted = true;
      this.state.haltUntil = Date.now() + 24 * 60 * 60 * 1000;
      this.state.sizingMultiplier = 0;
      console.warn('[CrashSignalAdapter] DRAWDDOWN 20% TRIGGERED - 24h HALT');
    } else if (drawdown >= this.config.drawdown10Percent) {
      // Reduce sizing by 50%
      this.state.sizingMultiplier = 0.5;
      console.warn('[CrashSignalAdapter] DRAWDDOWN 10% TRIGGERED - SIZING 50%');
    } else {
      this.state.sizingMultiplier = 1.0;
    }
  }

  /**
   * Prüft ob eine Position geschlossen werden sollte
   */
  async checkExitConditions(position: Position, currentPrice: number): Promise<ExitCheckResult> {
    const result: ExitCheckResult = {
      shouldExit: false,
      reason: undefined,
      exitPercent: 1.0,
    };

    const entryPrice = position.entryPrice;
    const priceChange = (entryPrice - currentPrice) / entryPrice; // Negative if price dropped
    const percentDrop = -priceChange; // Positive if in profit

    // Check stop loss
    if (percentDrop < -this.config.stopLossPercent) {
      result.shouldExit = true;
      result.reason = 'stop_loss';
      result.exitPercent = 1.0;
      return result;
    }

    // Check take profit levels
    for (const tp of this.config.takeProfitLevels) {
      if (percentDrop >= tp.percentDrop) {
        result.shouldExit = true;
        result.reason = 'take_profit';
        result.exitPercent = tp.exitPercent;
        // Don't return - we want to check all levels
      }
    }

    // Check max holding time
    const holdingHours = (Date.now() - position.entryTime) / (1000 * 60 * 60);
    if (holdingHours >= this.config.maxHoldingHours) {
      result.shouldExit = true;
      result.reason = 'time_limit';
      result.exitPercent = 1.0;
    }

    return result;
  }

  /**
   * Gibt aktuellen Trading State zurück
   */
  getState(): CrashTradingState {
    return { ...this.state };
  }

  /**
   * Setzt den Starting Capital
   */
  setStartingCapital(capital: number): void {
    this.startingCapital = capital;
  }
}

export interface SignalProcessingResult {
  signal: CrashSignal;
  zone: SignalZone;
  action: 'ignored' | 'monitoring' | 'position_opened' | 'rejected' | 'halted' | 'error';
  details: Record<string, any>;
}

export interface ExitCheckResult {
  shouldExit: boolean;
  reason?: 'stop_loss' | 'take_profit' | 'time_limit';
  exitPercent?: number;
}
