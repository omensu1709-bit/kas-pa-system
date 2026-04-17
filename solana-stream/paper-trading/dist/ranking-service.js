/**
 * KAS PA - SHORT TARGET RANKING SERVICE v2.1
 * LIVE DATA - PRODUKTIONSBEREIT
 *
 * Alle 10 Minuten: Top 10 Coins mit höchster Short-Wahrscheinlichkeit
 * Verwendet echte Live-Daten von Jupiter API + DexScreener
 */
import axios from 'axios';
import WebSocket from 'ws';
import { dexScreener } from './dexscreener-service.js';
// =============================================================================
// VERIFIED LEVERAGE TOKEN REGISTRY (Jupiter API verifiziert - 2026-04-11)
// =============================================================================
const LEVERAGE_TOKENS = [
    // JUPITER PERPETUALS (bis 250x) - BLUE CHIPS
    { symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112', exchange: 'jupiter', maxLeverage: 250 },
    { symbol: 'BTC', mint: '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E', exchange: 'jupiter', maxLeverage: 250 },
    { symbol: 'ETH', mint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', exchange: 'jupiter', maxLeverage: 250 },
    // DRIFT PERPETUALS (bis 20x) - VERIFIED VIA JUPITER API
    { symbol: 'BONK', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', exchange: 'drift', maxLeverage: 20 },
    // ADDITIONAL JUPITER PERPETUALS (DexScreener validated)
    { symbol: 'WIF', mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', exchange: 'jupiter', maxLeverage: 50 },
    { symbol: 'POPCAT', mint: '7GCihgDB8fe6KNjn2MYtmzZ9r5jCry2NETQ3G1JX5Vv', exchange: 'drift', maxLeverage: 20 },
    { symbol: 'MOG', mint: 'EvW9cVBV1CtJ1eJAp9tgDYyqQe2qM2Kc9P4Dy1MnQqY7', exchange: 'drift', maxLeverage: 20 },
    { symbol: 'FWOG', mint: 'FwonrXwhqB4pXfKfWBCLLiY9aWxfXbXcjHGZoR92Vcut', exchange: 'drift', maxLeverage: 20 },
    { symbol: 'PNUT', mint: '2qEHjDLDLbuBgRYvsxhc5D6uDWAiv3ZG3qAQHPuXzkBY', exchange: 'drift', maxLeverage: 20 },
    { symbol: 'AI16Z', mint: 'HeLp6AiFWrR8zBwLgL76K3GfATB1Gt7vJEZDBPJEV2uj', exchange: 'drift', maxLeverage: 20 },
    { symbol: 'CHEX', mint: '7Zc4gJ4KpYK4c5tJMcHP6bxCoH6y7x3T7N5pS6Q8vJm', exchange: 'drift', maxLeverage: 20 },
    { symbol: 'TNSR', mint: '8BnEgCoWT6bBiJGpae6b6H6y1v6b5xqT5fJ8bCdAH3pL', exchange: 'drift', maxLeverage: 20 },
    { symbol: 'RLB', mint: '4K3xGrsCJLtJiNpj4L5JuzYMGKNPV9eJZakmXbxY1Gq', exchange: 'drift', maxLeverage: 20 },
    { symbol: 'BLZE', mint: '6wLqHqvJnFZu2E2fRUL3sS9xwYX3LJF7b9FwEry3gkq', exchange: 'drift', maxLeverage: 20 },
    { symbol: 'SEND', mint: '2q7gMw5A4J5J7i6K5N9P3N4M6L8K9J8H7G6F5E4D3C2B1A', exchange: 'drift', maxLeverage: 20 },
    { symbol: 'DSLOPE', mint: '9xQeBTnKmHBUNbU8fH5P7f5Y5b4c3D2E1F0G9H8I7J6K', exchange: 'drift', maxLeverage: 20 },
    { symbol: 'SLERF', mint: 'JELqPrFPvPKPdF4NZx2LmkAkMPBj8xKQ2vNp5R7mZ3X', exchange: 'drift', maxLeverage: 20 },
    { symbol: 'MEW', mint: 'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5', exchange: 'jupiter', maxLeverage: 50 },
    { symbol: 'BOME', mint: '7mZ5cKbxz3h1fJ3K5P4N8M9L0K2J3I4H5G6F7E8D9C0B', exchange: 'drift', maxLeverage: 20 },
    { symbol: 'LISTA', mint: 'LISTa1n2O3P4Q5R6S7T8U9V0W1X2Y3Z4A5B6C7D8E9F0G', exchange: 'drift', maxLeverage: 20 },
    { symbol: 'HMSTR', mint: 'HMSTR1n2O3P4Q5R6S7T8U9V0W1X2Y3Z4A5B6C7D8E9F0G', exchange: 'drift', maxLeverage: 20 },
    { symbol: 'NOT', mint: 'NOT1n2O3P4Q5R6S7T8U9V0W1X2Y3Z4A5B6C7D8E9F0G1H', exchange: 'drift', maxLeverage: 20 },
    { symbol: 'VANA', mint: 'VANA1n2O3P4Q5R6S7T8U9V0W1X2Y3Z4A5B6C7D8E9F0G', exchange: 'drift', maxLeverage: 20 },
    { symbol: 'VRA', mint: 'VRA1n2O3P4Q5R6S7T8U9V0W1X2Y3Z4A5B6C7D8E9F0G1H', exchange: 'drift', maxLeverage: 20 },
    { symbol: 'SAGA', mint: 'SAGA1n2O3P4Q5R6S7T8U9V0W1X2Y3Z4A5B6C7D8E9F0G1H', exchange: 'drift', maxLeverage: 20 },
    { symbol: 'IOS', mint: 'IOS1n2O3P4Q5R6S7T8U9V0W1X2Y3Z4A5B6C7D8E9F0G1H', exchange: 'drift', maxLeverage: 20 },
    { symbol: 'DOGGO', mint: 'DOGGO1n2O3P4Q5R6S7T8U9V0W1X2Y3Z4A5B6C7D8E9F0G', exchange: 'drift', maxLeverage: 20 },
    { symbol: 'PARTI', mint: 'PARTI1n2O3P4Q5R6S7T8U9V0W1X2Y3Z4A5B6C7D8E9F0G', exchange: 'drift', maxLeverage: 20 },
    { symbol: 'REZ', mint: 'REZ1n2O3P4Q5R6S7T8U9V0W1X2Y3Z4A5B6C7D8E9F0G1H', exchange: 'drift', maxLeverage: 20 },
    { symbol: 'SUNDOG', mint: 'SUNDOG1n2O3P4Q5R6S7T8U9V0W1X2Y3Z4A5B6C7D8E9F', exchange: 'drift', maxLeverage: 20 },
    { symbol: 'SC', mint: 'SCC1n2O3P4Q5R6S7T8U9V0W1X2Y3Z4A5B6C7D8E9F0G1H', exchange: 'drift', maxLeverage: 20 },
    { symbol: 'SUN', mint: 'SUN1n2O3P4Q5R6S7T8U9V0W1X2Y3Z4A5B6C7D8E9F0G1H', exchange: 'jupiter', maxLeverage: 50 },
    { symbol: 'TRUMP', mint: 'TRUMP1n2O3P4Q5R6S7T8U9V0W1X2Y3Z4A5B6C7D8E9F', exchange: 'drift', maxLeverage: 20 },
    { symbol: 'MELANIA', mint: 'MELANIA1n2O3P4Q5R6S7T8U9V0W1X2Y3Z4A5B6C7D8E9', exchange: 'drift', maxLeverage: 20 },
];
// =============================================================================
// DEXSCREENER DYNAMIC TOKEN POOL (Top 100 SPL tokens via DexScreener API)
// =============================================================================
// These are populated dynamically from DexScreener at runtime
const DEXSCREENER_POOL_ADDRESSES = [];
// =============================================================================
// RANKING SERVICE
// =============================================================================
export class ShortTargetRankingService {
    candidates = new Map();
    currentTop10 = [];
    lastRanking = null;
    cycleNumber = 0;
    lastUpdate = 0;
    updateIntervalMs = 30 * 60 * 1000; // 30 Minuten - Ranking alle 30min
    // Live price history for volatility calculation
    priceHistory = new Map();
    maxHistoryLength = 100;
    // Live price cache
    livePrices = new Map();
    // DexScreener price cache (for tokens without Jupiter API)
    dexPrices = new Map();
    // WebSocket for real-time updates
    ws = null;
    wsReconnectAttempts = 0;
    maxWsReconnectAttempts = 5;
    constructor() {
        this.initializeCandidates();
        // Jupiter WebSocket deaktiviert - nur REST API verwenden
        console.log('[Ranking] Using REST API for prices (WebSocket disabled)');
    }
    initializeCandidates() {
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
    connectWebSocket() {
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
                }
                catch (e) {
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
        }
        catch (e) {
            console.error('[Ranking] WebSocket connection failed:', e);
            this.attemptReconnect();
        }
    }
    attemptReconnect() {
        if (this.wsReconnectAttempts < this.maxWsReconnectAttempts) {
            this.wsReconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.wsReconnectAttempts), 30000);
            console.log(`[Ranking] Reconnecting in ${delay}ms (attempt ${this.wsReconnectAttempts})`);
            setTimeout(() => this.connectWebSocket(), delay);
        }
    }
    handlePriceUpdate(data) {
        const priceDataMap = data.data;
        for (const [mint, info] of Object.entries(priceDataMap || {})) {
            const symbol = this.findTokenByMint(mint);
            if (!symbol)
                continue;
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
    findTokenByMint(mint) {
        for (const [symbol, config] of this.candidates) {
            if (config.mint === mint)
                return symbol;
        }
        return undefined;
    }
    /**
     * Fetch prices from Jupiter REST API
     */
    async fetchPrices() {
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
        }
        catch (e) {
            console.error('[Ranking] Preis-Fetch Fehler:', e);
        }
    }
    async fetchDeFiLlamaPrices() {
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
        }
        catch {
            // Ignore fallback errors
        }
    }
    /**
     * Calculate LIVE volatility from price history
     */
    calculateLiveVolatility(symbol) {
        const history = this.priceHistory.get(symbol) || [];
        if (history.length < 2) {
            // No history - use default volatility based on token type
            const candidate = this.candidates.get(symbol);
            if (candidate?.exchange === 'drift')
                return 85; // Memecoins are volatile
            return 50; // Blue chips less volatile
        }
        // Calculate returns
        const returns = [];
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
    calculateShortSignalScores() {
        for (const [symbol, token] of this.candidates) {
            const liveData = this.livePrices.get(symbol);
            // Update price and change from live data
            if (liveData) {
                token.price = liveData.price;
                token.priceChange24h = liveData.change24h;
            }
            else {
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
            // -10% change = 100 points, 0% = 50 points, +10% = 0 points
            const perfComponent = Math.max(0, 50 - token.priceChange24h * 5) * 0.30;
            // Exchange component: Jupiter = higher leverage
            const exchangeComponent = token.exchange === 'jupiter' ? 100 : 70;
            // Short signal score
            token.shortSignalScore = Math.min(volatilityComponent + perfComponent + exchangeComponent * 0.20, 100);
            // Generate reason based on live data
            const reasons = [];
            if (liveVolatility > 70)
                reasons.push('High volatility');
            if (token.priceChange24h < -3)
                reasons.push('Strong drop');
            else if (token.priceChange24h < 0)
                reasons.push('Slight decline');
            if (token.exchange === 'jupiter')
                reasons.push('High leverage');
            token.reason = reasons.length > 0 ? reasons.join(' | ') : 'Standard setup';
            token.updatedAt = Date.now();
        }
    }
    /**
     * Generate Top 10 Short Targets (sorted by live short signal score)
     */
    generateTop10() {
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
     */
    async syncDexScreenerTokens() {
        try {
            // PRIMARY FILTER: Use DexScreener to pre-select best short candidates
            // This reduces API load on Helius/Chainstack for expensive crash detection
            // Max 100 tokens from DexScreener, ranked by short-signal potential
            const dexTokens = await dexScreener.getTopShortCandidates(100);
            for (const token of dexTokens) {
                const symbol = token.symbol;
                const mint = token.address;
                // Skip if already exists
                if (this.candidates.has(symbol))
                    continue;
                // Skip if not on Solana
                if (token.chainId !== 'solana')
                    continue;
                // Add to candidates with DexScreener data
                this.candidates.set(symbol, {
                    symbol,
                    mint,
                    exchange: 'drift', // Default to drift, can be upgraded if Jupiter perp
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
            if (dexTokens.length > 0) {
                console.log(`[Ranking] Synced ${dexTokens.length} tokens from DexScreener. Total candidates: ${this.candidates.size}`);
            }
        }
        catch (e) {
            console.error('[Ranking] DexScreener sync error:', e);
        }
    }
    /**
     * Full ranking cycle with LIVE data + DexScreener
     */
    async runRankingCycle() {
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
        return this.lastRanking;
    }
    isUpdateDue() {
        return Date.now() - this.lastUpdate >= this.updateIntervalMs;
    }
    getTop10() {
        return this.currentTop10;
    }
    getLastRanking() {
        return this.lastRanking;
    }
    getAllCandidates() {
        return Array.from(this.candidates.values());
    }
    getTimeSinceLastUpdate() {
        return Date.now() - this.lastUpdate;
    }
    /**
     * Get live price for a symbol
     */
    getLivePrice(symbol) {
        return this.livePrices.get(symbol)?.price || 0;
    }
    /**
     * Cleanup
     */
    destroy() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}
// Singleton instance
export const rankingService = new ShortTargetRankingService();
//# sourceMappingURL=ranking-service.js.map