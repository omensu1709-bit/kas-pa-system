/**
 * DexScreener Collector - Local data fetching
 *
 * Fetches token data from DexScreener API.
 * Used by the short-predictor system.
 */
const BASE_URL = 'https://api.dexscreener.com';
export class DexScreenerCollector {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 30000; // 30 seconds
    }
    /**
     * Get top boosted tokens on Solana
     */
    async getTopBoostedTokens(limit = 50) {
        try {
            const response = await fetch(`${BASE_URL}/token-boosts/top/v1?chain=solana`);
            if (!response.ok)
                throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            return data.slice(0, limit);
        }
        catch (error) {
            console.error('[DexScreener] getTopBoostedTokens error:', error);
            return [];
        }
    }
    /**
     * Get enriched token data with price/volume info
     */
    async getTokenData(mints) {
        if (mints.length === 0)
            return [];
        try {
            const mintsParam = mints.join(',');
            const response = await fetch(`${BASE_URL}/latest/dex/tokens/${mintsParam}`);
            if (!response.ok)
                throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            const tokenMap = new Map();
            for (const pair of data.pairs || []) {
                const addr = pair.baseToken.address.toLowerCase();
                if (!tokenMap.has(addr)) {
                    tokenMap.set(addr, {
                        address: pair.baseToken.address,
                        symbol: pair.baseToken.symbol,
                        name: pair.baseToken.name,
                        price: parseFloat(pair.priceUsd) || 0,
                        priceChange24h: pair.priceChange?.h24 || 0,
                        liquidity: pair.liquidity?.usd || 0,
                        volume24h: pair.volume?.h24 || 0,
                        txns24h: (pair.txns?.h24?.buys || 0) + (pair.txns?.h24?.sells || 0),
                        marketCap: pair.marketCap || 0,
                        chainId: pair.chainId,
                        dexId: pair.dexId,
                    });
                }
            }
            return Array.from(tokenMap.values());
        }
        catch (error) {
            console.error('[DexScreener] getTokenData error:', error);
            return [];
        }
    }
    /**
     * Get top SPL tokens with full data
     */
    async getTopSplTokens(limit = 100) {
        const cached = this.cache.get('topTokens');
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data.slice(0, limit);
        }
        try {
            const boosted = await this.getTopBoostedTokens(200);
            const mints = boosted.map((t) => t.tokenAddress).filter(Boolean);
            const tokens = await this.getTokenData(mints);
            this.cache.set('topTokens', { data: tokens, timestamp: Date.now() });
            return tokens.slice(0, limit);
        }
        catch (error) {
            console.error('[DexScreener] getTopSplTokens error:', error);
            return [];
        }
    }
    /**
     * Get additional tokens from recent search - EXPANDED POOL
     *
     * Supplements boosted tokens with recently active tokens
     * for maximum coverage of short candidates.
     */
    async getRecentTokens(limit = 50) {
        try {
            const response = await fetch(`${BASE_URL}/token-profiles/latest/v1?chain=solana`);
            if (!response.ok)
                throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            const tokens = data.tokens || [];
            const mints = tokens.slice(0, limit).map((t) => t.tokenAddress).filter(Boolean);
            if (mints.length === 0)
                return [];
            return await this.getTokenData(mints);
        }
        catch (error) {
            console.error('[DexScreener] getRecentTokens error:', error);
            return [];
        }
    }
    /**
     * Get top short candidates - MAXIMUM COVERAGE
     *
     * Filters for short-suitable tokens with relaxed thresholds
     * to maximize the number of candidates for analysis.
     */
    async getTopShortCandidates(maxResults = 50) {
        // Get 200 boosted tokens + recent tokens for maximum coverage
        const [boosted, recent] = await Promise.all([
            this.getTopBoostedTokens(200),
            this.getRecentTokens(100)
        ]);
        // Combine pools and dedupe
        const allMints = new Set();
        boosted.forEach((t) => { if (t.tokenAddress)
            allMints.add(t.tokenAddress); });
        recent.forEach((t) => { if (t.address)
            allMints.add(t.address); });
        const tokens = await this.getTokenData(Array.from(allMints));
        // RELAXED FILTERS for maximum candidates
        const filtered = tokens.filter(t => t.liquidity >= 2000 && // Min $2k (relaxed from $10k)
            t.volume24h >= 25000 && // Min $25k (relaxed from $100k)
            t.priceChange24h < 0 && // Already declining = short potential
            t.marketCap >= 500 && // Min $500 (relaxed from $1000)
            t.price > 0 // Valid price
        );
        // Score by short potential: |24h change| * log(volume)
        return filtered
            .sort((a, b) => {
            const scoreA = Math.abs(a.priceChange24h) * Math.log(a.volume24h + 1);
            const scoreB = Math.abs(b.priceChange24h) * Math.log(b.volume24h + 1);
            return scoreB - scoreA;
        })
            .slice(0, maxResults);
    }
}
// Singleton
export const dexScreenerCollector = new DexScreenerCollector();
