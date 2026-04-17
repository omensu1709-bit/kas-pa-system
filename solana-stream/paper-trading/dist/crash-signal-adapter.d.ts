/**
 * Crash Signal Adapter
 *
 * Verbindet das Crash Detection System mit dem Paper Trading Engine.
 * Übersetzt Crash Probability Signale in handelbare Positionen.
 *
 * Implementiert:
 * - Drei-Zonen Logik (IGNORE/MONITOR/IMMEDIATE_SHORT)
 * - Kelly Position Sizing
 * - Drawdown Circuit Breaker
 * - Take-Profit Ladder
 */
import { PaperTradingEngine } from './engine/paper-trading-engine.js';
import type { Position } from './engine/paper-trading-engine.js';
export interface CrashSignal {
    token: string;
    crashProbability: number;
    confirmingMetrics: number;
    zScores: Record<string, number>;
    slot: number;
    timestamp: number;
    zone: SignalZone;
}
export declare enum SignalZone {
    IGNORE = "IGNORE",// P < 0.10
    MONITOR = "MONITOR",// 0.10 <= P < 0.20
    IMMEDIATE_SHORT = "IMMEDIATE_SHORT"
}
export interface CrashTradingConfig {
    ignoreThreshold: number;
    monitorThreshold: number;
    kellyFraction: number;
    kellyMode: 'full' | 'half' | 'quarter';
    maxPositionPercent: number;
    maxTotalExposure: number;
    maxPositions: number;
    drawdown10Percent: number;
    drawdown20Percent: number;
    drawdown30Percent: number;
    stopLossPercent: number;
    takeProfitLevels: TakeProfitLevel[];
    maxHoldingHours: number;
    leverage: number;
    minConfirmingMetrics: number;
}
export interface TakeProfitLevel {
    percentDrop: number;
    exitPercent: number;
}
export interface CrashTradingState {
    isHalted: boolean;
    haltUntil?: number;
    sizingMultiplier: number;
    currentDrawdown: number;
    activeSignals: Map<string, CrashSignal>;
}
export declare const DEFAULT_CRASH_TRADING_CONFIG: CrashTradingConfig;
export declare class CrashSignalAdapter {
    private engine;
    private config;
    private state;
    private startingCapital;
    private operatorPubkey;
    constructor(engine: PaperTradingEngine, config?: Partial<CrashTradingConfig>, operatorPubkey?: string);
    /**
     * Bestimmt die Signal-Zone basierend auf Crash Probability
     */
    getZone(crashProbability: number): SignalZone;
    /**
     * Berechnet Kelly Position Size
     */
    calculateKellySize(currentCapital: number): number;
    /**
     * Verarbeitet ein Crash Signal und führt ggf. Trades aus
     */
    processSignal(signal: CrashSignal): Promise<SignalProcessingResult>;
    /**
     * Prüft Drawdown und löst Circuit Breaker aus
     */
    private checkDrawdown;
    /**
     * Prüft ob eine Position geschlossen werden sollte
     */
    checkExitConditions(position: Position, currentPrice: number): Promise<ExitCheckResult>;
    /**
     * Gibt aktuellen Trading State zurück
     */
    getState(): CrashTradingState;
    /**
     * Setzt den Starting Capital
     */
    setStartingCapital(capital: number): void;
}
export interface SignalProcessingResult {
    signal: CrashSignal;
    zone: SignalZone;
    action: 'ignored' | 'monitoring' | 'position_opened' | 'rejected' | 'halted' | 'error';
    details: Record<string, any>;
}
export interface ExitCheckResult {
    shouldExit: boolean;
    reason?: 'stop_loss' | 'take_profit' | 'time_limit';
    exitPercent?: number;
}
//# sourceMappingURL=crash-signal-adapter.d.ts.map