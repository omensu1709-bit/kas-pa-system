/**
 * Standalone Crash Paper Trading Runner
 *
 * Self-contained version that doesn't depend on external module compilation.
 * Can be run directly with: npx ts-node --esm src/crash-paper-trading-simple.ts
 * Or compiled separately.
 */
interface PredictionRecord {
    id: string;
    timestamp: number;
    slot: number;
    token: string;
    rawMetrics: Record<string, number>;
    zScores: Record<string, number>;
    crashProbability: number;
    confirmingMetrics: number;
    zone: string;
    action?: string;
    actionReason?: string;
    positionId?: string;
    actualCrash?: boolean;
    verificationStatus: string;
    hash: string;
}
declare class PredictionLogger {
    private predictions;
    log(token: string, slot: number, raw: Record<string, number>, z: Record<string, number>, prob: number, confirming: string[], zone: string): PredictionRecord;
    getHighProbabilitySignals(threshold?: number): PredictionRecord[];
    getSummary(): {
        totalPredictions: number;
        zoneDistribution: {
            IGNORE: number;
            MONITOR: number;
            IMMEDIATE_SHORT: number;
        };
        tradingSignals: {
            total: number;
            accepted: number;
            rejected: number;
        };
    };
    exportCSV(): string;
}
interface Position {
    id: string;
    tokenMint: string;
    amount: number;
    entryPrice: number;
    entrySlot: number;
    entryTime: number;
    signalSource: string;
    status: string;
    pnlSol?: number;
}
interface Trade extends Position {
    type: 'ENTRY' | 'EXIT';
}
declare class SimplePaperEngine {
    private startingCapital;
    positions: Map<string, Position>;
    history: Trade[];
    totalPnl: number;
    capital: number;
    constructor(startingCapital: number);
    openPosition(tokenMint: string, amount: number, signalSource: string): Promise<{
        success: boolean;
        position: Position;
    }>;
    closePosition(tokenMint: string, reason: string): Promise<{
        success: boolean;
        error: string;
        pnl?: undefined;
        totalPnl?: undefined;
    } | {
        success: boolean;
        pnl: number;
        totalPnl: number;
        error?: undefined;
    }>;
    getPerformance(): {
        startingCapital: number;
        currentCapital: number;
        totalPnlSol: number;
        totalTrades: number;
        winningTrades: number;
        losingTrades: number;
        winRate: number;
        openPositions: Position[];
    };
}
declare enum Zone {
    IGNORE = "IGNORE",
    MONITOR = "MONITOR",
    IMMEDIATE_SHORT = "IMMEDIATE_SHORT"
}
interface CrashSignal {
    token: string;
    crashProbability: number;
    confirmingMetrics: number;
    zScores: Record<string, number>;
    slot: number;
    timestamp: number;
    zone: Zone;
}
declare class CrashSignalAdapter {
    private engine;
    private logger;
    private config;
    constructor(engine: SimplePaperEngine, logger: PredictionLogger, config?: {
        ignoreThreshold: number;
        monitorThreshold: number;
        kellyMode: string;
        maxPositions: number;
        minConfirming: number;
    });
    getZone(prob: number): Zone;
    processSignal(signal: CrashSignal): Promise<{
        action: string;
        positionId: string;
        size: number;
        reason?: undefined;
    } | {
        action: string;
        reason: any;
        positionId?: undefined;
        size?: undefined;
    }>;
}
export declare class CrashPaperTradingRunner {
    private tokens;
    private engine;
    private adapter;
    private logger;
    private metrics;
    private stats;
    constructor(tokens: string[], engine: SimplePaperEngine, adapter: CrashSignalAdapter, logger: PredictionLogger);
    processMarketData(token: string, slot: number, price: number, volume: number, accounts: string[]): void;
    private updateStats;
    computeSignal(token: string, slot: number): CrashSignal | null;
    run(intervalMs?: number): Promise<void>;
    getPerformance(): {
        startingCapital: number;
        currentCapital: number;
        totalPnlSol: number;
        totalTrades: number;
        winningTrades: number;
        losingTrades: number;
        winRate: number;
        openPositions: Position[];
    };
    getPredictionSummary(): {
        totalPredictions: number;
        zoneDistribution: {
            IGNORE: number;
            MONITOR: number;
            IMMEDIATE_SHORT: number;
        };
        tradingSignals: {
            total: number;
            accepted: number;
            rejected: number;
        };
    };
}
export {};
//# sourceMappingURL=crash-paper-trading-simple.d.ts.map