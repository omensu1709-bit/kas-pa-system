import { VerifiedPrice } from '../oracle/multi-source-oracle.js';
/**
 * Paper Trading Engine
 * Manipulationssichere Trading-Engine mit vollständigem Audit Trail
 */
export declare class PaperTradingEngine {
    private positions;
    private tradeHistory;
    private totalPnlSol;
    private startingCapital;
    private currentCapital;
    private hashChain;
    private blockchainAnchor;
    private oracle;
    private guards;
    private auditLogger;
    private operatorPubkey;
    constructor(config: EngineConfig);
    /**
     * Öffnet eine neue Position
     */
    openPosition(tokenMint: string, amount: number, signalSource: string): Promise<OpenPositionResult>;
    /**
     * Schließt eine existierende Position
     */
    closePosition(tokenMint: string, reason: CloseReason): Promise<ClosePositionResult>;
    /**
     * Berechnet P&L für einen Trade
     */
    private calculatePnl;
    /**
     * Gibt aktuellen System-State zurück
     */
    private getSystemState;
    /**
     * Gibt Performance-Statistiken zurück
     */
    getPerformance(): PerformanceStats;
    /**
     * Verifiziert die gesamte Trade-Historie
     */
    verify(): VerificationReport;
    /**
     * Exportiert alle Trade-Daten
     */
    export(): ExportedData;
}
export interface EngineConfig {
    startingCapital: number;
    operatorPubkey: string;
    rpcEndpoint: string;
    payerKeypair: any;
    priceSources: any[];
}
export interface Position {
    id: string;
    tokenMint: string;
    amount: number;
    entryPrice: number;
    entrySlot: number;
    entryTime: number;
    signalSource: string;
    status: 'OPEN' | 'CLOSED';
    exitPrice?: number;
    exitTime?: number;
    pnlSol?: number;
    pnlPercent?: number;
}
export interface Trade extends Position {
    type: 'ENTRY' | 'EXIT';
}
export interface ClosedTrade extends Trade {
    holdingSlots: number;
    closeReason: CloseReason;
}
export type CloseReason = 'TAKE_PROFIT' | 'STOP_LOSS' | 'MANUAL' | 'SIGNAL_EXIT' | 'LIQUIDATION';
export interface SystemState {
    totalValue: number;
    openPositionsCount: number;
    totalPnl: number;
    lastTradeTime: number;
    recentTrades: Trade[];
}
export interface OpenPositionResult {
    success: boolean;
    error?: string;
    rejected?: boolean;
    position?: Position;
    entryPrice?: VerifiedPrice;
    chainHash?: string;
    anchorSlot?: number;
    guardDetails?: any;
}
export interface ClosePositionResult {
    success: boolean;
    error?: string;
    trade?: ClosedTrade;
    totalPnl?: number;
    currentCapital?: number;
    chainHash?: string;
    anchorSlot?: number;
}
export interface PerformanceStats {
    startingCapital: number;
    currentCapital: number;
    totalPnlSol: number;
    totalPnlPercent: number;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    averageTrade: number;
    largestWin: number;
    largestLoss: number;
    openPositions: Position[];
    recentTrades: ClosedTrade[];
}
export interface VerificationReport {
    chainValid: boolean;
    chainErrors: string[];
    auditValid: boolean;
    auditErrors: string[];
    totalTrades: number;
    totalPnl: number;
    verifiedAt: number;
}
export interface ExportedData {
    startingCapital: number;
    currentCapital: number;
    totalPnlSol: number;
    positions: Position[];
    tradeHistory: Trade[];
    hashChain: string;
    auditLogs: string;
    exportedAt: number;
}
//# sourceMappingURL=paper-trading-engine.d.ts.map