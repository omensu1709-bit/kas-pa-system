/**
 * Layer 1: Market Microstructure Signals (DexScreener)
 *
 * 4 Signals derived from DexScreener real-time data:
 * 1. Sell Acceleration - Detects accelerating sell pressure
 * 2. Buy/Sell Imbalance - Detects sell dominance
 * 3. Volume-Price Divergence - Detects distribution pattern
 * 4. Liquidity Drainage - Detects LP removal
 */
export interface MarketSignals {
    sellAcceleration: number;
    buySellImbalance: number;
    volumePriceDivergence: number;
    liquidityDrainage: number;
}
export interface MarketLayer {
    score: number;
    confidence: number;
    signals: MarketSignals;
}
/**
 * Calculates sell pressure acceleration.
 * Compares sell rate in last 5min vs average sell rate in last hour.
 *
 * @returns score 0-1, where >0.75 = 75% acceleration = WARNING
 */
export declare function calculateSellAcceleration(data: {
    txns: {
        m5: {
            sells: number;
        };
        h1: {
            sells: number;
        };
    };
}): number;
/**
 * Calculates buy/sell imbalance in 5min window.
 *
 * @returns score 0-1, where 0.6 = 60% sells = WARNING
 */
export declare function calculateBuySellImbalance(data: {
    txns: {
        m5: {
            buys: number;
            sells: number;
        };
    };
}): number;
/**
 * Detects distribution pattern: Volume UP + Price DOWN
 * This pattern indicates Smart Money selling to Retail.
 *
 * @returns score 0-1, where 1.0 = strong divergence = CRITICAL
 */
export declare function calculateVolumePriceDivergence(data: {
    volume: {
        m5: number;
        h1: number;
    };
    priceChange: {
        m5: number;
    };
}): number;
/**
 * Detects liquidity removal (potential rug pull).
 * Compares current liquidity vs liquidity 5min ago.
 *
 * @returns score 0-1, where >0.5 = -5% liquidity = WARNING
 */
export declare function calculateLiquidityDrainage(mint: string, currentLiquidity: number): number;
/**
 * Aggregates all 4 market signals into a single layer score.
 *
 * @param dexData - DexScreener pair data
 * @param mint - Token mint for liquidity tracking
 * @returns MarketLayer with score and individual signals
 */
export declare function calculateMarketLayer(dexData: {
    txns: {
        m5: {
            buys: number;
            sells: number;
        };
        h1: {
            buys: number;
            sells: number;
        };
    };
    volume: {
        m5: number;
        h1: number;
    };
    priceChange: {
        m5: number;
    };
    liquidity: {
        usd: number;
    };
}, mint: string): Promise<MarketLayer>;
/**
 * Quick check for severe market signals.
 * Used for rapid screening.
 */
export declare function hasSevereMarketSignal(layer: MarketLayer): boolean;
