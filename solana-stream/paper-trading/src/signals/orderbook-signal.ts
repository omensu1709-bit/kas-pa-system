import axios from 'axios';

export interface OrderBookSignal {
  symbol: string;
  bidAskRatio: number;        // bids / asks (< 0.3 = dump incoming)
  depthChange: number;        // % change in total depth
  imbalance: 'HEAVY_SELL' | 'MODERATE_SELL' | 'NEUTRAL' | 'HEAVY_BUY';
  timestamp: number;
}

class OrderBookTracker {
  // Use Jupiter Price API / DEX Screener for simple orderbook proxy if direct RPC is unavailable
  async fetchOrderBook(mint: string, symbol: string): Promise<OrderBookSignal> {
    try {
      // Proxy: DexScreener shows order book data for main DEX pairs
      const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { timeout: 5000 });
      const pairs = response.data?.pairs || [];
      const pair = pairs.sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
      
      if (!pair) throw new Error('No pairs found');

      // Estimate imbalance via Volume/Price Change if direct OB not available
      // (This is a proxy until dedicated orderbook RPCs are integrated)
      const bidAskRatio = pair.priceChange?.h1 ? Math.min(1, Math.max(0, 1 + (pair.priceChange.h1 / 100))) : 0.5;
      
      let imbalance: OrderBookSignal['imbalance'] = 'NEUTRAL';
      if (bidAskRatio < 0.3) imbalance = 'HEAVY_SELL';
      else if (bidAskRatio < 0.6) imbalance = 'MODERATE_SELL';
      else if (bidAskRatio > 1.5) imbalance = 'HEAVY_BUY';

      return {
        symbol,
        bidAskRatio,
        depthChange: 0, // Placeholder
        imbalance,
        timestamp: Date.now()
      };
    } catch (e) {
      return { symbol, bidAskRatio: 0.5, depthChange: 0, imbalance: 'NEUTRAL', timestamp: Date.now() };
    }
  }
}

export function getOrderBookBoost(signal: OrderBookSignal): number {
  if (signal.imbalance === 'HEAVY_SELL') return 0.3;
  if (signal.imbalance === 'MODERATE_SELL') return 0.1;
  return 0;
}

export const orderBookFetcher = new OrderBookTracker();
