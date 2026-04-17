/**
 * Know-All-Short: OrderBook & TradeFlow Analyzer
 * 
 * Berechnet OBI (Order-Book-Imbalance) und TFI (Trade-Flow-Imbalance)
 * Basierend auf SOTA Research für Krypto-Prediction
 * 
 * OBI_L1 = (Q_bid_1 - Q_ask_1) / (Q_bid_1 + Q_ask_1)
 * TFI = (buyVolume - sellVolume) / (buyVolume + sellVolume)
 */

export interface OrderBookData {
  symbol: string;
  buys: number;
  sells: number;
  buyVolume: number;
  sellVolume: number;
  timestamp: number;
}

export interface OBIResult {
  obi: number;           // -1 to +1
  obiLevel: 'oversold' | 'neutral' | 'overbought';
  confidence: number;    // 0 to 1
}

export interface TFIResult {
  tfi: number;           // -1 to +1
  pressure: 'strong_sell' | 'sell' | 'neutral' | 'buy' | 'strong_buy';
  buyPressure: number;   // 0 to 1
  volumeRatio: number;   // buyVol / totalVol
}

export interface ShortSignal {
  symbol: string;
  timestamp: number;
  isShort: boolean;
  confidence: number;    // 0 to 1
  tfi: number;
  obi: number;
  reason: string;
  buyPressure: number;
  priceChange1h: number;
}

export class OrderBookAnalyzer {
  private history: Map<string, OrderBookData[]> = new Map();
  private readonly HISTORY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
  
  /**
   * Verarbeite DexScreener OrderBook Daten
   */
  processDexScreenerData(symbol: string, data: {
    buys: number;
    sells: number;
    buyVolume?: number;
    sellVolume?: number;
    timestamp?: number;
  }): void {
    const buyVol = data.buyVolume ?? data.buys * 0.001; // Fallback
    const sellVol = data.sellVolume ?? data.sells * 0.001;
    
    const orderBookData: OrderBookData = {
      symbol,
      buys: data.buys,
      sells: data.sells,
      buyVolume: buyVol,
      sellVolume: sellVol,
      timestamp: data.timestamp ?? Date.now()
    };
    
    // Add to history
    const history = this.history.get(symbol) || [];
    history.push(orderBookData);
    
    // Keep only last 5 minutes
    const cutoff = Date.now() - this.HISTORY_WINDOW_MS;
    const filtered = history.filter(h => h.timestamp > cutoff);
    this.history.set(symbol, filtered);
  }
  
  /**
   * Berechne TFI (Trade-Flow-Imbalance) für letzten 5 Minuten
   */
  calculateTFI(symbol: string): TFIResult {
    const history = this.history.get(symbol) || [];
    
    if (history.length === 0) {
      return {
        tfi: 0,
        pressure: 'neutral',
        buyPressure: 0.5,
        volumeRatio: 0.5
      };
    }
    
    // Aggregate last 5 minutes
    let totalBuys = 0;
    let totalSells = 0;
    let totalBuyVol = 0;
    let totalSellVol = 0;
    
    for (const h of history) {
      totalBuys += h.buys;
      totalSells += h.sells;
      totalBuyVol += h.buyVolume;
      totalSellVol += h.sellVolume;
    }
    
    const totalVolume = totalBuyVol + totalSellVol;
    const tfi = totalVolume > 0 
      ? (totalBuyVol - totalSellVol) / totalVolume 
      : 0;
    
    const buyPressure = totalVolume > 0 
      ? totalBuyVol / totalVolume 
      : 0.5;
    
    const volumeRatio = totalVolume > 0 
      ? totalBuyVol / totalVolume 
      : 0.5;
    
    let pressure: TFIResult['pressure'];
    if (tfi < -0.3) pressure = 'strong_sell';
    else if (tfi < -0.1) pressure = 'sell';
    else if (tfi > 0.3) pressure = 'strong_buy';
    else if (tfi > 0.1) pressure = 'buy';
    else pressure = 'neutral';
    
    return {
      tfi,
      pressure,
      buyPressure,
      volumeRatio
    };
  }
  
  /**
   * Berechne OBI (Order-Book-Imbalance) - nutzt TFI als Proxy
   * Da DexScreener keine echten Bid/Ask Werte liefert
   */
  calculateOBI(symbol: string): OBIResult {
    const tfi = this.calculateTFI(symbol);
    
    // OBI is inverse of TFI for our purposes
    // If sells dominate (TFI < 0), that's oversold (good for longs)
    // If buys dominate (TFI > 0), that's overbought (good for shorts)
    const obi = -tfi.tfi;
    
    let obiLevel: OBIResult['obiLevel'];
    if (obi < -0.3) obiLevel = 'oversold';
    else if (obi > 0.3) obiLevel = 'overbought';
    else obiLevel = 'neutral';
    
    const confidence = Math.abs(obi); // Higher absolute value = more confident
    
    return {
      obi,
      obiLevel,
      confidence: Math.min(1, confidence)
    };
  }
  
  /**
   * Generiere Short-Signal basierend auf TFI und OBI
   */
  generateShortSignal(
    symbol: string, 
    priceChange1h: number
  ): ShortSignal {
    const tfi = this.calculateTFI(symbol);
    const obi = this.calculateOBI(symbol);
    
    // Short Signal Logic:
    // 1. TFI must be negative (more sells than buys)
    // 2. Price should be declining (negative 1h change)
    // 3. Strong sell pressure confirms
    
    const tfiShortCondition = tfi.tfi < -0.1; // More sells than buys
    const priceDeclining = priceChange1h < 0;
    
    let isShort = false;
    let confidence = 0;
    let reason = '';
    
    if (tfi.tfi < -0.3 && priceChange1h < -5) {
      // STRONG SHORT SIGNAL
      isShort = true;
      confidence = 0.9;
      reason = `STRONG: TFI=${tfi.tfi.toFixed(3)}, Price=-${priceChange1h.toFixed(1)}%`;
    } else if (tfi.tfi < -0.2 && priceChange1h < -2) {
      // MODERATE SHORT SIGNAL
      isShort = true;
      confidence = 0.7;
      reason = `MODERATE: TFI=${tfi.tfi.toFixed(3)}, Price=-${priceChange1h.toFixed(1)}%`;
    } else if (tfi.tfi < -0.1 && priceChange1h < 0) {
      // WEAK SHORT SIGNAL
      isShort = true;
      confidence = 0.4;
      reason = `WEAK: TFI=${tfi.tfi.toFixed(3)}, Price=${priceChange1h.toFixed(1)}%`;
    } else if (tfi.tfi > 0.2) {
      // BUY PRESSURE - DO NOT SHORT
      isShort = false;
      confidence = 0.8;
      reason = `NO-SHORT: Buy pressure TFI=${tfi.tfi.toFixed(3)}`;
    } else {
      // NEUTRAL
      isShort = false;
      confidence = 0.3;
      reason = `NEUTRAL: TFI=${tfi.tfi.toFixed(3)}, Price=${priceChange1h.toFixed(1)}%`;
    }
    
    return {
      symbol,
      timestamp: Date.now(),
      isShort,
      confidence,
      tfi: tfi.tfi,
      obi: obi.obi,
      reason,
      buyPressure: tfi.buyPressure,
      priceChange1h
    };
  }
  
  /**
   * Get current state summary for a symbol
   */
  getSummary(symbol: string): {
    tfi: TFIResult;
    obi: OBIResult;
    dataPoints: number;
  } {
    return {
      tfi: this.calculateTFI(symbol),
      obi: this.calculateOBI(symbol),
      dataPoints: this.history.get(symbol)?.length || 0
    };
  }
  
  /**
   * Clear history for a symbol
   */
  clearHistory(symbol: string): void {
    this.history.delete(symbol);
  }
  
  /**
   * Clear all history
   */
  clearAll(): void {
    this.history.clear();
  }
}

// Singleton instance
export const orderBookAnalyzer = new OrderBookAnalyzer();
