/**
 * DexScreener API Integration
 * Ermöglicht Live-Monitoring von SPL Tokens
 */
interface DexScreenerToken {
    tokenAddress: string;
    chainId: string;
    url: string;
    icon?: string;
    header?: string;
    openGraph?: string;
    links?: Array<{
        url: string;
        type: string;
    }>;
    boost?: {
        rank: number;
        level: number;
    };
}
interface DexScreenerPair {
    chainId: string;
    dexId: string;
    url: string;
    pairAddress: string;
    baseToken: {
        address: string;
        name: string;
        symbol: string;
    };
    quoteToken: {
        address: string;
        name: string;
        symbol: string;
    };
    priceNative: string;
    priceUsd: string;
    txns: {
        m5: {
            buys: number;
            sells: number;
        };
        h1: {
            buys: number;
            sells: number;
        };
        h6: {
            buys: number;
            sells: number;
        };
        h24: {
            buys: number;
            sells: number;
        };
    };
    volume: {
        h24: number;
        h6: number;
        h1: number;
        m5: number;
    };
    priceChange: {
        m5: number;
        h1: number;
        h6: number;
        h24: number;
    };
    liquidity: {
        usd: number;
        base: number;
        quote: number;
    };
    fdv: number;
    marketCap: number;
}
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
export declare class DexScreenerService {
    private cache;
    private cacheTimeout;
    /**
     * Fetch top boosted tokens on Solana
     */
    getTopBoostedTokens(limit?: number): Promise<DexScreenerToken[]>;
    /**
     * Search tokens by query
     */
    searchTokens(query: string): Promise<DexScreenerPair[]>;
    /**
     * Get token profiles (newest tokens)
     */
    getTokenProfiles(limit?: number): Promise<DexScreenerToken[]>;
    /**
     * Get enriched token data with price/volume info
     */
    getTokenData(mints: string[]): Promise<DexScreenerTokenInfo[]>;
    /**
     * Get top SPL tokens with full data
     */
    getTopSplTokens(limit?: number): Promise<DexScreenerTokenInfo[]>;
    /**
     * Filter tokens suitable for shorting (high volatility, good liquidity)
     * AGGRESSIVE PRE-FILTER for ranking system
     *
     * Ziel: Statt 59 Coins → 200+ analysieren und auf Top 10-20 reduzieren
     * Helius/Chainstack werden NUR für diese Top 10-20 Coins verwendet
     */
    getShortableTokens(minLiquidity?: number, minVolume?: number, maxCandidates?: number): Promise<DexScreenerTokenInfo[]>;
    /**
     * Get Top Short Candidates - Primary Filter for Ranking
     * Returns pre-screened tokens ready for full crash detection analysis
     *
     * Criteria:
     * - Liquidity >= $10,000
     * - Volume >= $100,000 (24h)
     * - Already declining (priceChange24h < 0)
     * - Market Cap >= $1,000
     */
    getTopShortCandidates(maxResults?: number): Promise<DexScreenerTokenInfo[]>;
    /**
     * Get new meme coins with potential
     */
    getNewMemeCoins(limit?: number): Promise<DexScreenerTokenInfo[]>;
}
export declare const dexScreener: DexScreenerService;
export {};
//# sourceMappingURL=dexscreener-service.d.ts.map