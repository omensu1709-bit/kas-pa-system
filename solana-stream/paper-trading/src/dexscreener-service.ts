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
  links?: Array<{ url: string; type: string }>;
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
    m5: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h24: { buys: number; sells: number };
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

const BASE_URL = 'https://api.dexscreener.com';

export class DexScreenerService {
  private cache: Map<string, { data: DexScreenerTokenInfo[]; timestamp: number }> = new Map();
  private cacheTimeout = 60000; // 1 minute

  /**
   * Fetch top boosted tokens on Solana
   */
  async getTopBoostedTokens(limit = 50): Promise<DexScreenerToken[]> {
    try {
      const response = await fetch(`${BASE_URL}/token-boosts/top/v1?chain=solana`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return (data as DexScreenerToken[]).slice(0, limit);
    } catch (error) {
      console.error('[DexScreener] getTopBoostedTokens error:', error);
      return [];
    }
  }

  /**
   * Search tokens by query
   */
  async searchTokens(query: string): Promise<DexScreenerPair[]> {
    try {
      const response = await fetch(
        `${BASE_URL}/latest/dex/search?q=${encodeURIComponent(query)}&chainId=solana`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as any;
      return (data.pairs || []) as DexScreenerPair[];
    } catch (error) {
      console.error('[DexScreener] searchTokens error:', error);
      return [];
    }
  }

  /**
   * Get token profiles (newest tokens)
   */
  async getTokenProfiles(limit = 50): Promise<DexScreenerToken[]> {
    try {
      const response = await fetch(`${BASE_URL}/token-profiles/latest/v1?chain=solana`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as any;
      return (data.tokens || []).slice(0, limit);
    } catch (error) {
      console.error('[DexScreener] getTokenProfiles error:', error);
      return [];
    }
  }

  /**
   * Get enriched token data with price/volume info
   * Uses BATCH PROCESSING to avoid HTTP 400 errors
   */
  async getTokenData(mints: string[]): Promise<DexScreenerTokenInfo[]> {
    if (mints.length === 0) return [];

    const allTokens: DexScreenerTokenInfo[] = [];
    const BATCH_SIZE = 20; // DexScreener limit
    
    console.log(`[DexScreener] Fetching ${mints.length} tokens in batches of ${BATCH_SIZE}...`);

    // Process in batches
    for (let i = 0; i < mints.length; i += BATCH_SIZE) {
      const batch = mints.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(mints.length / BATCH_SIZE);
      
      try {
        const mintsParam = batch.join(',');
        const response = await fetch(
          `${BASE_URL}/latest/dex/tokens/${mintsParam}`
        );
        
        if (!response.ok) {
          console.error(`[DexScreener] Batch ${batchNum}/${totalBatches} failed: HTTP ${response.status}`);
          continue;
        }
        
        const data = await response.json() as any;
        const tokenMap = new Map<string, DexScreenerTokenInfo>();

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

        const batchTokens = Array.from(tokenMap.values());
        allTokens.push(...batchTokens);
        
        console.log(`[DexScreener] Batch ${batchNum}/${totalBatches}: ${batchTokens.length} tokens fetched`);
        
        // Rate limiting: small delay between batches
        if (i + BATCH_SIZE < mints.length) {
          await new Promise(resolve => setTimeout(resolve, 250));
        }
      } catch (error) {
        console.error(`[DexScreener] Batch ${batchNum}/${totalBatches} error:`, error);
      }
    }

    console.log(`[DexScreener] Total fetched: ${allTokens.length}/${mints.length} tokens`);
    return allTokens;
  }

  /**
   * Get top SPL tokens with full data
   */
  async getTopSplTokens(limit = 100): Promise<DexScreenerTokenInfo[]> {
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
    } catch (error) {
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
  async getShortableTokens(
    minLiquidity = 10000,
    minVolume = 100000,
    maxCandidates = 50
  ): Promise<DexScreenerTokenInfo[]> {
    const tokens = await this.getTopSplTokens(200);

    return tokens.filter(t =>
      t.liquidity >= minLiquidity &&
      t.volume24h >= minVolume &&
      t.price > 0
    ).sort((a, b) => {
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
  /**
   * Get top short candidates - ULTRA-RELAXED FILTERS
   * 
   * Maximale Coverage durch sehr niedrige Schwellenwerte.
   * Kombiniert boosted + recent tokens für größtmöglichen Pool.
   */
  async getTopShortCandidates(maxResults = 100): Promise<DexScreenerTokenInfo[]> {
    // Get multiple sources for maximum pool
    const [boosted, recent] = await Promise.all([
      this.getTopBoostedTokens(50),   // ~30 tokens from API
      this.getRecentTokens(50)         // ~50 tokens from API
    ]);

    console.log(`[DexScreener] Pool: ${boosted.length} boosted + ${recent.length} recent`);

    // Combine and dedupe
    const allMints = new Set<string>();
    boosted.forEach(t => { if (t.tokenAddress) allMints.add(t.tokenAddress); });
    recent.forEach((t: any) => { if (t.tokenAddress) allMints.add(t.tokenAddress); });

    console.log(`[DexScreener] Unique mints: ${allMints.size}`);

    // Get enriched data
    const tokens = await this.getTokenData(Array.from(allMints));

    console.log(`[DexScreener] Got data for ${tokens.length} tokens`);

    // ULTRA-RELAXED PRE-FILTER
    const filtered = tokens.filter(t =>
      t.liquidity >= 1000 &&           // Min $1k liquidity (ultra low)
      t.volume24h >= 10000 &&          // Min $10k daily volume (ultra low)
      t.priceChange24h < 0 &&          // Already declining = short potential
      t.marketCap >= 100 &&            // Min $100 market cap (ultra low)
      t.price > 0 &&                   // Valid price
      t.price < 1                      // Focus on micro-caps
    );

    console.log(`[DexScreener] After filters: ${filtered.length} candidates`);

    // Sort by short-signal potential
    return filtered
      .sort((a, b) => {
        // Score = |24h change| × volume × liquidity
        const scoreA = 
          Math.abs(a.priceChange24h) * 0.5 +
          Math.log(a.volume24h + 1) * 0.3 +
          Math.log(a.liquidity + 1) * 0.2;
        const scoreB = 
          Math.abs(b.priceChange24h) * 0.5 +
          Math.log(b.volume24h + 1) * 0.3 +
          Math.log(b.liquidity + 1) * 0.2;
        return scoreB - scoreA;
      })
      .slice(0, maxResults);
  }

  /**
   * Get recent token profiles - ADDITIONAL SOURCE
   */
  async getRecentTokens(limit = 50): Promise<any[]> {
    try {
      const response = await fetch(`${BASE_URL}/token-profiles/latest/v1?chain=solana`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as any;
      const tokens = Array.isArray(data) ? data : (data.tokens || []);
      return tokens.slice(0, limit);
    } catch (error) {
      console.error('[DexScreener] getRecentTokens error:', error);
      return [];
    }
  }

  /**
   * Get new meme coins with potential
   */
  async getNewMemeCoins(limit = 50): Promise<DexScreenerTokenInfo[]> {
    try {
      const profiles = await this.getTokenProfiles(100);
      const mints = profiles.map(p => p.tokenAddress);

      const tokens = await this.getTokenData(mints);

      return tokens
        .filter(t => t.priceChange24h < 0) // Declining = short opportunity
        .sort((a, b) => b.volume24h - a.volume24h)
        .slice(0, limit);
    } catch (error) {
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
