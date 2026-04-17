/**
 * Paper Trading Engine - Bot-Ready Position Management
 *
 * Manages SHORT positions based on consensus predictions.
 * Tracks P&L, stop losses, take profits, and timeouts.
 * Can be converted to live trading by replacing simulated fills with real orders.
 */
import type { Prediction } from './consensus-engine.js';
export interface Position {
    id: string;
    mint: string;
    symbol: string;
    entryPrice: number;
    entryTime: number;
    size: number;
    prediction: Prediction;
    stopLoss: number;
    takeProfit: number;
    currentPrice: number;
    unrealizedPnL: number;
    unrealizedPnLPercent: number;
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
export declare class PaperTradingEngine {
    private positions;
    private capital;
    private tradeHistory;
    private priceHistory;
    private logDir;
    private tradesLogPath;
    constructor();
    /**
     * Opens a new SHORT position based on prediction.
     */
    openPosition(decision: Prediction, coin: ShortTarget): Promise<boolean>;
    /**
     * Updates all positions with current prices.
     */
    updatePositions(prices: Map<string, number>): Promise<void>;
    /**
     * Checks if position should be closed.
     */
    private checkExitConditions;
    /**
     * Closes a position.
     */
    private closePosition;
    /**
     * Logs trade to file.
     */
    private logTrade;
    /**
     * Gets current trading stats.
     */
    getStats(): TradeStats;
    /**
     * Gets all open positions.
     */
    getOpenPositions(): Position[];
    /**
     * Gets trade history.
     */
    getTradeHistory(): Position[];
    /**
     * Gets current prices for all open positions.
     */
    getPositionPrices(): Map<string, {
        current: number;
        entry: number;
        pnlPercent: number;
    }>;
    /**
     * Resets all positions and capital (for fresh start).
     */
    reset(): void;
    /**
     * Generates performance report.
     */
    generateReport(): string;
}
export declare const paperTradingEngine: PaperTradingEngine;
