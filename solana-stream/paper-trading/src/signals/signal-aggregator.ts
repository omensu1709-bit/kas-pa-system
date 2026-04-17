/**
 * Know-All-Short: Signal Aggregator
 * 
 * Kombiniert alle Signale zu einem finalen Short/Long Entscheid:
 * 1. OrderBook/TFI Analysis (Kernfeature)
 * 2. Bot-Detection
 * 3. Price Momentum
 * 4. Ranking Score
 */

import { orderBookAnalyzer, type ShortSignal } from './orderbook-analyzer.js';

export interface AggregatedSignal {
  symbol: string;
  timestamp: number;
  
  // Final Decision
  action: 'SHORT' | 'LONG' | 'IGNORE';
  confidence: number;
  reason: string;
  
  // Component Signals
  orderBookSignal: {
    tfi: number;
    pressure: string;
    isShort: boolean;
    confidence: number;
  };
  
  momentumSignal: {
    priceChange1h: number;
    isNegative: boolean;
    strength: 'strong' | 'moderate' | 'weak';
  };
  
  botSignal: {
    probability: number;
    isBotDominated: boolean;
    shouldTrade: boolean;
  };
  
  consensusScore: number; // 0-5 signals pointing to SHORT
}

export class SignalAggregator {
  /**
   * Generate aggregated signal for a symbol
   */
  async generateSignal(
    symbol: string,
    dexScreenerData: {
      buys: number;
      sells: number;
      buyVolume?: number;
      sellVolume?: number;
    },
    priceChange1h: number,
    botProbability: number,
    rankingScore: number
  ): Promise<AggregatedSignal> {
    
    // 1. Process OrderBook data
    orderBookAnalyzer.processDexScreenerData(symbol, dexScreenerData);
    
    // 2. Generate Short Signal from OrderBook
    const obSignal = orderBookAnalyzer.generateShortSignal(symbol, priceChange1h);
    
    // 3. Momentum Signal
    const momentumSignal = this.evaluateMomentum(priceChange1h);
    
    // 4. Bot Signal
    const botSignal = this.evaluateBotSignal(botProbability);
    
    // 5. Calculate Consensus Score
    let consensusScore = 0;
    
    // TFI < 0 = +1
    if (obSignal.tfi < -0.1) consensusScore += 1;
    if (obSignal.tfi < -0.2) consensusScore += 1;
    
    // Price declining = +1
    if (priceChange1h < -2) consensusScore += 1;
    if (priceChange1h < -5) consensusScore += 1;
    
    // Low bot probability = +1
    if (botProbability < 0.7) consensusScore += 1;
    
    // Consensus: mind. 3 von 5 für SHORT
    
    // 6. Final Decision
    let action: AggregatedSignal['action'];
    let confidence: number;
    let reason: string;
    
    if (consensusScore >= 4 && obSignal.tfi < -0.2) {
      action = 'SHORT';
      confidence = 0.85;
      reason = `STRONG SHORT: ${consensusScore}/5 consensus, TFI=${obSignal.tfi.toFixed(3)}`;
    } else if (consensusScore >= 3 && obSignal.tfi < -0.1) {
      action = 'SHORT';
      confidence = 0.65;
      reason = `MODERATE SHORT: ${consensusScore}/5 consensus, TFI=${obSignal.tfi.toFixed(3)}`;
    } else if (obSignal.buyPressure > 0.6) {
      action = 'IGNORE';
      confidence = 0.7;
      reason = `NO-SHORT: Buy pressure ${(obSignal.buyPressure * 100).toFixed(0)}%`;
    } else {
      action = 'IGNORE';
      confidence = 0.5;
      reason = `NO-SIGNAL: Consensus=${consensusScore}/5`;
    }
    
    return {
      symbol,
      timestamp: Date.now(),
      action,
      confidence,
      reason,
      orderBookSignal: {
        tfi: obSignal.tfi,
        pressure: obSignal.confidence > 0.5 ? 'strong_sell' : 'sell',
        isShort: obSignal.isShort,
        confidence: obSignal.confidence
      },
      momentumSignal,
      botSignal,
      consensusScore
    };
  }
  
  /**
   * Evaluate momentum signal
   */
  private evaluateMomentum(priceChange1h: number): AggregatedSignal['momentumSignal'] {
    let strength: 'strong' | 'moderate' | 'weak';
    if (priceChange1h < -10) strength = 'strong';
    else if (priceChange1h < -5) strength = 'moderate';
    else strength = 'weak';
    
    return {
      priceChange1h,
      isNegative: priceChange1h < 0,
      strength
    };
  }
  
  /**
   * Evaluate bot signal
   */
  private evaluateBotSignal(botProbability: number): AggregatedSignal['botSignal'] {
    // High bot probability = false signals, don't trade
    const isBotDominated = botProbability > 0.8;
    const shouldTrade = botProbability < 0.7;
    
    return {
      probability: botProbability,
      isBotDominated,
      shouldTrade
    };
  }
  
  /**
   * Get order book summary
   */
  getOrderBookSummary(symbol: string) {
    return orderBookAnalyzer.getSummary(symbol);
  }
}

export const signalAggregator = new SignalAggregator();
