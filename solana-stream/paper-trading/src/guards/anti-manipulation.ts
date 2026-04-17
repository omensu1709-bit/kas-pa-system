/**
 * Anti-Manipulation Guards
 * Verhindert Manipulation des Trading-Systems
 */
export class AntiManipulationGuards {
  // Sicherheits-Limits
  private maxPositionSizePercent = 10; // Max 10% des Kapitals pro Trade
  private minHoldingSlots = 5; // Min 5 Slots Haltezeit
  private maxDailyTrades = 20;
  private cooldownBetweenTradesSeconds = 2;

  // Statistiken
  private todayTradeCount = 0;
  private lastTradeTimestamp = 0;
  private recentDirections: string[] = [];
  private recentLossCount = 0;
  private averageTradeSize = 0;

  constructor(config?: GuardConfig) {
    if (config) {
      this.maxPositionSizePercent = config.maxPositionSizePercent ?? 10;
      this.minHoldingSlots = config.minHoldingSlots ?? 5;
      this.maxDailyTrades = config.maxDailyTrades ?? 20;
      this.cooldownBetweenTradesSeconds = config.cooldownBetweenTrades ?? 2;
    }

    // Reset täglicher Zähler um Mitternacht
    this.scheduleDailyReset();
  }

  /**
   * Validiert einen Trade gegen alle Guards
   */
  validateTrade(trade: TradeRequest, state: SystemState): ValidationResult {
    const errors: ValidationError[] = [];

    // 1. Position Size Check
    const positionValue = trade.amount * trade.price;
    const portfolioPercent = (positionValue / state.totalValue) * 100;

    if (portfolioPercent > this.maxPositionSizePercent) {
      errors.push({
        guard: 'MAX_POSITION_SIZE',
        message: `Position zu groß: ${portfolioPercent.toFixed(2)}% des Kapitals`,
        limit: this.maxPositionSizePercent,
        actual: portfolioPercent
      });
    }

    // 2. Rate Limit Check
    const timeSinceLastTrade = (Date.now() - this.lastTradeTimestamp) / 1000;
    if (timeSinceLastTrade < this.cooldownBetweenTradesSeconds) {
      errors.push({
        guard: 'RATE_LIMIT',
        message: `Zu schnell hintereinander: ${this.cooldownBetweenTradesSeconds}s Cooldown nötig`,
        cooldown: this.cooldownBetweenTradesSeconds,
        actual: timeSinceLastTrade
      });
    }

    // 3. Daily Limit Check
    if (this.todayTradeCount >= this.maxDailyTrades) {
      errors.push({
        guard: 'DAILY_LIMIT',
        message: `Tägliches Trade-Limit erreicht: ${this.maxDailyTrades}`,
        limit: this.maxDailyTrades
      });
    }

    // 4. Suspicious Pattern Detection
    const suspiciousPattern = this.detectSuspiciousPattern(trade, state);
    if (suspiciousPattern) {
      errors.push({
        guard: 'SUSPICIOUS_PATTERN',
        message: suspiciousPattern.reason,
        pattern: suspiciousPattern.type
      });
    }

    // 5. Whales Recently Traded Same Direction
    if (this.recentDirections.length > 0) {
      const lastDirection = this.recentDirections[this.recentDirections.length - 1];
      if (lastDirection === trade.direction && this.recentDirections.length >= 3) {
        const sameDirectionCount = this.recentDirections.filter(d => d === trade.direction).length;
        if (sameDirectionCount >= 3) {
          errors.push({
            guard: 'DIRECTION_REPETITION',
            message: `Zu viele Trades in gleiche Richtung: ${sameDirectionCount} ${trade.direction} Trades`,
            count: sameDirectionCount
          });
        }
      }
    }

    const approved = errors.length === 0;

    if (approved) {
      this.recordTrade(trade, state);
    }

    return {
      approved,
      errors,
      reason: approved ? undefined : errors[0].message,
      details: errors
    };
  }

  /**
   * Erkennt verdächtige Muster
   */
  private detectSuspiciousPattern(trade: TradeRequest, state: SystemState): SuspiciousPattern | null {
    // 1. Ungewöhnlich große Position nach Verlust-Serie
    if (this.recentLossCount > 3) {
      const avgSize = this.averageTradeSize || trade.amount;
      if (trade.amount > avgSize * 3) {
        return {
          type: 'CHASE_AFTER_LOSS',
          reason: `Große Position nach ${this.recentLossCount} Verlusten: mögliche Recovery-Manipulation`
        };
      }
    }

    // 2. Wash Trading Pattern (schnelle Richtungswechsel)
    if (this.recentDirections.length >= 2) {
      const lastDirection = this.recentDirections[this.recentDirections.length - 1];
      const secondLastDirection = this.recentDirections[this.recentDirections.length - 2];

      if (lastDirection !== trade.direction && trade.direction !== secondLastDirection) {
        if (state.timeSinceLastTrade < 60) { // < 1 Minute
          return {
            type: 'WASH_TRADING',
            reason: 'Schnelle Richtungswechsel: mögliches Wash-Trading-Muster'
          };
        }
      }
    }

    // 3. Pre-Announcement Positioning
    // (Wenn System plötzlich viele gleiche Trades vor Event macht)
    if (this.recentDirections.length >= 5) {
      const last5 = this.recentDirections.slice(-5);
      const allSame = last5.every(d => d === last5[0]);
      if (allSame && trade.direction === last5[0]) {
        return {
          type: 'EXCESSIVE_MOMENTUM',
          reason: 'Exzessiver Momentum-Trading: mögliche Manipulation'
        };
      }
    }

    // 4. Micro-Trading (viele tiny Trades)
    if (trade.amount * trade.price < 0.1) { // < 0.1 SOL
      if (this.todayTradeCount > 10) {
        return {
          type: 'MICRO_SCALPING',
          reason: 'Zu viele Micro-Trades: mögliche fake volume Manipulation'
        };
      }
    }

    return null;
  }

  /**
   * Zeichnet einen Trade auf für Statistik
   */
  private recordTrade(trade: TradeRequest, state: SystemState): void {
    this.todayTradeCount++;
    this.lastTradeTimestamp = Date.now();
    this.recentDirections.push(trade.direction);

    // Behalte nur die letzten 10 Richtungen
    if (this.recentDirections.length > 10) {
      this.recentDirections.shift();
    }

    // Update average trade size
    const totalTrades = this.todayTradeCount;
    this.averageTradeSize = (this.averageTradeSize * (totalTrades - 1) + trade.amount) / totalTrades;
  }

  /**
   * Setzt täglichen Zähler zurück (wird automatisch aufgerufen)
   */
  private scheduleDailyReset(): void {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    setTimeout(() => {
      this.todayTradeCount = 0;
      this.recentLossCount = 0;
      this.scheduleDailyReset(); // Reschedule für morgen
    }, msUntilMidnight);
  }

  /**
   * Manually reset (z.B. nach Review)
   */
  reset(): void {
    this.todayTradeCount = 0;
    this.recentLossCount = 0;
    this.recentDirections = [];
  }

  /**
   * Markiert einen Verlust für Statistik
   */
  recordLoss(): void {
    this.recentLossCount++;
  }

  /**
   * Markiert einen Gewinn für Statistik
   */
  recordWin(): void {
    if (this.recentLossCount > 0) {
      this.recentLossCount--;
    }
  }

  /**
   * Gibt aktuelle Guard-Statistiken zurück
   */
  getStats(): GuardStats {
    return {
      todayTradeCount: this.todayTradeCount,
      maxDailyTrades: this.maxDailyTrades,
      recentLossCount: this.recentLossCount,
      recentDirections: [...this.recentDirections],
      averageTradeSize: this.averageTradeSize
    };
  }
}

// Type Definitions
export interface TradeRequest {
  tokenMint: string;
  amount: number;
  price: number;
  direction: 'LONG' | 'SHORT';
  signalSource: string;
}

export interface SystemState {
  totalValue: number;
  openPositionsCount: number;
  totalPnl: number;
  lastTradeTime: number;
  timeSinceLastTrade: number;
  recentTrades: any[];
}

export interface ValidationResult {
  approved: boolean;
  errors: ValidationError[];
  reason?: string;
  details?: ValidationError[];
}

export interface ValidationError {
  guard: string;
  message: string;
  limit?: number;
  actual?: number;
  cooldown?: number;
  pattern?: string;
  count?: number;
}

export interface SuspiciousPattern {
  type: string;
  reason: string;
}

export interface GuardConfig {
  maxPositionSizePercent?: number;
  minHoldingSlots?: number;
  maxDailyTrades?: number;
  cooldownBetweenTrades?: number;
}

export interface GuardStats {
  todayTradeCount: number;
  maxDailyTrades: number;
  recentLossCount: number;
  recentDirections: string[];
  averageTradeSize: number;
}
