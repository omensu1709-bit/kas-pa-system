"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.priceVelocityTracker = void 0;
class PriceVelocityTracker {
    constructor() {
        this.priceHistory = new Map();
        this.WINDOW_MS = 15 * 60 * 1000; // 15 minutes window
    }
    addPrice(symbol, price) {
        if (!this.priceHistory.has(symbol)) {
            this.priceHistory.set(symbol, []);
        }
        const history = this.priceHistory.get(symbol);
        const now = Date.now();
        history.push({ price, ts: now });
        // Clean old data points
        while (history.length > 0 && history[0].ts < now - this.WINDOW_MS) {
            history.shift();
        }
    }
    compute(symbol) {
        const history = this.priceHistory.get(symbol);
        if (!history || history.length < 2) {
            return {
                symbol, change_1min: 0, change_5min: 0, change_15min: 0,
                acceleration: 0, isFlashCrash: false, isSteadyDrop: false,
                timestamp: Date.now()
            };
        }
        const change_1min = this.calcReturn(history, 60 * 1000);
        const change_5min = this.calcReturn(history, 5 * 60 * 1000);
        const change_15min = this.calcReturn(history, 15 * 60 * 1000);
        // 2nd Derivative (acceleration approximation)
        const acceleration = (change_5min - change_15min) / 10;
        return {
            symbol,
            change_1min,
            change_5min,
            change_15min,
            acceleration,
            isFlashCrash: change_5min < -10,
            isSteadyDrop: change_15min < -20,
            timestamp: Date.now()
        };
    }
    getVelocityBoost(signal) {
        let boost = 0;
        if (signal.isFlashCrash)
            boost += 0.3;
        if (signal.isSteadyDrop)
            boost += 0.2;
        if (signal.acceleration < -2.0)
            boost += 0.2;
        return Math.min(0.5, boost);
    }
    calcReturn(history, windowMs) {
        var _a;
        const now = Date.now();
        const startPrice = (_a = history.find(entry => entry.ts >= now - windowMs)) === null || _a === void 0 ? void 0 : _a.price;
        const endPrice = history[history.length - 1].price;
        if (!startPrice || startPrice === 0)
            return 0;
        return ((endPrice - startPrice) / startPrice) * 100;
    }
}
exports.priceVelocityTracker = new PriceVelocityTracker();
