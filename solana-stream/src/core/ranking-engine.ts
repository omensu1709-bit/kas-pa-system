/**
 * Ranking Engine - Echtzeit-Algorithmus für Token-Ranking
 * Priorisiert Tokens mit höchstem Short-Potential basierend auf Volume-Spikes und Wallet-Aktivität
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface TokenRanking {
  symbol: string;
  mint: string;
  exchange: 'jupiter' | 'drift' | 'both';
  maxLeverage: number;
  shortSignalScore: number;
  volatilityScore: number;
  volumeScore: number;
  marketCapScore: number;
  exchangeScore: number;
  totalScore: number;
  price: number;
  priceChange24h: number;
  volume24h: number;
  marketCap: number;
  walletActivity: number;
  uniqueWallets: number;
  isShortable: boolean;
  reason: string;
  rank: number;
  timestamp: number;
}

export interface TokenMarketData {
  mint: string;
  symbol: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  marketCap: number;
  liquidity: number;
  lastUpdated: number;
}

export interface RankingWeights {
  volatility: number;
  volume: number;
  marketCap: number;
  exchange: number;
  walletActivity: number;
}

export interface RankingConfig {
  topN: number;
  updateIntervalMs: number;
  minVolumeThreshold: number;
  minMarketCapThreshold: number;
  weights: RankingWeights;
}

// ============================================================================
// KNOWN LEVERAGEABLE TOKENS
// ============================================================================

export const LEVERAGE_TOKENS: Array<{
  symbol: string;
  mint: string;
  exchange: 'jupiter' | 'drift';
  maxLeverage: number;
}> = [
  // Blue chips - Jupiter Perps (up to 250x)
  { symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112', exchange: 'jupiter', maxLeverage: 250 },
  { symbol: 'BTC', mint: '3NZ9JCVBmecfcGATSS3sBCAQGFA6okLvvL8vR3FCsaw', exchange: 'jupiter', maxLeverage: 250 },
  { symbol: 'ETH', mint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', exchange: 'jupiter', maxLeverage: 250 },

  // High-cap altcoins - Jupiter Perps
  { symbol: 'JTO', mint: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCP', exchange: 'jupiter', maxLeverage: 50 },
  { symbol: 'JUP', mint: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', exchange: 'jupiter', maxLeverage: 50 },
  { symbol: 'PYTH', mint: 'P1ATJHKLo2oE1Z3Jw2qthT5S3DqyoCU8v6agM5Dyf8K', exchange: 'jupiter', maxLeverage: 50 },

  // Memecoins - Drift Perps (up to 20x)
  { symbol: 'WIF', mint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', exchange: 'drift', maxLeverage: 20 },
  { symbol: 'BONK', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', exchange: 'drift', maxLeverage: 20 },
  { symbol: 'POPCAT', mint: 'PollA1b9h1m7Zn9a2v7rD8JKpzCFrkdP7cT3YBv4fXqL', exchange: 'drift', maxLeverage: 20 },
  { symbol: 'MOTHER', mint: '3UViBBLmHC7rNfh8KBDZpi6C9UpTnSnhfh5nH2qkw3c', exchange: 'drift', maxLeverage: 20 },
  { symbol: 'FWOG', mint: 'FLUXvmPxiVu8PSr4qR4WD1HWDW5hXmJ8vLcGgY5fRK9', exchange: 'drift', maxLeverage: 20 },
  { symbol: 'SLERF', mint: 'SLERFjjwjQKKkJB4ePDKxWPGVAsyGcXaAPRXSVz3V5H', exchange: 'drift', maxLeverage: 20 },
  { symbol: 'WEN', mint: 'pKhQd9o6q7pL6eFaLPQA85Tai5keJh1VYJvkjLzhQbc', exchange: 'drift', maxLeverage: 20 },
  { symbol: 'BOME', mint: '2qEHjD3bu3q7TBhodMr党风廉政建设alUGR4DqAr5QzL5Rd4ZZ', exchange: 'drift', maxLeverage: 20 },
  { symbol: 'AI16Z', mint: 'Ae7ngy6Z4zkkBX2JJuj5L8Z7hbV9xJ4y2HshH5u3L4Kf', exchange: 'drift', maxLeverage: 20 },
];

// ============================================================================
// DEFAULT WEIGHTS
// ============================================================================

const DEFAULT_WEIGHTS: RankingWeights = {
  volatility: 0.40,    // 40% - Volatilität ist der wichtigste Faktor
  volume: 0.30,        // 30% - Volume zeigt Liquidität und Interesse
  marketCap: 0.20,    // 20% - Market Cap für Stabilität
  exchange: 0.10,     // 10% - Exchange-Zugänglichkeit
  walletActivity: 0.00, // 0% - Reserved for future use
};

const DEFAULT_CONFIG: RankingConfig = {
  topN: 10,
  updateIntervalMs: 10 * 60 * 1000, // 10 minutes
  minVolumeThreshold: 100000, // $100k minimum
  minMarketCapThreshold: 1000000, // $1M minimum
  weights: DEFAULT_WEIGHTS,
};

// ============================================================================
// RANKING ENGINE
// ============================================================================

export class RankingEngine {
  private config: RankingConfig;
  private marketData: Map<string, TokenMarketData> = new Map();
  private rankings: TokenRanking[] = [];
  private lastUpdate: number = 0;
  private isRunning: boolean = false;
  private updateInterval: NodeJS.Timeout | null = null;
  private historicalPrices: Map<string, number[]> = new Map();
  private maxPriceHistory = 100;

  constructor(config: Partial<RankingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // DATA MANAGEMENT
  // ============================================================================

  updateMarketData(data: TokenMarketData): void {
    this.marketData.set(data.mint, data);

    // Track price history for volatility calculation
    if (!this.historicalPrices.has(data.mint)) {
      this.historicalPrices.set(data.mint, []);
    }

    const history = this.historicalPrices.get(data.mint)!;
    history.push(data.price);

    if (history.length > this.maxPriceHistory) {
      history.shift();
    }
  }

  updateMultipleMarketData(dataList: TokenMarketData[]): void {
    dataList.forEach(data => this.updateMarketData(data));
  }

  getMarketData(mint: string): TokenMarketData | undefined {
    return this.marketData.get(mint);
  }

  getAllMarketData(): Map<string, TokenMarketData> {
    return new Map(this.marketData);
  }

  // ============================================================================
  // SCORING ALGORITHMS
  // ============================================================================

  private calculateVolatilityScore(mint: string): number {
    const history = this.historicalPrices.get(mint);
    if (!history || history.length < 2) {
      // No history - return medium volatility
      return 50;
    }

    // Calculate returns
    const returns: number[] = [];
    for (let i = 1; i < history.length; i++) {
      const ret = (history[i] - history[i - 1]) / history[i - 1];
      returns.push(Math.abs(ret));
    }

    // Average return (volatility)
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;

    // Normalize to 0-100 scale
    // Typical crypto volatility is 0.01-0.10 (1%-10%)
    const normalizedVolatility = Math.min(avgReturn * 1000, 100);

    return Math.round(normalizedVolatility);
  }

  private calculateVolumeScore(volume24h: number): number {
    if (volume24h < this.config.minVolumeThreshold) {
      return 0;
    }

    // Volume scoring: $1M = 50 points, $10M+ = 100 points
    const score = Math.min(100, (Math.log10(volume24h) - 5) * 33.33 + 50);
    return Math.max(0, Math.round(score));
  }

  private calculateMarketCapScore(marketCap: number): number {
    if (marketCap < this.config.minMarketCapThreshold) {
      return 20; // Penalize low market cap
    }

    // Inverse scoring: smaller cap = higher score (more potential)
    // $10M = 100, $1B = 50, $10B+ = 20
    const score = Math.max(20, 100 - (Math.log10(marketCap) - 6) * 20);
    return Math.round(Math.min(100, Math.max(20, score)));
  }

  private calculateExchangeScore(exchange: 'jupiter' | 'drift'): number {
    // Jupiter has higher leverage options
    if (exchange === 'jupiter') {
      return 100;
    }
    return 80; // Drift
  }

  private calculateShortSignalScore(ranking: TokenRanking): number {
    const { weights, minVolumeThreshold } = this.config;

    // Volatility contributes most to short signal
    const volatilityComponent = (ranking.volatilityScore / 100) * weights.volatility;

    // Volume component - high volume = more shorting opportunity
    const volumeComponent = (ranking.volumeScore / 100) * weights.volume;

    // Market cap component - smaller caps more volatile
    const marketCapComponent = (ranking.marketCapScore / 100) * weights.marketCap;

    // Exchange component
    const exchangeComponent = (ranking.exchangeScore / 100) * weights.exchange;

    // Calculate total score (0-100)
    const totalScore =
      volatilityComponent * 100 * 0.4 +
      volumeComponent * 100 * 0.3 +
      marketCapComponent * 100 * 0.2 +
      exchangeComponent * 100 * 0.1;

    return Math.round(Math.min(100, totalScore));
  }

  // ============================================================================
  // RANKING CALCULATION
  // ============================================================================

  calculateRankings(): TokenRanking[] {
    const rankings: TokenRanking[] = [];
    const now = Date.now();

    for (const token of LEVERAGE_TOKENS) {
      const marketData = this.marketData.get(token.mint);

      // Default values if no market data
      const price = marketData?.price || 0;
      const priceChange24h = marketData?.priceChange24h || 0;
      const volume24h = marketData?.volume24h || 0;
      const marketCap = marketData?.marketCap || 0;

      // Calculate individual scores
      const volatilityScore = this.calculateVolatilityScore(token.mint);
      const volumeScore = this.calculateVolumeScore(volume24h);
      const marketCapScore = this.calculateMarketCapScore(marketCap);
      const exchangeScore = this.calculateExchangeScore(token.exchange);

      // Create ranking object
      const ranking: TokenRanking = {
        symbol: token.symbol,
        mint: token.mint,
        exchange: token.exchange,
        maxLeverage: token.maxLeverage,
        volatilityScore,
        volumeScore,
        marketCapScore,
        exchangeScore,
        shortSignalScore: 0, // Will be calculated
        price,
        priceChange24h,
        volume24h,
        marketCap,
        walletActivity: 0,
        uniqueWallets: 0,
        isShortable: volume24h >= this.config.minVolumeThreshold && marketCap >= this.config.minMarketCapThreshold,
        reason: '',
        rank: 0,
        timestamp: now,
      };

      // Calculate total short signal score
      ranking.shortSignalScore = this.calculateShortSignalScore(ranking);

      // Generate reason
      ranking.reason = this.generateReason(ranking);

      rankings.push(ranking);
    }

    // Sort by short signal score (descending)
    rankings.sort((a, b) => b.shortSignalScore - a.shortSignalScore);

    // Assign ranks
    rankings.forEach((r, i) => {
      r.rank = i + 1;
    });

    this.rankings = rankings;
    this.lastUpdate = now;

    return rankings;
  }

  private generateReason(ranking: TokenRanking): string {
    const reasons: string[] = [];

    if (ranking.volatilityScore >= 80) {
      reasons.push('Hohe Volatilität');
    }

    if (ranking.priceChange24h <= -5) {
      reasons.push('Starker Rückgang');
    } else if (ranking.priceChange24h <= -2) {
      reasons.push('Leichter Rückgang');
    }

    if (ranking.volumeScore >= 80) {
      reasons.push('High Volume');
    }

    if (ranking.exchange === 'jupiter') {
      reasons.push('Jupiter Perps');
    } else {
      reasons.push('Drift Perps');
    }

    if (reasons.length === 0) {
      return 'Mäßiges Potential';
    }

    return reasons.slice(0, 2).join(' | ');
  }

  // ============================================================================
  // GETTERS
  // ============================================================================

  getTopN(n?: number): TokenRanking[] {
    const topN = n ?? this.config.topN;
    return this.rankings.slice(0, topN);
  }

  getAllRankings(): TokenRanking[] {
    return [...this.rankings];
  }

  getRanking(symbol: string): TokenRanking | undefined {
    return this.rankings.find(r => r.symbol === symbol);
  }

  getLastUpdate(): number {
    return this.lastUpdate;
  }

  isStale(maxAgeMs: number = 15 * 60 * 1000): boolean {
    return Date.now() - this.lastUpdate > maxAgeMs;
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log('[RankingEngine] Started');

    // Initial calculation
    this.calculateRankings();

    // Set up periodic updates
    this.updateInterval = setInterval(() => {
      this.calculateRankings();
    }, this.config.updateIntervalMs);
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    console.log('[RankingEngine] Stopped');
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  updateConfig(updates: Partial<RankingConfig>): void {
    this.config = { ...this.config, ...updates };

    // Restart if update interval changed
    if (updates.updateIntervalMs && this.isRunning) {
      this.stop();
      this.start();
    }
  }

  getConfig(): RankingConfig {
    return { ...this.config };
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  serialize(): string {
    return JSON.stringify({
      rankings: this.rankings,
      lastUpdate: this.lastUpdate,
      config: this.config,
      marketData: Array.from(this.marketData.entries()),
    });
  }

  static deserialize(data: string): RankingEngine {
    try {
      const parsed = JSON.parse(data);
      const engine = new RankingEngine(parsed.config);

      engine.rankings = parsed.rankings || [];
      engine.lastUpdate = parsed.lastUpdate || 0;

      if (parsed.marketData) {
        engine.marketData = new Map(parsed.marketData);
      }

      return engine;
    } catch {
      return new RankingEngine();
    }
  }
}

// ============================================================================
// HOOK FOR REACT
// ============================================================================

export function createRankingHook(engine: RankingEngine) {
  return {
    engine,

    rankings: engine.getAllRankings(),

    top10: engine.getTopN(),

    getTopN: (n: number) => engine.getTopN(n),

    getRanking: (symbol: string) => engine.getRanking(symbol),

    updateMarketData: (data: TokenMarketData) => engine.updateMarketData(data),

    updateMultipleMarketData: (dataList: TokenMarketData[]) =>
      engine.updateMultipleMarketData(dataList),

    calculateRankings: () => engine.calculateRankings(),

    start: () => engine.start(),

    stop: () => engine.stop(),

    isStale: (maxAgeMs?: number) => engine.isStale(maxAgeMs),

    getLastUpdate: () => engine.getLastUpdate(),

    serialize: () => engine.serialize(),

    deserialize: RankingEngine.deserialize,
  };
}

export default RankingEngine;
