/**
 * Paper Trading Module - Vollständiges State Management
 * Keine echten Transaktionen - nur Simulation
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface Position {
  id: string;
  token: string;
  mint: string;
  type: 'LONG' | 'SHORT';
  amount: number; // In SOL
  entryPrice: number; // USD per token
  entrySlot: number;
  entryTime: number;
  leverage: number;
  liquidationPrice?: number;
  signalSource: string;
  signalProbability: number;
  status: 'OPEN' | 'CLOSED' | 'LIQUIDATED';
  exitPrice?: number;
  exitTime?: number;
  exitReason?: 'TAKE_PROFIT' | 'STOP_LOSS' | 'MANUAL' | 'LIQUIDATION' | 'TIMEOUT';
  pnlSol?: number;
  pnlPercent?: number;
  fees: number;
}

export interface Trade {
  id: string;
  positionId: string;
  type: 'ENTRY' | 'EXIT';
  token: string;
  mint: string;
  amount: number;
  price: number;
  fee: number;
  timestamp: number;
  slot: number;
  leverage: number;
}

export interface Order {
  id: string;
  token: string;
  type: 'MARKET' | 'LIMIT';
  side: 'BUY' | 'SELL';
  amount: number;
  price?: number;
  triggerPrice?: number;
  status: 'PENDING' | 'FILLED' | 'CANCELLED' | 'EXPIRED';
  createdAt: number;
  expiresAt?: number;
  filledAt?: number;
  filledPrice?: number;
  filledAmount?: number;
}

export interface PaperTradingState {
  balance: number;
  lockedMargin: number;
  availableBalance: number;
  totalPnl: number;
  totalPnlPercent: number;
  positions: Position[];
  openPositions: Position[];
  closedPositions: Position[];
  trades: Trade[];
  orders: Order[];
  metrics: TradingMetrics;
  settings: TradingSettings;
}

export interface TradingMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  avgTradeDuration: number;
  avgConfidence: number;
  totalFees: number;
  totalVolume: number;
  largestWin: number;
  largestLoss: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  currentStreak: number;
  bestTrade: number;
  worstTrade: number;
  exposure: number;
  leverageUsed: number;
}

export interface TradingSettings {
  maxPositions: number;
  maxPositionSize: number; // % of balance
  maxTotalExposure: number; // % of balance
  maxLeverage: number;
  defaultLeverage: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  trailingStopPercent: number;
  maxDrawdownThreshold: number; // % - stop trading if reached
  maxDailyLoss: number; // SOL - stop trading if reached
  tradingHours: {
    start: number; // UTC hour
    end: number;
  };
  allowedTokens: string[];
  autoCloseTimeout: number; // ms - auto close positions after timeout
}

export interface CrashSignal {
  token: string;
  mint: string;
  probability: number;
  confirmingMetrics: number;
  zone: 'IGNORE' | 'MONITOR' | 'IMMEDIATE_SHORT';
  timestamp: number;
  slot: number;
  rawMetrics: Record<string, number>;
  zScores: Record<string, number>;
}

export interface PriceUpdate {
  token: string;
  mint: string;
  price: number;
  change24h: number;
  volume24h: number;
  timestamp: number;
}

export interface PaperTradingEvents {
  'position.opened': (position: Position) => void;
  'position.closed': (position: Position, reason: string) => void;
  'position.updated': (position: Position) => void;
  'order.created': (order: Order) => void;
  'order.filled': (order: Order, trade: Trade) => void;
  'order.cancelled': (order: Order) => void;
  'trade.executed': (trade: Trade) => void;
  'liquidation.warning': (position: Position, liquidationPrice: number) => void;
  'drawdown.warning': (drawdown: number, threshold: number) => void;
  'balance.updated': (balance: number, change: number) => void;
  'state.updated': (state: PaperTradingState) => void;
  'error': (error: Error) => void;
}

// ============================================================================
// DEFAULT SETTINGS
// ============================================================================

const DEFAULT_SETTINGS: TradingSettings = {
  maxPositions: 4,
  maxPositionSize: 0.20, // 20% of balance
  maxTotalExposure: 0.50, // 50% of balance
  maxLeverage: 20,
  defaultLeverage: 10,
  stopLossPercent: 0.05, // 5%
  takeProfitPercent: 0.10, // 10%
  trailingStopPercent: 0.02, // 2%
  maxDrawdownThreshold: 0.30, // 30%
  maxDailyLoss: 5, // SOL
  tradingHours: {
    start: 0, // 00:00 UTC
    end: 24, // 24:00 UTC (always on)
  },
  allowedTokens: [
    'SOL',
    'BTC',
    'ETH',
    'JUP',
    'JTO',
    'WIF',
    'BONK',
    'POPCAT',
    'MOTHER',
    'FWOG',
  ],
  autoCloseTimeout: 30 * 60 * 1000, // 30 minutes
};

// ============================================================================
// TRADING ENGINE
// ============================================================================

type EventCallback = (...args: any[]) => void;

export class PaperTradingEngine {
  private state: PaperTradingState;
  private settings: TradingSettings;
  private priceCache: Map<string, PriceUpdate> = new Map();
  private dailyLossDate: string = new Date().toISOString().split('T')[0];
  private dailyLoss: number = 0;
  private lastTradeDate: string = '';
  private consecutiveWins: number = 0;
  private consecutiveLosses: number = 0;
  private equityCurve: number[] = [];
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private positionTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(initialBalance: number = 100, settings: Partial<TradingSettings> = {}) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.state = this.createInitialState(initialBalance);
  }

  private createInitialState(balance: number): PaperTradingState {
    return {
      balance,
      lockedMargin: 0,
      availableBalance: balance,
      totalPnl: 0,
      totalPnlPercent: 0,
      positions: [],
      openPositions: [],
      closedPositions: [],
      trades: [],
      orders: [],
      metrics: this.createInitialMetrics(),
      settings: this.settings,
    };
  }

  private createInitialMetrics(): TradingMetrics {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      calmarRatio: 0,
      avgTradeDuration: 0,
      avgConfidence: 0,
      totalFees: 0,
      totalVolume: 0,
      largestWin: 0,
      largestLoss: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      currentStreak: 0,
      bestTrade: 0,
      worstTrade: 0,
      exposure: 0,
      leverageUsed: 0,
    };
  }

  // ============================================================================
  // EVENT EMITTER
  // ============================================================================

  on<K extends keyof PaperTradingEvents>(
    event: K,
    callback: PaperTradingEvents[K]
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as EventCallback);
  }

  off<K extends keyof PaperTradingEvents>(
    event: K,
    callback: PaperTradingEvents[K]
  ): void {
    this.listeners.get(event)?.delete(callback as EventCallback);
  }

  private emit<K extends keyof PaperTradingEvents>(
    event: K,
    ...args: Parameters<PaperTradingEvents[K]>
  ): void {
    this.listeners.get(event)?.forEach(callback => {
      try {
        (callback as (...args: any[]) => void)(...args);
      } catch (e) {
        console.error(`[PaperTrading] Event handler error for ${event}:`, e);
      }
    });
  }

  // ============================================================================
  // PRICE MANAGEMENT
  // ============================================================================

  updatePrice(update: PriceUpdate): void {
    this.priceCache.set(update.token, update);
    this.priceCache.set(update.mint, update);

    // Update open positions with new price
    for (const position of this.state.openPositions) {
      this.evaluatePosition(position);
    }
  }

  getPrice(token: string): number {
    return this.priceCache.get(token)?.price || 0;
  }

  getPrices(): Map<string, PriceUpdate> {
    return new Map(this.priceCache);
  }

  // ============================================================================
  // POSITION MANAGEMENT
  // ============================================================================

  async openPosition(signal: CrashSignal): Promise<Position | null> {
    const { token, mint, probability, confirmingMetrics, zone, rawMetrics } = signal;

    // Validate settings
    if (!this.settings.allowedTokens.includes(token)) {
      this.emit('error', new Error(`Token ${token} not allowed`));
      return null;
    }

    if (this.state.openPositions.length >= this.settings.maxPositions) {
      this.emit('error', new Error('Max positions reached'));
      return null;
    }

    const price = this.getPrice(token);
    if (price === 0) {
      this.emit('error', new Error(`No price for ${token}`));
      return null;
    }

    // Position sizing based on Kelly Criterion (quarter-Kelly)
    const kelly = 0.14; // 14%
    const confidenceMultiplier = Math.min(confirmingMetrics / 9, 1);
    const size = this.state.balance * kelly * confidenceMultiplier;

    if (size < 0.1) {
      this.emit('error', new Error('Position too small'));
      return null;
    }

    if (size > this.state.balance * this.settings.maxPositionSize) {
      // Cap at max position size
      size = this.state.balance * this.settings.maxPositionSize;
    }

    // Calculate margin required
    const leverage = this.settings.defaultLeverage;
    const marginRequired = size / leverage;

    if (marginRequired > this.state.availableBalance) {
      this.emit('error', new Error('Insufficient balance'));
      return null;
    }

    // Calculate liquidation price (for short positions)
    const liquidationPrice = price * (1 - (1 / leverage) * 0.9); // 90% of margin

    const position: Position = {
      id: uuidv4(),
      token,
      mint,
      type: 'SHORT',
      amount: size,
      entryPrice: price,
      entrySlot: signal.slot,
      entryTime: Date.now(),
      leverage,
      liquidationPrice,
      signalSource: 'crash_detection',
      signalProbability: probability,
      status: 'OPEN',
      fees: size * 0.001, // 0.1% fee
    };

    // Lock margin
    this.state.balance -= marginRequired;
    this.state.lockedMargin += marginRequired;
    this.state.availableBalance = this.state.balance - this.state.lockedMargin;

    // Add position
    this.state.positions.push(position);
    this.state.openPositions.push(position);

    // Set auto-close timer
    if (this.settings.autoCloseTimeout > 0) {
      const timer = setTimeout(() => {
        this.closePosition(position.id, 'TIMEOUT').catch(console.error);
      }, this.settings.autoCloseTimeout);
      this.positionTimers.set(position.id, timer);
    }

    // Create entry trade
    const trade: Trade = {
      id: uuidv4(),
      positionId: position.id,
      type: 'ENTRY',
      token,
      mint,
      amount: size,
      price,
      fee: position.fees,
      timestamp: Date.now(),
      slot: signal.slot,
      leverage,
    };
    this.state.trades.push(trade);

    this.emit('position.opened', position);
    this.emit('trade.executed', trade);
    this.updateState();

    return position;
  }

  async closePosition(
    positionId: string,
    reason: Position['exitReason']
  ): Promise<Position | null> {
    const position = this.state.positions.find(p => p.id === positionId);
    if (!position || position.status !== 'OPEN') {
      return null;
    }

    const currentPrice = this.getPrice(position.token);
    const priceChange = (position.entryPrice - currentPrice) / position.entryPrice;
    const multiplier = position.type === 'SHORT' ? -1 : 1;
    const pnlPercent = priceChange * multiplier * position.leverage;

    const pnlSol = position.amount * pnlPercent;
    const exitPrice = currentPrice;

    // Update position
    position.status = 'CLOSED';
    position.exitPrice = exitPrice;
    position.exitTime = Date.now();
    position.exitReason = reason;
    position.pnlSol = pnlSol;
    position.pnlPercent = pnlPercent * 100;

    // Calculate margin to release
    const marginRequired = position.amount / position.leverage;
    const marginReleased = marginRequired + (pnlSol);

    // Update balance
    this.state.balance += Math.max(0, marginReleased);
    this.state.lockedMargin -= marginRequired;
    this.state.availableBalance = this.state.balance - this.state.lockedMargin;

    // Track daily loss
    if (pnlSol < 0) {
      this.dailyLoss += Math.abs(pnlSol);
    }

    // Update metrics
    this.updateTradeMetrics(position, pnlSol);

    // Move from open to closed
    this.state.openPositions = this.state.openPositions.filter(p => p.id !== positionId);
    this.state.closedPositions.push(position);

    // Create exit trade
    const trade: Trade = {
      id: uuidv4(),
      positionId: position.id,
      type: 'EXIT',
      token: position.token,
      mint: position.mint,
      amount: position.amount,
      price: exitPrice,
      fee: position.amount * 0.001,
      timestamp: Date.now(),
      slot: 0,
      leverage: position.leverage,
    };
    this.state.trades.push(trade);

    // Clear position timer
    const timer = this.positionTimers.get(positionId);
    if (timer) {
      clearTimeout(timer);
      this.positionTimers.delete(positionId);
    }

    this.emit('position.closed', position, reason);
    this.emit('trade.executed', trade);
    this.updateState();

    return position;
  }

  private evaluatePosition(position: Position): void {
    if (position.status !== 'OPEN') return;

    const currentPrice = this.getPrice(position.token);
    if (currentPrice === 0) return;

    const priceChange = (position.entryPrice - currentPrice) / position.entryPrice;
    const multiplier = position.type === 'SHORT' ? -1 : 1;
    const unrealizedPnl = position.amount * priceChange * multiplier;

    // Check liquidation
    if (position.liquidationPrice && currentPrice >= position.liquidationPrice) {
      this.closePosition(position.id, 'LIQUIDATION').catch(console.error);
      this.emit('liquidation.warning', position, position.liquidationPrice);
      return;
    }

    // Check take profit
    const takeProfitPrice = position.entryPrice * (1 - this.settings.takeProfitPercent * multiplier / position.leverage);
    if ((position.type === 'SHORT' && currentPrice <= takeProfitPrice) ||
        (position.type === 'LONG' && currentPrice >= takeProfitPrice)) {
      this.closePosition(position.id, 'TAKE_PROFIT').catch(console.error);
      return;
    }

    // Check stop loss
    const stopLossPrice = position.entryPrice * (1 + this.settings.stopLossPercent * multiplier / position.leverage);
    if ((position.type === 'SHORT' && currentPrice >= stopLossPrice) ||
        (position.type === 'LONG' && currentPrice <= stopLossPrice)) {
      this.closePosition(position.id, 'STOP_LOSS').catch(console.error);
      return;
    }
  }

  // ============================================================================
  // METRICS CALCULATION
  // ============================================================================

  private updateTradeMetrics(position: Position, pnlSol: number): void {
    const exitTrades = this.state.trades.filter(
      t => t.type === 'EXIT' && t.positionId === position.id
    );

    const m = this.state.metrics;

    m.totalTrades++;
    m.totalVolume += position.amount * 2; // Entry + Exit
    m.totalFees += position.fees + (exitTrades[0]?.fee || 0);

    if (pnlSol > 0) {
      m.winningTrades++;
      m.avgWin = (m.avgWin * (m.winningTrades - 1) + pnlSol) / m.winningTrades;
      m.largestWin = Math.max(m.largestWin, pnlSol);
      this.consecutiveWins++;
      this.consecutiveLosses = 0;
    } else {
      m.losingTrades++;
      m.avgLoss = (m.avgLoss * (m.losingTrades - 1) + pnlSol) / m.losingTrades;
      m.largestLoss = Math.min(m.largestLoss, pnlSol);
      this.consecutiveLosses++;
      this.consecutiveWins = 0;
    }

    m.currentStreak = pnlSol > 0 ? this.consecutiveWins : -this.consecutiveLosses;
    m.consecutiveWins = this.consecutiveWins;
    m.consecutiveLosses = this.consecutiveLosses;

    // Win rate
    m.winRate = m.totalTrades > 0 ? (m.winningTrades / m.totalTrades) * 100 : 0;

    // Profit factor
    const totalWins = m.avgWin * m.winningTrades;
    const totalLosses = Math.abs(m.avgLoss * m.losingTrades);
    m.profitFactor = totalLosses > 0 ? totalWins / totalLosses : 0;

    // Best/worst trade
    m.bestTrade = Math.max(m.bestTrade, position.pnlSol || 0);
    m.worstTrade = Math.min(m.worstTrade, position.pnlSol || 0);

    // Exposure
    m.exposure = this.state.openPositions.reduce((sum, p) => sum + p.amount, 0);
    m.leverageUsed = this.state.openPositions.reduce(
      (sum, p) => sum + p.amount / p.leverage, 0
    );

    // Update equity curve
    this.equityCurve.push(this.state.balance);

    // Calculate drawdown
    this.calculateDrawdown();

    // Calculate Sharpe Ratio
    this.calculateSharpeRatio();

    // Total PnL
    this.state.totalPnl = this.state.trades
      .filter(t => t.type === 'EXIT')
      .reduce((sum, t) => {
        const pos = this.state.positions.find(p => p.id === t.positionId);
        return sum + (pos?.pnlSol || 0);
      }, 0);

    this.state.totalPnlPercent = (this.state.totalPnl / 100) * 100;
  }

  private calculateDrawdown(): void {
    const peak = Math.max(...this.equityCurve);
    const current = this.state.balance;
    const drawdown = peak - current;
    const drawdownPercent = peak > 0 ? drawdown / peak : 0;

    this.state.metrics.maxDrawdown = Math.max(this.state.metrics.maxDrawdown, drawdown);
    this.state.metrics.maxDrawdownPercent = Math.max(
      this.state.metrics.maxDrawdownPercent,
      drawdownPercent * 100
    );

    // Emit warning if threshold breached
    if (drawdownPercent > this.settings.maxDrawdownThreshold) {
      this.emit('drawdown.warning', drawdownPercent * 100, this.settings.maxDrawdownThreshold * 100);
    }
  }

  private calculateSharpeRatio(): void {
    if (this.equityCurve.length < 2) return;

    const returns: number[] = [];
    for (let i = 1; i < this.equityCurve.length; i++) {
      returns.push((this.equityCurve[i] - this.equityCurve[i - 1]) / this.equityCurve[i - 1]);
    }

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // Annualized Sharpe Ratio (assuming 252 trading days, data points every minute)
    const annualizationFactor = Math.sqrt(252 * 1440); // minutes per day
    this.state.metrics.sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * annualizationFactor : 0;
  }

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  private updateState(): void {
    // Reset daily loss if new day
    const today = new Date().toISOString().split('T')[0];
    if (today !== this.dailyLossDate) {
      this.dailyLossDate = today;
      this.dailyLoss = 0;
    }

    // Check daily loss limit
    if (this.dailyLoss > this.settings.maxDailyLoss) {
      // Close all positions
      for (const position of [...this.state.openPositions]) {
        this.closePosition(position.id, 'MANUAL').catch(console.error);
      }
      this.emit('error', new Error('Daily loss limit reached'));
    }

    this.emit('state.updated', this.getState());
  }

  getState(): Readonly<PaperTradingState> {
    return { ...this.state };
  }

  getPosition(id: string): Position | undefined {
    return this.state.positions.find(p => p.id === id);
  }

  getOpenPositions(): Position[] {
    return [...this.state.openPositions];
  }

  getClosedPositions(): Position[] {
    return [...this.state.closedPositions];
  }

  getMetrics(): TradingMetrics {
    return { ...this.state.metrics };
  }

  getBalance(): { balance: number; available: number; locked: number } {
    return {
      balance: this.state.balance,
      available: this.state.availableBalance,
      locked: this.state.lockedMargin,
    };
  }

  // ============================================================================
  // SETTINGS
  // ============================================================================

  updateSettings(updates: Partial<TradingSettings>): void {
    this.settings = { ...this.settings, ...updates };
    this.state.settings = this.settings;
    this.updateState();
  }

  getSettings(): TradingSettings {
    return { ...this.settings };
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  serialize(): string {
    return JSON.stringify({
      state: this.state,
      dailyLossDate: this.dailyLossDate,
      dailyLoss: this.dailyLoss,
      equityCurve: this.equityCurve,
    });
  }

  static deserialize(data: string, settings?: Partial<TradingSettings>): PaperTradingEngine {
    try {
      const parsed = JSON.parse(data);
      const engine = new PaperTradingEngine(100, settings);
      engine.state = parsed.state;
      engine.dailyLossDate = parsed.dailyLossDate;
      engine.dailyLoss = parsed.dailyLoss;
      engine.equityCurve = parsed.equityCurve || [];
      return engine;
    } catch {
      return new PaperTradingEngine(100, settings);
    }
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  destroy(): void {
    // Clear all timers
    for (const timer of this.positionTimers.values()) {
      clearTimeout(timer);
    }
    this.positionTimers.clear();

    // Clear listeners
    this.listeners.clear();
  }
}

// ============================================================================
// HOOK FOR REACT
// ============================================================================

export function createPaperTradingHook(engine: PaperTradingEngine) {
  return {
    engine,

    state: engine.getState(),

    openPosition: (signal: CrashSignal) => engine.openPosition(signal),

    closePosition: (positionId: string, reason: Position['exitReason']) =>
      engine.closePosition(positionId, reason),

    updatePrice: (update: PriceUpdate) => engine.updatePrice(update),

    getPosition: (id: string) => engine.getPosition(id),

    getOpenPositions: () => engine.getOpenPositions(),

    getMetrics: () => engine.getMetrics(),

    getBalance: () => engine.getBalance(),

    getSettings: () => engine.getSettings(),

    updateSettings: (updates: Partial<TradingSettings>) =>
      engine.updateSettings(updates),

    serialize: () => engine.serialize(),

    destroy: () => engine.destroy(),
  };
}

export default PaperTradingEngine;
