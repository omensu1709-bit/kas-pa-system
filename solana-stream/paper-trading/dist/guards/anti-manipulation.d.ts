/**
 * Anti-Manipulation Guards
 * Verhindert Manipulation des Trading-Systems
 */
export declare class AntiManipulationGuards {
    private maxPositionSizePercent;
    private minHoldingSlots;
    private maxDailyTrades;
    private cooldownBetweenTradesSeconds;
    private todayTradeCount;
    private lastTradeTimestamp;
    private recentDirections;
    private recentLossCount;
    private averageTradeSize;
    constructor(config?: GuardConfig);
    /**
     * Validiert einen Trade gegen alle Guards
     */
    validateTrade(trade: TradeRequest, state: SystemState): ValidationResult;
    /**
     * Erkennt verdächtige Muster
     */
    private detectSuspiciousPattern;
    /**
     * Zeichnet einen Trade auf für Statistik
     */
    private recordTrade;
    /**
     * Setzt täglichen Zähler zurück (wird automatisch aufgerufen)
     */
    private scheduleDailyReset;
    /**
     * Manually reset (z.B. nach Review)
     */
    reset(): void;
    /**
     * Markiert einen Verlust für Statistik
     */
    recordLoss(): void;
    /**
     * Markiert einen Gewinn für Statistik
     */
    recordWin(): void;
    /**
     * Gibt aktuelle Guard-Statistiken zurück
     */
    getStats(): GuardStats;
}
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
//# sourceMappingURL=anti-manipulation.d.ts.map