/**
 * DexScreener Collector - Local data fetching
 * 
 * Fetches token data from DexScreener API.
 * Used by the short-predictor system.
 */

import axios from 'axios';

const BASE_URL = 'https://api.dexscreener.com';

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

export class DexScreenerCollector {
  private cache: Map<string, { data: DexScreenerTokenInfo[]; timestamp: number }> = new Map();
  private cacheTimeout = 30000; // 30 seconds

  /**
   * Get top boosted tokens on Solana
   */
  async getTopBoostedTokens(limit = 50): Promise<any[]> {
    try {
      const response = await fetch(`${BASE_URL}/token-boosts/top/v1?chain=solana`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      // API returns max ~30-50 tokens, not 200
      return (data as any[]).slice(0, limit);
    } catch (error) {
      console.error('[DexScreener] getTopBoostedTokens error:', error);
      return [];
    }
  }

  /**
   * Get enriched token data with price/volume info
   */
  async getTokenData(mints: string[]): Promise<DexScreenerTokenInfo[]> {
    if (mints.length === 0) return [];

    try {
      const mintsParam = mints.join(',');
      const response = await fetch(
        `${BASE_URL}/latest/dex/tokens/${mintsParam}`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

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

      return Array.from(tokenMap.values());
    } catch (error) {
      console.error('[DexScreener] getTokenData error:', error);
      return [];
    }
  }

  /**
   * Get top SPL tokens with full data
   */
  async getTopSplTokens(limit = 100): Promise<DexScreenerTokenInfo[]> {
    const cached = this.cache.get('topTokens');
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data.slice(0, limit);
    }

    try {
      const boosted = await this.getTopBoostedTokens(200);
      const mints = boosted.map((t: any) => t.tokenAddress).filter(Boolean);
      const tokens = await this.getTokenData(mints);
      this.cache.set('topTokens', { data: tokens, timestamp: Date.now() });
      return tokens.slice(0, limit);
    } catch (error) {
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
  async getRecentTokens(limit = 50): Promise<DexScreenerTokenInfo[]> {
    try {
      const response = await fetch(
        `${BASE_URL}/token-profiles/latest/v1?chain=solana`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      
      // API returns array directly, not { tokens: [] }
      const tokens = Array.isArray(data) ? data : (data.tokens || []);
      const mints = tokens.slice(0, limit).map((t: any) => t.tokenAddress).filter(Boolean);
      
      if (mints.length === 0) return [];
      
      return await this.getTokenData(mints);
    } catch (error) {
      console.error('[DexScreener] getRecentTokens error:', error);
      return [];
    }
  }

  /**
   * Get top short candidates - MAXIMUM COVERAGE
   * 
   * Combines multiple sources for maximum token pool:
   * - 30 Boosted tokens (DexScreener limits this)
   * - 50 Recent token profiles
   * - Total pool: ~80 tokens before filtering
   * 
   * Filters for short-suitable tokens with VERY relaxed thresholds.
   */
  async getTopShortCandidates(maxResults = 50): Promise<DexScreenerTokenInfo[]> {
    // Get all available tokens from multiple sources
    const [boosted, recent] = await Promise.all([
      this.getTopBoostedTokens(50),    // Gets max ~30 from API
      this.getRecentTokens(50)          // Gets max ~50 from API
    ]);

    console.log(`[DexScreener] Pool: ${boosted.length} boosted + ${recent.length} recent = ${boosted.length + recent.length} total`);

    // Combine pools and dedupe
    const allMints = new Set<string>();
    boosted.forEach((t: any) => { if (t.tokenAddress) allMints.add(t.tokenAddress); });
    recent.forEach((t: any) => { if (t.address) allMints.add(t.address); });

    console.log(`[DexScreener] Unique mints: ${allMints.size}`);

    const tokens = await this.getTokenData(Array.from(allMints));

    console.log(`[DexScreener] Got data for ${tokens.length} tokens`);

    // ULTRA-RELAXED FILTERS for maximum candidates
    // These are MINIMUM thresholds - we want as many as possible
    const filtered = tokens.filter(t =>
      t.liquidity >= 1000 &&         // Min $1k (ultra low)
      t.volume24h >= 10000 &&        // Min $10k (ultra low)
      t.priceChange24h < 0 &&        // Already declining = short potential
      t.marketCap >= 100 &&          // Min $100 (ultra low)
      t.price > 0 &&                 // Valid price
      t.price < 1                    // Focus on micro-caps (< $1)
    );

    console.log(`[DexScreener] After filters: ${filtered.length} candidates`);

    // Score by short potential: |24h change| * volume * liquidity
    return filtered
      .sort((a, b) => {
        const scoreA = 
          Math.abs(a.priceChange24h) * 0.5 +           // Fall strength (50%)
          Math.log(a.volume24h + 1) * 0.3 +            // Volume (30%)
          Math.log(a.liquidity + 1) * 0.2;             // Liquidity (20%)
        const scoreB = 
          Math.abs(b.priceChange24h) * 0.5 +
          Math.log(b.volume24h + 1) * 0.3 +
          Math.log(b.liquidity + 1) * 0.2;
        return scoreB - scoreA;
      })
      .slice(0, maxResults);
  }
}

// Singleton
export const dexScreenerCollector = new DexScreenerCollector();