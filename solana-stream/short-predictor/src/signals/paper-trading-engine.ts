/**
 * Paper Trading Engine - Bot-Ready Position Management
 * 
 * Manages SHORT positions based on consensus predictions.
 * Tracks P&L, stop losses, take profits, and timeouts.
 * Can be converted to live trading by replacing simulated fills with real orders.
 */

import type { Prediction } from './consensus-engine.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TYPES
// ============================================================================

export interface Position {
  id: string;
  mint: string;
  symbol: string;
  entryPrice: number;
  entryTime: number;
  size: number;  // SOL
  
  // Prediction context
  prediction: Prediction;
  
  // Stop Loss & Take Profit (price levels)
  stopLoss: number;     // Price level to exit with loss
  takeProfit: number;   // Price level to exit with profit
  
  // Current tracking
  currentPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  
  // Exit tracking
  exitReason?: 'TP' | 'SL' | 'TIME' | 'MANUAL' | 'REVERSAL';
  exitPrice?: number;
  exitTime?: number;
  realizedPnL?: number;
}

export interface TradeStats {
  capital: number;
  openPositions: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgReturn: number;
  totalPnL: number;
  maxDrawdown: number;
  sharpeRatio: number;
}

export interface ShortTarget {
  symbol: string;
  mint: string;
  price: number;
  priceChange24h: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_POSITIONS = 10;
const MAX_POSITION_PERCENT = 0.15;  // 15% max per trade
const MIN_POSITION_SOL = 0.5;       // Min 0.5 SOL per trade
const INITIAL_CAPITAL = 100;        // SOL

// ============================================================================
// PAPER TRADING ENGINE
// ============================================================================

export class PaperTradingEngine {
  private positions: Map<string, Position> = new Map();
  private capital: number = INITIAL_CAPITAL;
  private tradeHistory: Position[] = [];
  private priceHistory: Map<string, number[]> = new Map();
  
  // Logs
  private logDir = '/data/trinity_apex/solana-stream/short-predictor/logs';
  private tradesLogPath: string;
  
  constructor() {
    // Ensure log directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    
    this.tradesLogPath = path.join(this.logDir, 'trades.jsonl');
  }
  
  // ============================================================================
  // POSITION MANAGEMENT
  // ============================================================================
  
  /**
   * Opens a new SHORT position based on prediction.
   */
  async openPosition(decision: Prediction, coin: ShortTarget): Promise<boolean> {
    // Validation
    if (decision.action !== 'SHORT') {
      return false;
    }
    
    if (this.positions.size >= MAX_POSITIONS) {
      console.log(`[PaperTrading] Max positions reached (${MAX_POSITIONS})`);
      return false;
    }
    
    // Calculate position size
    const maxSize = this.capital * MAX_POSITION_PERCENT;
    const positionSize = Math.min(decision.positionSize, maxSize);
    
    if (positionSize < MIN_POSITION_SOL) {
      console.log(`[PaperTrading] Position size ${positionSize.toFixed(2)} SOL below minimum`);
      return false;
    }
    
    if (positionSize > this.capital) {
      console.log(`[PaperTrading] Insufficient capital: ${this.capital.toFixed(2)} SOL`);
      return false;
    }
    
    // Calculate entry, stop loss, take profit
    const entryPrice = coin.price;
    const stopLoss = entryPrice * 1.04;   // +4% price increase = stop for SHORT
    const takeProfit = entryPrice * (1 - decision.expectedDrop);  // Expected drop
    
    // Create position
    const position: Position = {
      id: `short_${Date.now()}_${coin.symbol}`,
      mint: coin.mint,
      symbol: coin.symbol,
      entryPrice,
      entryTime: Date.now(),
      size: positionSize,
      prediction: decision,
      stopLoss,
      takeProfit,
      currentPrice: entryPrice,
      unrealizedPnL: 0,
      unrealizedPnLPercent: 0
    };
    
    this.positions.set(position.id, position);
    this.capital -= positionSize;
    
    // Log
    console.log(`[PaperTrading] OPEN SHORT ${coin.symbol} @ $${entryPrice.toFixed(6)}`);
    console.log(`  Size: ${positionSize.toFixed(2)} SOL | Target: -${(decision.expectedDrop * 100).toFixed(1)}%`);
    console.log(`  SL: $${stopLoss.toFixed(6)} (+4%) | TP: $${takeProfit.toFixed(6)} (-${(decision.expectedDrop * 100).toFixed(1)}%)`);
    
    return true;
  }
  
  /**
   * Updates all positions with current prices.
   */
  async updatePositions(prices: Map<string, number>): Promise<void> {
    const updates: string[] = [];
    
    for (const [id, pos] of this.positions) {
      const currentPrice = prices.get(pos.mint);
      if (!currentPrice) continue;
      
      pos.currentPrice = currentPrice;
      
      // Calculate unrealized P&L (SHORT: profit when price drops)
      const priceChange = (pos.entryPrice - currentPrice) / pos.entryPrice;
      pos.unrealizedPnL = pos.size * priceChange;
      pos.unrealizedPnLPercent = priceChange * 100;
      
      // Check exit conditions
      const shouldExit = await this.checkExitConditions(pos, currentPrice);
      
      if (shouldExit.exit) {
        await this.closePosition(id, shouldExit.reason!, currentPrice);
        updates.push(`${pos.symbol}: ${shouldExit.reason}`);
      }
    }
    
    if (updates.length > 0) {
      console.log(`[PaperTrading] Closed positions: ${updates.join(', ')}`);
    }
  }
  
  /**
   * Checks if position should be closed.
   */
  private async checkExitConditions(
    pos: Position,
    currentPrice: number
  ): Promise<{ exit: boolean; reason?: Position['exitReason'] }> {
    // Stop Loss: price moved against us (up for SHORT)
    if (currentPrice >= pos.stopLoss) {
      return { exit: true, reason: 'SL' };
    }
    
    // Take Profit: price dropped enough
    if (currentPrice <= pos.takeProfit) {
      return { exit: true, reason: 'TP' };
    }
    
    // Timeout: 3x expected timeframe
    const maxHoldingMs = pos.prediction.timeframe * 60000 * 3;
    if (Date.now() - pos.entryTime > maxHoldingMs) {
      // If we're in profit, close anyway
      if (pos.unrealizedPnLPercent > 0) {
        return { exit: true, reason: 'TIME' };
      }
      // If we're losing, also close to stop bleeding
      if (pos.unrealizedPnLPercent < -1) {
        return { exit: true, reason: 'TIME' };
      }
    }
    
    // Reversal detection: price went back up >2% from low point
    const priceFromPeak = (currentPrice - pos.takeProfit) / pos.takeProfit;
    if (priceFromPeak > 0.03 && pos.unrealizedPnLPercent > 1) {
      // Take profit before it disappears
      return { exit: true, reason: 'REVERSAL' };
    }
    
    return { exit: false };
  }
  
  /**
   * Closes a position.
   */
  private async closePosition(
    id: string,
    reason: Position['exitReason'],
    exitPrice: number
  ): Promise<void> {
    const pos = this.positions.get(id);
    if (!pos) return;
    
    // Calculate realized P&L
    const priceChange = (pos.entryPrice - exitPrice) / pos.entryPrice;
    pos.realizedPnL = pos.size * priceChange;
    
    // Return capital + P&L
    this.capital += pos.size + pos.realizedPnL;
    
    // Mark exit
    pos.exitReason = reason;
    pos.exitPrice = exitPrice;
    pos.exitTime = Date.now();
    
    // Move to history
    this.tradeHistory.push(pos);
    this.positions.delete(id);
    
    // Log
    const pnlStr = pos.realizedPnL >= 0 ? `+${pos.realizedPnL.toFixed(4)}` : pos.realizedPnL.toFixed(4);
    const pnlPercentStr = pos.unrealizedPnLPercent >= 0 ? `+${pos.unrealizedPnLPercent.toFixed(2)}%` : `${pos.unrealizedPnLPercent.toFixed(2)}%`;
    console.log(`[PaperTrading] CLOSE ${pos.symbol} @ $${exitPrice.toFixed(6)} | ${reason}`);
    console.log(`  PnL: ${pnlStr} SOL (${pnlPercentStr}) | Capital: ${this.capital.toFixed(2)} SOL`);
    
    // Write to log file
    this.logTrade(pos);
  }
  
  /**
   * Logs trade to file.
   */
  private logTrade(pos: Position): void {
    const entry = {
      id: pos.id,
      symbol: pos.symbol,
      mint: pos.mint,
      entryPrice: pos.entryPrice,
      exitPrice: pos.exitPrice,
      size: pos.size,
      entryTime: pos.entryTime,
      exitTime: pos.exitTime,
      duration: pos.exitTime! - pos.entryTime,
      reason: pos.exitReason,
      realizedPnL: pos.realizedPnL,
      returnPercent: pos.unrealizedPnLPercent,
      prediction: {
        confidence: pos.prediction.confidence,
        expectedDrop: pos.prediction.expectedDrop,
        timeframe: pos.prediction.timeframe,
        layersAgreeing: pos.prediction.layersAgreeing
      }
    };
    
    try {
      fs.appendFileSync(this.tradesLogPath, JSON.stringify(entry) + '\n');
    } catch (e) {
      console.error('[PaperTrading] Failed to log trade:', e);
    }
  }
  
  // ============================================================================
  // STATS & REPORTING
  // ============================================================================
  
  /**
   * Gets current trading stats.
   */
  getStats(): TradeStats {
    const wins = this.tradeHistory.filter(t => (t.realizedPnL || 0) > 0);
    const losses = this.tradeHistory.filter(t => (t.realizedPnL || 0) < 0);
    
    const returns = this.tradeHistory.map(t => t.unrealizedPnLPercent / 100);
    const avgReturn = returns.length > 0
      ? returns.reduce((a, b) => a + b, 0) / returns.length
      : 0;
    
    // Calculate max drawdown
    let peak = INITIAL_CAPITAL;
    let maxDrawdown = 0;
    let cumulative = INITIAL_CAPITAL;
    
    for (const trade of this.tradeHistory) {
      cumulative += trade.realizedPnL || 0;
      if (cumulative > peak) peak = cumulative;
      const drawdown = (peak - cumulative) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
    
    // Sharpe ratio (simplified)
    const variance = returns.length > 1
      ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
      : 0;
    const stdDev = Math.sqrt(variance);
    const sharpe = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(365) : 0;
    
    return {
      capital: this.capital,
      openPositions: this.positions.size,
      totalTrades: this.tradeHistory.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: this.tradeHistory.length > 0 ? wins.length / this.tradeHistory.length : 0,
      avgReturn: avgReturn * 100,
      totalPnL: this.tradeHistory.reduce((sum, t) => sum + (t.realizedPnL || 0), 0),
      maxDrawdown: maxDrawdown * 100,
      sharpeRatio: sharpe
    };
  }
  
  /**
   * Gets all open positions.
   */
  getOpenPositions(): Position[] {
    return Array.from(this.positions.values());
  }
  
  /**
   * Gets trade history.
   */
  getTradeHistory(): Position[] {
    return this.tradeHistory;
  }
  
  /**
   * Gets current prices for all open positions.
   */
  getPositionPrices(): Map<string, { current: number; entry: number; pnlPercent: number }> {
    const prices = new Map();
    
    for (const pos of this.positions.values()) {
      prices.set(pos.mint, {
        current: pos.currentPrice,
        entry: pos.entryPrice,
        pnlPercent: pos.unrealizedPnLPercent
      });
    }
    
    return prices;
  }
  
  // ============================================================================
  // UTILITY
  // ============================================================================
  
  /**
   * Resets all positions and capital (for fresh start).
   */
  reset(): void {
    this.positions.clear();
    this.capital = INITIAL_CAPITAL;
    this.tradeHistory = [];
    console.log(`[PaperTrading] RESET - Capital: ${INITIAL_CAPITAL} SOL`);
  }
  
  /**
   * Generates performance report.
   */
  generateReport(): string {
    const stats = this.getStats();
    
    let report = '='.repeat(50) + '\n';
    report += 'PAPER TRADING PERFORMANCE REPORT\n';
    report += '='.repeat(50) + '\n';
    report += `Capital: ${stats.capital.toFixed(2)} SOL\n`;
    report += `Open Positions: ${stats.openPositions}\n`;
    report += `Total Trades: ${stats.totalTrades}\n`;
    report += `Win Rate: ${(stats.winRate * 100).toFixed(1)}%\n`;
    report += `Avg Return: ${stats.avgReturn.toFixed(2)}%\n`;
    report += `Total P&L: ${stats.totalPnL.toFixed(4)} SOL\n`;
    report += `Max Drawdown: ${stats.maxDrawdown.toFixed(2)}%\n`;
    report += `Sharpe Ratio: ${stats.sharpeRatio.toFixed(2)}\n`;
    
    if (stats.openPositions > 0) {
      report += '\nOpen Positions:\n';
      for (const pos of this.positions.values()) {
        const pnlStr = pos.unrealizedPnL >= 0 ? `+${pos.unrealizedPnL.toFixed(4)}` : pos.unrealizedPnL.toFixed(4);
        report += `  ${pos.symbol}: ${pnlStr} SOL (${pos.unrealizedPnLPercent.toFixed(2)}%)\n`;
      }
    }
    
    return report;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const paperTradingEngine = new PaperTradingEngine();