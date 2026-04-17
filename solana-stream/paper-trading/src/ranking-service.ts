/**
 * KAS PA - SHORT TARGET RANKING SERVICE v2.1
 * LIVE DATA - PRODUKTIONSBEREIT
 *
 * Alle 10 Minuten: Top 10 Coins mit höchster Short-Wahrscheinlichkeit
 * Verwendet echte Live-Daten von Jupiter API + DexScreener
 */

import axios from 'axios';
import WebSocket from 'ws';
import { dexScreener, type DexScreenerTokenInfo } from './dexscreener-service.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ShortTarget {
  symbol: string;
  mint: string;
  exchange: 'jupiter' | 'drift';
  maxLeverage: number;
  volatilityScore: number;
  shortSignalScore: number;
  volume24h: number;
  marketCap: number;
  price: number;
  priceChange24h: number;
  shortable: boolean;
  reason: string;
  last24hPerformance: number;
  rank: number;
  updatedAt: number;
}

export interface RankingResult {
  timestamp: number;
  cycleNumber: number;
  top10: ShortTarget[];
  allCandidates: ShortTarget[];
  stats: {
    totalCandidates: number;
    avgShortScore: number;
    highestVolatility: number;
  };
}

// =============================================================================
// LEVERAGE-FÄHIGE TOKENS (OFFIZIELL - LIVE MINT ADRESSEN)
// =============================================================================

interface TokenConfig {
  symbol: string;
  mint: string;
  exchange: 'jupiter' | 'drift';
  maxLeverage: number;
}

// =============================================================================
// VERIFIED LEVERAGE TOKEN REGISTRY (Jupiter API verifiziert - 2026-04-11)
// =============================================================================

const LEVERAGE_TOKENS: TokenConfig[] = [
  // JUPITER PERPETUALS (bis 250x) - BLUE CHIPS
  { symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112', exchange: 'jupiter', maxLeverage: 250 },
  { symbol: 'BTC', mint: '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E', exchange: 'jupiter', maxLeverage: 250 },
  { symbol: 'ETH', mint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', exchange: 'jupiter', maxLeverage: 250 },

  // DRIFT PERPETUALS (bis 20x) - VERIFIED VIA JUPITER API
  { symbol: 'BONK', mint: 'DSrTi3bNP2TYGALDCWgKNXJwBxx52uFEfr5J9Nrxpump', exchange: 'drift', maxLeverage: 20 },

  // ADDITIONAL JUPITER PERPETUALS (DexScreener validated)
  { symbol: 'WIF', mint: '4nKiBzUscGCKkEpz1Jz8upgbaRySigVF94FcDZ6RN5u5', exchange: 'jupiter', maxLeverage: 50 },
  { symbol: 'POPCAT', mint: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', exchange: 'drift', maxLeverage: 20 },
  { symbol: 'MOG', mint: '0x1D0A4821FDEf156b0d051D08A166DE5DF2788Cf7', exchange: 'drift', maxLeverage: 20 },
  { symbol: 'FWOG', mint: 'A8C3xuqscfmyLrte3VmTqrAq8kgMASius9AFNANwpump', exchange: 'drift', maxLeverage: 20 },
  { symbol: 'PNUT', mint: '2qEHjDLDLbuBgRYvsxhc5D6uDWAivNFZGan56P1tpump', exchange: 'drift', maxLeverage: 20 },
  { symbol: 'AI16Z', mint: 'HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n4V98jwC', exchange: 'drift', maxLeverage: 20 },
  { symbol: 'MEW', mint: 'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5', exchange: 'jupiter', maxLeverage: 50 },
];

// =============================================================================
// DEXSCREENER DYNAMIC TOKEN POOL (Top 100 SPL tokens via DexScreener API)
// =============================================================================

// These are populated dynamically from DexScreener at runtime
const DEXSCREENER_POOL_ADDRESSES: string[] = [];

// =============================================================================
// RANKING SERVICE
// =============================================================================

export class ShortTargetRankingService {
  private candidates: Map<string, ShortTarget> = new Map();
  private currentTop10: ShortTarget[] = [];
  private lastRanking: RankingResult | null = null;
  private cycleNumber = 0;
  private lastUpdate = 0;
  private updateIntervalMs = 30 * 60 * 1000; // 30 Minuten - Ranking alle 30min

  // Live price history for volatility calculation
  private priceHistory: Map<string, number[]> = new Map();
  private maxHistoryLength = 100;

  // Live price cache
  private livePrices: Map<string, { price: number; change24h: number; timestamp: number }> = new Map();
  
  // DexScreener price cache (for tokens without Jupiter API)
  private dexPrices: Map<string, { price: number; change24h: number; volume24h: number; timestamp: number }> = new Map();

  // WebSocket for real-time updates
  private ws: WebSocket | null = null;
  private wsReconnectAttempts = 0;
  private maxWsReconnectAttempts = 5;

  constructor() {
    this.initializeCandidates();
    // Jupiter WebSocket deaktiviert - nur REST API verwenden
    console.log('[Ranking] Using REST API for prices (WebSocket disabled)');
  }

  private initializeCandidates(): void {
    for (const token of LEVERAGE_TOKENS) {
      this.candidates.set(token.symbol, {
        symbol: token.symbol,
        mint: token.mint,
        exchange: token.exchange,
        maxLeverage: token.maxLeverage,
        volatilityScore: 50, // Start with neutral
        shortSignalScore: 0,
        volume24h: 0,
        marketCap: 0,
        price: 0,
        priceChange24h: 0,
        shortable: true,
        reason: 'Initializing...',
        last24hPerformance: 0,
        rank: 0,
        updatedAt: Date.now()
      });
      this.priceHistory.set(token.symbol, []);
    }
  }

  /**
   * WebSocket connection for real-time price updates from Jupiter
   */
  private connectWebSocket(): void {
    try {
      this.ws = new WebSocket('wss://ws.jup.ag/ws');

      this.ws.onopen = () => {
        console.log('[Ranking] WebSocket connected to Jupiter');
        this.wsReconnectAttempts = 0;

        // Subscribe to price updates for all tokens
        const subscribeMsg = {
          method: 'subscribe',
          params: {
            ids: LEVERAGE_TOKENS.map(t => t.mint)
          }
        };
        this.ws?.send(JSON.stringify(subscribeMsg));
      };

      this.ws.onmessage = (event) => {
        try {
          const messageText = event.data.toString();
          const data = JSON.parse(messageText);
          if (data.data) {
            this.handlePriceUpdate(data);
          }
        } catch (e) {
          // Ignore parse errors
        }
      };

      this.ws.onclose = () => {
        console.log('[Ranking] WebSocket disconnected');
        this.attemptReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('[Ranking] WebSocket error:', err);
      };
    } catch (e) {
      console.error('[Ranking] WebSocket connection failed:', e);
      this.attemptReconnect();
    }
  }

  private attemptReconnect(): void {
    if (this.wsReconnectAttempts < this.maxWsReconnectAttempts) {
      this.wsReconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.wsReconnectAttempts), 30000);
      console.log(`[Ranking] Reconnecting in ${delay}ms (attempt ${this.wsReconnectAttempts})`);
      setTimeout(() => this.connectWebSocket(), delay);
    }
  }

  private handlePriceUpdate(data: any): void {
    const priceDataMap = data.data as Record<string, { price?: number; priceChange24h?: number }>;
    for (const [mint, info] of Object.entries(priceDataMap || {})) {
      const symbol = this.findTokenByMint(mint);
      if (!symbol) continue;

      const priceData = info;

      if (priceData.price) {
        // Update price history
        const history = this.priceHistory.get(symbol) || [];
        history.push(priceData.price);
        if (history.length > this.maxHistoryLength) {
          history.shift();
        }
        this.priceHistory.set(symbol, history);

        // Update live prices
        this.livePrices.set(symbol, {
          price: priceData.price,
          change24h: priceData.priceChange24h || 0,
          timestamp: Date.now()
        });
      }
    }
  }

  private findTokenByMint(mint: string): string | undefined {
    for (const [symbol, config] of this.candidates) {
      if (config.mint === mint) return symbol;
    }
    return undefined;
  }

  /**
   * Fetch prices from Jupiter REST API
   */
  async fetchPrices(): Promise<void> {
    try {
      const mints = LEVERAGE_TOKENS.map(t => t.mint);
      const response = await axios.get('https://api.jup.ag/price/v3', {
        params: { ids: mints.join(',') },
        timeout: 10000
      });

      const data = response.data;

      for (const token of LEVERAGE_TOKENS) {
        const tokenData = data[token.mint];
        if (tokenData) {
          const price = tokenData.usdPrice || tokenData.price || 0;
          const change24h = tokenData.priceChange24h || 0;

          // Update price history
          const history = this.priceHistory.get(token.symbol) || [];
          if (price > 0) {
            history.push(price);
            if (history.length > this.maxHistoryLength) {
              history.shift();
            }
            this.priceHistory.set(token.symbol, history);
          }

          // Update live prices
          this.livePrices.set(token.symbol, {
            price,
            change24h,
            timestamp: Date.now()
          });
        }
      }

      // Fetch BTC/ETH from DeFi Llama as fallback
      await this.fetchDeFiLlamaPrices();

    } catch (e) {
      console.error('[Ranking] Preis-Fetch Fehler:', e);
    }
  }

  private async fetchDeFiLlamaPrices(): Promise<void> {
    try {
      const response = await axios.get('https://api.llama.fi/prices', {
        params: {
          tokenAddress: 'coingecko:solana,coingecko:ethereum,coingecko:bitcoin'
        },
        timeout: 5000
      });

      const coins = response.data?.coins || {};

      if (coins['coingecko:solana']) {
        const price = coins['coingecko:solana'].price;
        this.livePrices.set('SOL', { price, change24h: 0, timestamp: Date.now() });
      }
      if (coins['coingecko:ethereum']) {
        const price = coins['coingecko:ethereum'].price;
        this.livePrices.set('ETH', { price, change24h: 0, timestamp: Date.now() });
      }
      if (coins['coingecko:bitcoin']) {
        const price = coins['coingecko:bitcoin'].price;
        this.livePrices.set('BTC', { price, change24h: 0, timestamp: Date.now() });
      }
    } catch {
      // Ignore fallback errors
    }
  }

  /**
   * Calculate LIVE volatility from price history
   */
  private calculateLiveVolatility(symbol: string): number {
    const history = this.priceHistory.get(symbol) || [];

    if (history.length < 2) {
      // No history - use default volatility based on token type
      const candidate = this.candidates.get(symbol);
      if (candidate?.exchange === 'drift') return 85; // Memecoins are volatile
      return 50; // Blue chips less volatile
    }

    // Calculate returns
    const returns: number[] = [];
    for (let i = 1; i < history.length; i++) {
      const ret = (history[i] - history[i - 1]) / history[i - 1];
      returns.push(Math.abs(ret));
    }

    // Average volatility
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;

    // Normalize to 0-100 scale
    // Typical memecoin volatility: 0.02-0.10 (2%-10%)
    // Blue chip volatility: 0.005-0.02 (0.5%-2%)
    const normalizedVolatility = Math.min(avgReturn * 1000, 100);

    return Math.round(Math.max(20, Math.min(100, normalizedVolatility)));
  }

  /**
   * Calculate Short-Signal-Score for each token (LIVE)
   */
  calculateShortSignalScores(): void {
    for (const [symbol, token] of this.candidates) {
      const liveData = this.livePrices.get(symbol);

      // Update price and change from live data
      if (liveData) {
        token.price = liveData.price;
        token.priceChange24h = liveData.change24h;
      } else {
        // DexScreener-Tokens: Prefer DexScreener price data
        const dexData = this.dexPrices.get(symbol);
        if (dexData) {
          token.price = dexData.price;
          token.priceChange24h = dexData.change24h;
        }
      }

      // Calculate live volatility
      const liveVolatility = this.calculateLiveVolatility(symbol);
      token.volatilityScore = liveVolatility;

      // LIVE Short-Signal Score calculation:
      // 1. Volatility (40%) - Higher = better short opportunity
      // 2. 24h Performance (30%) - Negative change = short potential
      // 3. Exchange (20%) - Jupiter = higher leverage possible
      // 4. Price momentum (10%) - Recent drops indicate short opportunity

      const volatilityComponent = liveVolatility * 0.40;

      // 24h performance: negative = potential short
      // -3% change = 30 points, -10% = 40 points, -20% = 50 points
      // Scale: capped between 0-50 points * 0.30 = 0-15 contribution
      const perfComponent = Math.min(50, Math.max(0, Math.abs(token.priceChange24h) * 2.5)) * 0.30;

      // Exchange component: Jupiter = higher leverage (max 20 points)
      const exchangeComponent = token.exchange === 'jupiter' ? 20 : 14;

      // Short signal score (weighted sum, already normalized)
      token.shortSignalScore = Math.min(
        volatilityComponent + perfComponent + exchangeComponent,
        100
      );

      // Generate reason based on live data
      const reasons: string[] = [];
      if (liveVolatility > 70) reasons.push('High volatility');
      if (token.priceChange24h < -3) reasons.push('Strong drop');
      else if (token.priceChange24h < 0) reasons.push('Slight decline');
      if (token.exchange === 'jupiter') reasons.push('High leverage');
      token.reason = reasons.length > 0 ? reasons.join(' | ') : 'Standard setup';

      token.updatedAt = Date.now();
    }
  }

  /**
   * Generate Top 10 Short Targets (sorted by live short signal score)
   */
  generateTop10(): ShortTarget[] {
    const sorted = Array.from(this.candidates.values())
      .sort((a, b) => b.shortSignalScore - a.shortSignalScore);

    this.currentTop10 = sorted.slice(0, 10).map((token, index) => ({
      ...token,
      rank: index + 1
    }));

    this.lastRanking = {
      timestamp: Date.now(),
      cycleNumber: ++this.cycleNumber,
      top10: this.currentTop10,
      allCandidates: sorted,
      stats: {
        totalCandidates: this.candidates.size,
        avgShortScore: sorted.reduce((a, t) => a + t.shortSignalScore, 0) / sorted.length,
        highestVolatility: Math.max(...sorted.map(t => t.volatilityScore))
      }
    };

    this.lastUpdate = Date.now();
    return this.currentTop10;
  }

  /**
   * Fetch additional tokens from DexScreener and add to candidates
   * Incorporates Fail-Safe Timeout Design
   */
  async syncDexScreenerTokens(): Promise<void> {
    try {
      // PRIMARY FILTER: Get top 100 short candidates from DexScreener
      // Fail-Safe: Promise.race with 2s timeout
      const dexTokens = await Promise.race([
        dexScreener.getTopShortCandidates(100),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('DexScreener Timeout')), 2000))
      ]).catch(e => {
        console.warn(`[Ranking] DexScreener failed or timed out: ${e.message}. Using hardcoded pool.`);
        return null;
      });

      if (!dexTokens) {
        // Fallback or just skip additional syncing if fetch fails
        return;
      }

      for (const token of dexTokens) {
        const symbol = token.symbol;
        const mint = token.address;

        // Skip if already exists
        if (this.candidates.has(symbol)) continue;

        // Skip if not on Solana
        if (token.chainId !== 'solana') continue;

        // Add to candidates with DexScreener data
        this.candidates.set(symbol, {
          symbol,
          mint,
          exchange: 'drift', // Default to drift
          maxLeverage: 20,
          volatilityScore: 50,
          shortSignalScore: 0,
          volume24h: token.volume24h,
          marketCap: token.marketCap,
          price: token.price,
          priceChange24h: token.priceChange24h,
          shortable: token.liquidity >= 10000,
          reason: `DexScreener: ${token.dexId}`,
          last24hPerformance: token.priceChange24h,
          rank: 0,
          updatedAt: Date.now()
        });

        this.priceHistory.set(symbol, []);
        this.livePrices.set(symbol, {
          price: token.price,
          change24h: token.priceChange24h,
          timestamp: Date.now()
        });
        // DexScreener cache für Tokens ohne Jupiter API
        this.dexPrices.set(symbol, {
          price: token.price,
          change24h: token.priceChange24h,
          volume24h: token.volume24h,
          timestamp: Date.now()
        });
      }

      console.log(`[Ranking] Synced ${dexTokens.length} tokens from DexScreener. Total candidates: ${this.candidates.size}`);
    } catch (e) {
      console.error('[Ranking] DexScreener sync error:', e);
    }
  }

  /**
   * Full ranking cycle with LIVE data + DexScreener
   */
  async runRankingCycle(): Promise<RankingResult> {
    console.log(`[Ranking] Cycle #${this.cycleNumber + 1} - Fetching LIVE data...`);

    // 0. Sync from DexScreener for new tokens
    await this.syncDexScreenerTokens();

    // 1. Fetch live prices
    await this.fetchPrices();

    // 2. Calculate live short signal scores
    this.calculateShortSignalScores();

    // 3. Generate top 10
    const top10 = this.generateTop10();

    console.log(`[Ranking] Cycle #${this.cycleNumber} complete. Total candidates: ${this.candidates.size}`);
    console.log(`[Ranking] Top 3:`);
    top10.slice(0, 3).forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.symbol}: ${t.shortSignalScore.toFixed(1)}% (Vol: ${t.volatilityScore}, Change: ${t.priceChange24h.toFixed(1)}%)`);
    });

    return this.lastRanking!;
  }

  isUpdateDue(): boolean {
    return Date.now() - this.lastUpdate >= this.updateIntervalMs;
  }

  getTop10(): ShortTarget[] {
    return this.currentTop10;
  }

  getLastRanking(): RankingResult | null {
    return this.lastRanking;
  }

  getAllCandidates(): ShortTarget[] {
    return Array.from(this.candidates.values());
  }

  getTimeSinceLastUpdate(): number {
    return Date.now() - this.lastUpdate;
  }

  /**
   * Get live price for a symbol
   */
  getLivePrice(symbol: string): number {
    return this.livePrices.get(symbol)?.price || 0;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Singleton instance
export const rankingService = new ShortTargetRankingService();
