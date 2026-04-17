/**
 * Layer 1: Market Microstructure Signals (DexScreener)
 *
 * 4 Signals derived from DexScreener real-time data:
 * 1. Sell Acceleration - Detects accelerating sell pressure
 * 2. Buy/Sell Imbalance - Detects sell dominance
 * 3. Volume-Price Divergence - Detects distribution pattern
 * 4. Liquidity Drainage - Detects LP removal
 */
// ============================================================================
// LIQUIDITY HISTORY (for drainage detection)
// ============================================================================
const liquidityHistory = new Map();
const LIQUIDITY_HISTORY_TTL = 300000; // 5 minutes
// ============================================================================
// SIGNAL 1: SELL ACCELERATION
// ============================================================================
/**
 * Calculates sell pressure acceleration.
 * Compares sell rate in last 5min vs average sell rate in last hour.
 *
 * @returns score 0-1, where >0.75 = 75% acceleration = WARNING
 */
export function calculateSellAcceleration(data) {
    const sells_m5 = data.txns.m5.sells;
    const sells_h1 = data.txns.h1.sells;
    // Sells per minute
    const sellRate_5m = sells_m5 / 5;
    const sellRate_1h = sells_h1 / 60;
    // Acceleration factor (5min rate / 1h average rate)
    // 3x acceleration = score 1.0
    const acceleration = sellRate_5m / (sellRate_1h + 0.1);
    return Math.min(1.0, acceleration / 3.0);
}
// ============================================================================
// SIGNAL 2: BUY/SELL IMBALANCE
// ============================================================================
/**
 * Calculates buy/sell imbalance in 5min window.
 *
 * @returns score 0-1, where 0.6 = 60% sells = WARNING
 */
export function calculateBuySellImbalance(data) {
    const { buys, sells } = data.txns.m5;
    const total = buys + sells;
    if (total === 0)
        return 0.5; // Neutral
    const sellRatio = sells / total;
    return sellRatio;
}
// ============================================================================
// SIGNAL 3: VOLUME-PRICE DIVERGENCE
// ============================================================================
/**
 * Detects distribution pattern: Volume UP + Price DOWN
 * This pattern indicates Smart Money selling to Retail.
 *
 * @returns score 0-1, where 1.0 = strong divergence = CRITICAL
 */
export function calculateVolumePriceDivergence(data) {
    // Volume spike: current 5min volume vs average 5min volume in last hour
    const volume_1h_avg_per_5min = data.volume.h1 / 12;
    const volumeSpike = data.volume.m5 / (volume_1h_avg_per_5min + 1);
    const priceChange = data.priceChange.m5; // e.g., -2.5 = -2.5%
    // Strong divergence: Volume up significantly + Price down
    if (volumeSpike > 2.5 && priceChange < -2.0)
        return 1.0;
    if (volumeSpike > 2.0 && priceChange < -1.5)
        return 0.85;
    if (volumeSpike > 2.0 && priceChange < -1.0)
        return 0.7;
    if (volumeSpike > 1.5 && priceChange < -0.5)
        return 0.4;
    // Mild divergence
    if (volumeSpike > 1.5 && priceChange < 0)
        return 0.2;
    return 0;
}
// ============================================================================
// SIGNAL 4: LIQUIDITY DRAINAGE
// ============================================================================
/**
 * Detects liquidity removal (potential rug pull).
 * Compares current liquidity vs liquidity 5min ago.
 *
 * @returns score 0-1, where >0.5 = -5% liquidity = WARNING
 */
export function calculateLiquidityDrainage(mint, currentLiquidity) {
    const now = Date.now();
    const stored = liquidityHistory.get(mint);
    // Update history
    liquidityHistory.set(mint, { liquidity: currentLiquidity, timestamp: now });
    // Clean old entries
    for (const [key, value] of liquidityHistory) {
        if (now - value.timestamp > LIQUIDITY_HISTORY_TTL) {
            liquidityHistory.delete(key);
        }
    }
    if (!stored)
        return 0;
    // Calculate change percentage
    const change = (currentLiquidity - stored.liquidity) / stored.liquidity;
    // Normalize: -5% change = 0.5 score, -10% = 1.0
    if (change >= 0)
        return 0; // No drainage
    if (change < -0.20)
        return 1.0; // Cap at -20%
    return Math.abs(change) / 0.10;
}
// ============================================================================
// MARKET LAYER AGGREGATOR
// ============================================================================
/**
 * Aggregates all 4 market signals into a single layer score.
 *
 * @param dexData - DexScreener pair data
 * @param mint - Token mint for liquidity tracking
 * @returns MarketLayer with score and individual signals
 */
export async function calculateMarketLayer(dexData, mint) {
    // Calculate individual signals
    const signals = {
        sellAcceleration: calculateSellAcceleration(dexData),
        buySellImbalance: calculateBuySellImbalance(dexData),
        volumePriceDivergence: calculateVolumePriceDivergence(dexData),
        liquidityDrainage: calculateLiquidityDrainage(mint, dexData.liquidity?.usd || 0)
    };
    // Weight distribution for market signals
    // Sell acceleration is most predictive for dumps
    const score = (signals.sellAcceleration * 0.35 + // 35% - most important
        signals.buySellImbalance * 0.25 + // 25% - strong signal
        signals.volumePriceDivergence * 0.25 + // 25% - distribution detection
        signals.liquidityDrainage * 0.15 // 15% - less common but serious
    );
    // Confidence based on data availability
    const confidence = Math.min(1.0, ((dexData.txns.m5.buys + dexData.txns.m5.sells > 10 ? 0.3 : 0) +
        (dexData.volume.h1 > 1000 ? 0.3 : 0) +
        (dexData.liquidity?.usd > 10000 ? 0.2 : 0) +
        0.2 // Base confidence
    ));
    return {
        score: Math.min(0.99, score),
        confidence,
        signals
    };
}
// ============================================================================
// QUICK SIGNAL CHECK
// ============================================================================
/**
 * Quick check for severe market signals.
 * Used for rapid screening.
 */
export function hasSevereMarketSignal(layer) {
    return (layer.signals.sellAcceleration > 0.8 ||
        layer.signals.buySellImbalance > 0.70 ||
        layer.signals.volumePriceDivergence > 0.8 ||
        layer.signals.liquidityDrainage > 0.6);
}
