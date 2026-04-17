/**
 * DexScreener API Integration
 * Ermöglicht Live-Monitoring von SPL Tokens
 */
const BASE_URL = 'https://api.dexscreener.com';
export class DexScreenerService {
    cache = new Map();
    cacheTimeout = 60000; // 1 minute
    /**
     * Fetch top boosted tokens on Solana
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
     * Search tokens by query
     */
    async searchTokens(query) {
        try {
            const response = await fetch(`${BASE_URL}/latest/dex/search?q=${encodeURIComponent(query)}&chainId=solana`);
            if (!response.ok)
                throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            return (data.pairs || []);
        }
        catch (error) {
            console.error('[DexScreener] searchTokens error:', error);
            return [];
        }
    }
    /**
     * Get token profiles (newest tokens)
     */
    async getTokenProfiles(limit = 50) {
        try {
            const response = await fetch(`${BASE_URL}/token-profiles/latest/v1?chain=solana`);
            if (!response.ok)
                throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            return (data.tokens || []).slice(0, limit);
        }
        catch (error) {
            console.error('[DexScreener] getTokenProfiles error:', error);
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
            // DexScreener expects comma-separated mints
            const mintsParam = mints.join(',');
            const response = await fetch(`${BASE_URL}/latest/dex/tokens/${mintsParam}`);
            if (!response.ok)
                throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            // Parse pairs into token info
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
        // Check cache
        const cached = this.cache.get('topTokens');
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data.slice(0, limit);
        }
        try {
            // 1. Get top boosted tokens
            const boosted = await this.getTopBoostedTokens(200);
            const mints = boosted.map(t => t.tokenAddress).filter(Boolean);
            // 2. Get enriched data
            const tokens = await this.getTokenData(mints);
            // 3. Cache result
            this.cache.set('topTokens', { data: tokens, timestamp: Date.now() });
            return tokens.slice(0, limit);
        }
        catch (error) {
            console.error('[DexScreener] getTopSplTokens error:', error);
            return [];
        }
    }
    /**
     * Filter tokens suitable for shorting (high volatility, good liquidity)
     * AGGRESSIVE PRE-FILTER for ranking system
     *
     * Ziel: Statt 59 Coins → 200+ analysieren und auf Top 10-20 reduzieren
     * Helius/Chainstack werden NUR für diese Top 10-20 Coins verwendet
     */
    async getShortableTokens(minLiquidity = 10000, minVolume = 100000, maxCandidates = 50) {
        const tokens = await this.getTopSplTokens(200);
        return tokens.filter(t => t.liquidity >= minLiquidity &&
            t.volume24h >= minVolume &&
            t.price > 0).sort((a, b) => {
            //综合评分：负波动 + 高成交量 + 合理市值
            const scoreA = Math.abs(a.priceChange24h) * Math.log(a.volume24h + 1);
            const scoreB = Math.abs(b.priceChange24h) * Math.log(b.volume24h + 1);
            return scoreB - scoreA;
        }).slice(0, maxCandidates);
    }
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
    async getTopShortCandidates(maxResults = 100) {
        // Get top 200 boosted tokens
        const boosted = await this.getTopBoostedTokens(200);
        const mints = boosted.map(t => t.tokenAddress).filter(Boolean);
        // Get enriched data for ALL 200
        const tokens = await this.getTokenData(mints);
        // AGGRESSIVE PRE-FILTER
        const filtered = tokens.filter(t => t.liquidity >= 10000 && // Min $10k liquidity
            t.volume24h >= 100000 && // Min $100k daily volume
            t.priceChange24h < 0 && // Already declining = short potential
            t.marketCap >= 1000 && // Min $1k market cap
            t.price > 0 // Valid price
        );
        // Sort by short-signal potential
        return filtered
            .sort((a, b) => {
            // Score = |24h change| × log(volume) × market_cap_factor
            const volumeFactor = Math.log(a.volume24h + 1) / Math.log(b.volume24h + 1);
            const changeA = Math.abs(a.priceChange24h);
            const changeB = Math.abs(b.priceChange24h);
            return (changeA * volumeFactor) - (changeB * volumeFactor);
        })
            .slice(0, maxResults);
    }
    /**
     * Get new meme coins with potential
     */
    async getNewMemeCoins(limit = 50) {
        try {
            const profiles = await this.getTokenProfiles(100);
            const mints = profiles.map(p => p.tokenAddress);
            const tokens = await this.getTokenData(mints);
            return tokens
                .filter(t => t.priceChange24h < 0) // Declining = short opportunity
                .sort((a, b) => b.volume24h - a.volume24h)
                .slice(0, limit);
        }
        catch (error) {
            console.error('[DexScreener] getNewMemeCoins error:', error);
            return [];
        }
    }
}
// Singleton instance
export const dexScreener = new DexScreenerService();
// CLI test
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
    (async () => {
        console.log('=== DexScreener Test ===\n');
        const service = new DexScreenerService();
        // Test 1: Top Boosted
        console.log('1. Top Boosted Tokens:');
        const boosted = await service.getTopBoostedTokens(10);
        boosted.forEach((t, i) => {
            console.log(`   ${i + 1}. ${t.tokenAddress.slice(0, 20)}... (Boost Rank: ${t.boost?.rank || 'N/A'})`);
        });
        // Test 2: Top SPL with data
        console.log('\n2. Top SPL Tokens (with price data):');
        const tokens = await service.getTopSplTokens(20);
        tokens.slice(0, 10).forEach((t, i) => {
            console.log(`   ${i + 1}. ${t.symbol}: $${t.price.toFixed(6)} | Vol: $${(t.volume24h / 1000).toFixed(0)}K | Liq: $${(t.liquidity / 1000).toFixed(0)}K | 24h: ${t.priceChange24h.toFixed(1)}%`);
        });
        // Test 3: Shortable tokens
        console.log('\n3. Best Short Candidates:');
        const shortable = await service.getShortableTokens();
        shortable.slice(0, 10).forEach((t, i) => {
            console.log(`   ${i + 1}. ${t.symbol}: ${t.priceChange24h.toFixed(1)}% | Liq: $${(t.liquidity / 1000).toFixed(0)}K`);
        });
        console.log('\n=== Test Complete ===');
        process.exit(0);
    })();
}
//# sourceMappingURL=dexscreener-service.js.map