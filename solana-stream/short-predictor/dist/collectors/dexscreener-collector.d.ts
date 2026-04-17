/**
 * DexScreener Collector - Local data fetching
 *
 * Fetches token data from DexScreener API.
 * Used by the short-predictor system.
 */
export interface DexScreenerTokenInfo {
    address: string;
    symbol: string;
    name: string;
    price: number;
    priceChange24h: number;
    liquidity: number;
    volume24h: number;
    txns24h: number;
    marketCap: number;
    chainId: string;
    dexId: string;
}
export declare class DexScreenerCollector {
    private cache;
    private cacheTimeout;
    /**
     * Get top boosted tokens on Solana
     */
    getTopBoostedTokens(limit?: number): Promise<any[]>;
    /**
     * Get enriched token data with price/volume info
     */
    getTokenData(mints: string[]): Promise<DexScreenerTokenInfo[]>;
    /**
     * Get top SPL tokens with full data
     */
    getTopSplTokens(limit?: number): Promise<DexScreenerTokenInfo[]>;
    /**
     * Get additional tokens from recent search - EXPANDED POOL
     *
     * Supplements boosted tokens with recently active tokens
     * for maximum coverage of short candidates.
     */
    getRecentTokens(limit?: number): Promise<DexScreenerTokenInfo[]>;
    /**
     * Get top short candidates - MAXIMUM COVERAGE
     *
     * Filters for short-suitable tokens with relaxed thresholds
     * to maximize the number of candidates for analysis.
     */
    getTopShortCandidates(maxResults?: number): Promise<DexScreenerTokenInfo[]>;
}
export declare const dexScreenerCollector: DexScreenerCollector;
