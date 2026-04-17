export interface PriceVelocitySignal {
  symbol: string;
  change_1min: number;      // % in 1 Minute
  change_5min: number;      // % in 5 Minuten
  change_15min: number;     // % in 15 Minuten
  acceleration: number;     // 2nd Derivative
  isFlashCrash: boolean;    // -10%+ in 5min
  isSteadyDrop: boolean;    // -20%+ in 15min
  timestamp: number;
}

class PriceVelocityTracker {
  private priceHistory: Map<string, Array<{price: number, ts: number}>> = new Map();
  private readonly WINDOW_MS = 15 * 60 * 1000; // 15 minutes window

  addPrice(symbol: string, price: number): void {
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, []);
    }
    const history = this.priceHistory.get(symbol)!;
    const now = Date.now();
    history.push({ price, ts: now });
    
    // Clean old data points
    while (history.length > 0 && history[0].ts < now - this.WINDOW_MS) {
      history.shift();
    }
  }

  compute(symbol: string): PriceVelocitySignal {
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

  getVelocityBoost(signal: PriceVelocitySignal): number {
    let boost = 0;
    if (signal.isFlashCrash) boost += 0.3;
    if (signal.isSteadyDrop) boost += 0.2;
    if (signal.acceleration < -2.0) boost += 0.2;
    return Math.min(0.5, boost);
  }

  private calcReturn(history: Array<{price: number, ts: number}>, windowMs: number): number {
    const now = Date.now();
    const startPrice = history.find(entry => entry.ts >= now - windowMs)?.price;
    const endPrice = history[history.length - 1].price;
    
    if (!startPrice || startPrice === 0) return 0;
    return ((endPrice - startPrice) / startPrice) * 100;
  }
}

export const priceVelocityTracker = new PriceVelocityTracker();
