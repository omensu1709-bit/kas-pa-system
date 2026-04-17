/**
 * Anti-Manipulation Guards
 * Verhindert Manipulation des Trading-Systems
 */
export class AntiManipulationGuards {
    // Sicherheits-Limits
    maxPositionSizePercent = 10; // Max 10% des Kapitals pro Trade
    minHoldingSlots = 5; // Min 5 Slots Haltezeit
    maxDailyTrades = 20;
    cooldownBetweenTradesSeconds = 2;
    // Statistiken
    todayTradeCount = 0;
    lastTradeTimestamp = 0;
    recentDirections = [];
    recentLossCount = 0;
    averageTradeSize = 0;
    constructor(config) {
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
    validateTrade(trade, state) {
        const errors = [];
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
    detectSuspiciousPattern(trade, state) {
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
    recordTrade(trade, state) {
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
    scheduleDailyReset() {
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
    reset() {
        this.todayTradeCount = 0;
        this.recentLossCount = 0;
        this.recentDirections = [];
    }
    /**
     * Markiert einen Verlust für Statistik
     */
    recordLoss() {
        this.recentLossCount++;
    }
    /**
     * Markiert einen Gewinn für Statistik
     */
    recordWin() {
        if (this.recentLossCount > 0) {
            this.recentLossCount--;
        }
    }
    /**
     * Gibt aktuelle Guard-Statistiken zurück
     */
    getStats() {
        return {
            todayTradeCount: this.todayTradeCount,
            maxDailyTrades: this.maxDailyTrades,
            recentLossCount: this.recentLossCount,
            recentDirections: [...this.recentDirections],
            averageTradeSize: this.averageTradeSize
        };
    }
}
//# sourceMappingURL=anti-manipulation.js.map