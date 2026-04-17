/**
 * Crash Paper Trading Runner
 *
 * Main entry point for the paper trading system.
 * Integrates:
 * - Crash Detection System
 * - Paper Trading Engine
 * - Real-time Prediction Logger
 * - Crash Signal Adapter
 */
import { CrashSignalAdapter } from './crash-signal-adapter.js';
import { PredictionLogger } from './crash-prediction-logger.js';
// Import metrics from data module
import { HawkesMetric, PermutationEntropyMetric, GraphMetric, EpidemicMetric, GutenbergRichterMetric, TransferEntropyMetric, SuperspreaderMetric, LiquidityImpactMetric, computeCrashProbability, } from '../../data/src/metrics/index.js';
export const DEFAULT_RUNNER_CONFIG = {
    operatorPubkey: 'crash-paper-trader',
    startingCapital: 100, // 100 SOL
    tokens: ['SOL', 'BTC', 'ETH'], // Jupiter Perpetuals supported tokens
    ignoreThreshold: 0.10,
    monitorThreshold: 0.20,
    kellyMode: 'quarter',
    maxPositionPercent: 20,
    maxTotalExposure: 50,
    maxPositions: 4,
    stopLossPercent: 0.015,
    maxHoldingHours: 6,
    leverage: 10,
};
export class CrashPaperTradingRunner {
    engine;
    adapter;
    logger;
    config;
    // Metric instances per token
    hawkesMetrics = new Map();
    entropyMetrics = new Map();
    graphMetrics = new Map();
    epidemicMetrics = new Map();
    seismicMetrics = new Map();
    transferMetrics = new Map();
    superspreaderMetrics = new Map();
    liquidityMetrics = new Map();
    // Rolling stats for z-score normalization
    rollingStats = new Map();
    isRunning = false;
    updateInterval = null;
    constructor(config = {}) {
        this.config = { ...DEFAULT_RUNNER_CONFIG, ...config };
        // Initialize Paper Trading Engine (with mock components for now)
        // In production, this would connect to real RPC and price sources
        const engineConfig = {
            startingCapital: this.config.startingCapital,
            operatorPubkey: this.config.operatorPubkey,
            rpcEndpoint: 'https://api.mainnet-beta.solana.com',
            payerKeypair: null, // Mock for paper trading
            priceSources: [], // Will be added by MultiSourceOracle
        };
        // Create engine with simplified constructor
        this.engine = this.createMockEngine();
        // Initialize Crash Signal Adapter
        this.adapter = new CrashSignalAdapter(this.engine, {
            ignoreThreshold: this.config.ignoreThreshold,
            monitorThreshold: this.config.monitorThreshold,
            kellyMode: this.config.kellyMode,
            maxPositionPercent: this.config.maxPositionPercent,
            maxTotalExposure: this.config.maxTotalExposure,
            maxPositions: this.config.maxPositions,
            stopLossPercent: this.config.stopLossPercent,
            maxHoldingHours: this.config.maxHoldingHours,
            leverage: this.config.leverage,
        }, this.config.operatorPubkey);
        // Initialize Prediction Logger
        this.logger = new PredictionLogger(this.config.operatorPubkey);
        // Initialize metrics for each token
        for (const token of this.config.tokens) {
            this.initializeMetrics(token);
        }
    }
    /**
     * Initialize crash detection metrics for a token
     */
    initializeMetrics(token) {
        this.hawkesMetrics.set(token, new HawkesMetric({ windowSize: 5000 }));
        this.entropyMetrics.set(token, new PermutationEntropyMetric({ windowSize: 500 }));
        this.graphMetrics.set(token, new GraphMetric(30 * 60 * 1000, 50000));
        this.epidemicMetrics.set(token, new EpidemicMetric({ windowSize: 1000 }));
        this.seismicMetrics.set(token, new GutenbergRichterMetric({ windowSize: 1000 }));
        this.transferMetrics.set(token, new TransferEntropyMetric({ windowSize: 1000 }));
        this.superspreaderMetrics.set(token, new SuperspreaderMetric({ windowSize: 100 }));
        this.liquidityMetrics.set(token, new LiquidityImpactMetric({ windowSize: 500 }));
        // Initialize rolling stats
        const stats = new Map();
        const metrics = ['n', 'PE', 'kappa', 'fragmentation', 'rt', 'bValue', 'CTE', 'SSI', 'LFI'];
        for (const m of metrics) {
            stats.set(m, { sum: 0, sumSq: 0, count: 0 });
        }
        this.rollingStats.set(token, stats);
    }
    /**
     * Creates a mock paper trading engine for simulation
     */
    createMockEngine() {
        // Simplified mock engine for paper trading simulation
        const state = {
            positions: new Map(),
            tradeHistory: [],
            totalPnlSol: 0,
            startingCapital: this.config.startingCapital,
            currentCapital: this.config.startingCapital,
        };
        return {
            async openPosition(tokenMint, amount, signalSource) {
                const position = {
                    id: `pos_${Date.now()}`,
                    tokenMint,
                    amount,
                    entryPrice: 100, // Mock price
                    entrySlot: 0,
                    entryTime: Date.now(),
                    signalSource,
                    status: 'OPEN',
                };
                state.positions.set(tokenMint, position);
                state.tradeHistory.push({ ...position, type: 'ENTRY' });
                return { success: true, position };
            },
            async closePosition(tokenMint, reason) {
                const position = state.positions.get(tokenMint);
                if (!position)
                    return { success: false, error: 'No position' };
                state.currentCapital += position.amount * 0.1; // Mock 10% gain
                state.totalPnlSol += position.amount * 0.1;
                state.positions.delete(tokenMint);
                const trade = {
                    positionId: position.id,
                    tokenMint,
                    amount: position.amount,
                    entryPrice: position.entryPrice,
                    exitPrice: position.entryPrice * 1.1,
                    pnlSol: position.amount * 0.1,
                    entrySlot: position.entrySlot,
                    exitSlot: 0,
                    holdingSlots: 100,
                    entryTime: position.entryTime,
                    exitTime: Date.now(),
                    closeReason: reason,
                    pnlPercent: 10,
                };
                state.tradeHistory.push({ ...position, ...trade, type: 'EXIT' });
                return { success: true, trade, totalPnl: state.totalPnlSol, currentCapital: state.currentCapital };
            },
            getPerformance() {
                return {
                    startingCapital: state.startingCapital,
                    currentCapital: state.currentCapital,
                    totalPnlSol: state.totalPnlSol,
                    totalPnlPercent: (state.totalPnlSol / state.startingCapital) * 100,
                    totalTrades: state.tradeHistory.filter((t) => t.type === 'EXIT').length,
                    winningTrades: state.tradeHistory.filter((t) => t.type === 'EXIT' && t.pnlSol > 0).length,
                    losingTrades: state.tradeHistory.filter((t) => t.type === 'EXIT' && t.pnlSol < 0).length,
                    winRate: state.tradeHistory.length > 0
                        ? (state.tradeHistory.filter((t) => t.type === 'EXIT' && t.pnlSol > 0).length / state.tradeHistory.filter((t) => t.type === 'EXIT').length) * 100
                        : 0,
                    averageTrade: state.tradeHistory.length > 0
                        ? state.tradeHistory.filter((t) => t.type === 'EXIT').reduce((sum, t) => sum + (t.pnlSol || 0), 0) / state.tradeHistory.filter((t) => t.type === 'EXIT').length
                        : 0,
                    largestWin: Math.max(...state.tradeHistory.filter((t) => t.type === 'EXIT' && t.pnlSol > 0).map((t) => t.pnlSol || 0), 0),
                    largestLoss: Math.min(...state.tradeHistory.filter((t) => t.type === 'EXIT' && t.pnlSol < 0).map((t) => t.pnlSol || 0), 0),
                    openPositions: Array.from(state.positions.values()),
                    recentTrades: state.tradeHistory.filter((t) => t.type === 'EXIT').slice(-10),
                };
            },
            verify() {
                return { chainValid: true, auditValid: true, totalTrades: state.tradeHistory.length, totalPnl: state.totalPnlSol, verifiedAt: Date.now() };
            },
            export() {
                return {
                    startingCapital: state.startingCapital,
                    currentCapital: state.currentCapital,
                    totalPnlSol: state.totalPnlSol,
                    positions: Array.from(state.positions.values()),
                    tradeHistory: state.tradeHistory,
                    exportedAt: Date.now(),
                };
            },
        };
    }
    /**
     * Process incoming market data and update metrics
     */
    processMarketData(token, slot, timestamp, price, volume, transactionData) {
        const hawkes = this.hawkesMetrics.get(token);
        const entropy = this.entropyMetrics.get(token);
        const graph = this.graphMetrics.get(token);
        const epidemic = this.epidemicMetrics.get(token);
        const seismic = this.seismicMetrics.get(token);
        const transfer = this.transferMetrics.get(token);
        const superspreader = this.superspreaderMetrics.get(token);
        const liquidity = this.liquidityMetrics.get(token);
        if (!hawkes || !entropy || !graph || !epidemic || !seismic || !transfer || !superspreader || !liquidity) {
            return;
        }
        // Update Hawkes
        hawkes.addEvent(slot, timestamp);
        // Update Entropy
        entropy.addPrice(price, slot);
        // Update Graph
        if (transactionData?.accountKeys) {
            for (let i = 1; i < transactionData.accountKeys.length; i++) {
                graph.addEdge(transactionData.accountKeys[0], transactionData.accountKeys[i], timestamp);
            }
        }
        // Update Seismic
        seismic.addMagnitude(Math.log1p(transactionData?.fee || 0) / 10);
        // Update Liquidity
        const priceImpact = Math.abs(Math.random() * 5); // Mock 0-5 bps
        liquidity.addTrade(volume, priceImpact, slot, volume);
        // Update rolling stats
        this.updateRollingStats(token);
    }
    /**
     * Compute crash probability for a token
     */
    computeCrashProbability(token, slot) {
        const hawkes = this.hawkesMetrics.get(token);
        const entropy = this.entropyMetrics.get(token);
        const graph = this.graphMetrics.get(token);
        const epidemic = this.epidemicMetrics.get(token);
        const seismic = this.seismicMetrics.get(token);
        const transfer = this.transferMetrics.get(token);
        const superspreader = this.superspreaderMetrics.get(token);
        const liquidity = this.liquidityMetrics.get(token);
        if (!hawkes || !entropy || !graph || !epidemic || !seismic || !transfer || !superspreader || !liquidity) {
            return null;
        }
        // Get raw values
        const raw = {
            n: hawkes.compute().branchingRatio,
            PE: entropy.compute().normalizedEntropy,
            kappa: graph.compute().molloyReedRatio,
            fragmentation: graph.compute().fragmentationRatio,
            rt: epidemic.compute().rt,
            bValue: seismic.compute().bValue,
            CTE: transfer.compute().clustering,
            SSI: superspreader.compute().activationIndex,
            LFI: liquidity.compute().deviation,
        };
        // Get z-scores
        const zScores = this.normalizeToZScores(token, raw);
        // Compute crash probability
        const { probability, confirmingMetrics } = computeCrashProbability(zScores);
        // Determine zone
        const zone = this.adapter.getZone(probability);
        const signal = {
            token,
            crashProbability: probability,
            confirmingMetrics: confirmingMetrics.length,
            zScores,
            slot,
            timestamp: Date.now(),
            zone,
        };
        // Log prediction
        this.logger.logPrediction(token, slot, raw, zScores, probability, confirmingMetrics.length, zone);
        return signal;
    }
    /**
     * Normalize raw metrics to z-scores
     */
    normalizeToZScores(token, raw) {
        const stats = this.rollingStats.get(token);
        if (!stats)
            return {};
        const zScores = {};
        for (const [metric, value] of Object.entries(raw)) {
            const s = stats.get(metric);
            if (!s || s.count < 30) {
                zScores[`z_${metric}`] = 0;
                continue;
            }
            const mean = s.sum / s.count;
            const variance = (s.sumSq / s.count) - (mean * mean);
            const std = Math.sqrt(Math.max(0, variance));
            if (std < 0.001) {
                zScores[`z_${metric}`] = 0;
            }
            else {
                zScores[`z_${metric}`] = (value - mean) / std;
            }
        }
        return zScores;
    }
    /**
     * Update rolling statistics
     */
    updateRollingStats(token) {
        const stats = this.rollingStats.get(token);
        if (!stats)
            return;
        const hawkes = this.hawkesMetrics.get(token);
        const entropy = this.entropyMetrics.get(token);
        const graph = this.graphMetrics.get(token);
        const epidemic = this.epidemicMetrics.get(token);
        const seismic = this.seismicMetrics.get(token);
        const transfer = this.transferMetrics.get(token);
        const superspreader = this.superspreaderMetrics.get(token);
        const liquidity = this.liquidityMetrics.get(token);
        const values = {
            n: hawkes?.compute().branchingRatio || 0,
            PE: entropy?.compute().normalizedEntropy || 0,
            kappa: graph?.compute().molloyReedRatio || 0,
            fragmentation: graph?.compute().fragmentationRatio || 0,
            rt: epidemic?.compute().rt || 0,
            bValue: seismic?.compute().bValue || 0,
            CTE: transfer?.compute().clustering || 0,
            SSI: superspreader?.compute().activationIndex || 0,
            LFI: liquidity?.compute().deviation || 0,
        };
        for (const [metric, value] of Object.entries(values)) {
            const s = stats.get(metric);
            if (!s)
                continue;
            s.sum += value;
            s.sumSq += value * value;
            s.count++;
            // Decay old values (exponential decay with half-life of 1000 samples)
            if (s.count > 2000) {
                s.sum *= 0.999;
                s.sumSq *= 0.999;
                s.count *= 0.999;
            }
        }
    }
    /**
     * Start the paper trading runner
     */
    async start(marketDataCallback) {
        if (this.isRunning) {
            console.log('[Runner] Already running');
            return;
        }
        this.isRunning = true;
        console.log('[Runner] Paper Trading Runner started');
        console.log(`[Runner] Monitoring tokens: ${this.config.tokens.join(', ')}`);
        console.log(`[Runner] Starting capital: ${this.config.startingCapital} SOL`);
        // Main loop
        const runLoop = async () => {
            while (this.isRunning) {
                try {
                    await marketDataCallback();
                    // For each token, compute crash probability and process
                    for (const token of this.config.tokens) {
                        const slot = Math.floor(Date.now() / 400); // Rough slot estimate
                        const signal = this.computeCrashProbability(token, slot);
                        if (signal && signal.zone !== 'IGNORE') {
                            const result = await this.adapter.processSignal(signal);
                            if (result.action === 'position_opened') {
                                console.log(`[Runner] OPENED position: ${token} - P=${signal.crashProbability.toFixed(4)}, z=${signal.confirmingMetrics} metrics`);
                            }
                        }
                    }
                    // Sleep 1 second between updates (in production: event-driven)
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                catch (error) {
                    console.error('[Runner] Error in main loop:', error);
                }
            }
        };
        runLoop();
    }
    /**
     * Stop the paper trading runner
     */
    stop() {
        this.isRunning = false;
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        console.log('[Runner] Paper Trading Runner stopped');
    }
    /**
     * Get current performance
     */
    getPerformance() {
        return this.engine.getPerformance();
    }
    /**
     * Get prediction summary
     */
    getPredictionSummary() {
        return this.logger.getSummary();
    }
    /**
     * Export all data
     */
    export() {
        return {
            engine: this.engine.export(),
            predictions: this.logger.exportJSON(),
            performance: this.engine.getPerformance(),
            summary: this.logger.getSummary(),
        };
    }
}
//# sourceMappingURL=crash-paper-trading-runner.js.map