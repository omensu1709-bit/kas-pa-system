/**
 * KAS PA - SHORT TARGET RANKING SERVICE v2.1
 * LIVE DATA - PRODUKTIONSBEREIT
 *
 * Alle 10 Minuten: Top 10 Coins mit höchster Short-Wahrscheinlichkeit
 * Verwendet echte Live-Daten von Jupiter API + DexScreener
 */
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
export declare class ShortTargetRankingService {
    private candidates;
    private currentTop10;
    private lastRanking;
    private cycleNumber;
    private lastUpdate;
    private updateIntervalMs;
    private priceHistory;
    private maxHistoryLength;
    private livePrices;
    private dexPrices;
    private ws;
    private wsReconnectAttempts;
    private maxWsReconnectAttempts;
    constructor();
    private initializeCandidates;
    /**
     * WebSocket connection for real-time price updates from Jupiter
     */
    private connectWebSocket;
    private attemptReconnect;
    private handlePriceUpdate;
    private findTokenByMint;
    /**
     * Fetch prices from Jupiter REST API
     */
    fetchPrices(): Promise<void>;
    private fetchDeFiLlamaPrices;
    /**
     * Calculate LIVE volatility from price history
     */
    private calculateLiveVolatility;
    /**
     * Calculate Short-Signal-Score for each token (LIVE)
     */
    calculateShortSignalScores(): void;
    /**
     * Generate Top 10 Short Targets (sorted by live short signal score)
     */
    generateTop10(): ShortTarget[];
    /**
     * Fetch additional tokens from DexScreener and add to candidates
     */
    syncDexScreenerTokens(): Promise<void>;
    /**
     * Full ranking cycle with LIVE data + DexScreener
     */
    runRankingCycle(): Promise<RankingResult>;
    isUpdateDue(): boolean;
    getTop10(): ShortTarget[];
    getLastRanking(): RankingResult | null;
    getAllCandidates(): ShortTarget[];
    getTimeSinceLastUpdate(): number;
    /**
     * Get live price for a symbol
     */
    getLivePrice(symbol: string): number;
    /**
     * Cleanup
     */
    destroy(): void;
}
export declare const rankingService: ShortTargetRankingService;
//# sourceMappingURL=ranking-service.d.ts.map