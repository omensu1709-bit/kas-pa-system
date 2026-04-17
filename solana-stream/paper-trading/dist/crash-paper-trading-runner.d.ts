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
import { CrashSignal } from './crash-signal-adapter.js';
export interface PaperTradingRunnerConfig {
    operatorPubkey: string;
    startingCapital: number;
    tokens: string[];
    ignoreThreshold: number;
    monitorThreshold: number;
    kellyMode: 'full' | 'half' | 'quarter';
    maxPositionPercent: number;
    maxTotalExposure: number;
    maxPositions: number;
    stopLossPercent: number;
    maxHoldingHours: number;
    leverage: number;
}
export declare const DEFAULT_RUNNER_CONFIG: PaperTradingRunnerConfig;
export declare class CrashPaperTradingRunner {
    private engine;
    private adapter;
    private logger;
    private config;
    private hawkesMetrics;
    private entropyMetrics;
    private graphMetrics;
    private epidemicMetrics;
    private seismicMetrics;
    private transferMetrics;
    private superspreaderMetrics;
    private liquidityMetrics;
    private rollingStats;
    private isRunning;
    private updateInterval;
    constructor(config?: Partial<PaperTradingRunnerConfig>);
    /**
     * Initialize crash detection metrics for a token
     */
    private initializeMetrics;
    /**
     * Creates a mock paper trading engine for simulation
     */
    private createMockEngine;
    /**
     * Process incoming market data and update metrics
     */
    processMarketData(token: string, slot: number, timestamp: number, price: number, volume: number, transactionData?: {
        accountKeys: string[];
        fee: number;
        instructions: any[];
    }): void;
    /**
     * Compute crash probability for a token
     */
    computeCrashProbability(token: string, slot: number): CrashSignal | null;
    /**
     * Normalize raw metrics to z-scores
     */
    private normalizeToZScores;
    /**
     * Update rolling statistics
     */
    private updateRollingStats;
    /**
     * Start the paper trading runner
     */
    start(marketDataCallback: () => Promise<void>): Promise<void>;
    /**
     * Stop the paper trading runner
     */
    stop(): void;
    /**
     * Get current performance
     */
    getPerformance(): import("./engine/paper-trading-engine.js").PerformanceStats;
    /**
     * Get prediction summary
     */
    getPredictionSummary(): import("./crash-prediction-logger.js").PredictionSummary;
    /**
     * Export all data
     */
    export(): {
        engine: import("./engine/paper-trading-engine.js").ExportedData;
        predictions: string;
        performance: import("./engine/paper-trading-engine.js").PerformanceStats;
        summary: import("./crash-prediction-logger.js").PredictionSummary;
    };
}
//# sourceMappingURL=crash-paper-trading-runner.d.ts.map