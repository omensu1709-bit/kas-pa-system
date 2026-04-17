import { PaperTradingEngine } from '../engine/paper-trading-engine.js';
/**
 * REST API Server für Investor Dashboard
 * Bietet read-only Zugang zu Trading-Daten
 */
export declare class InvestorAPI {
    private engine;
    private server;
    private port;
    constructor(engine: PaperTradingEngine, port?: number);
    /**
     * Startet den API Server
     */
    start(): void;
    /**
     * Stoppt den Server
     */
    stop(): void;
    /**
     * Handle eingehende Requests
     */
    private handleRequest;
    /**
     * Health Check
     */
    private handleHealth;
    /**
     * Performance Statistiken
     */
    private handlePerformance;
    /**
     * Offene Positionen
     */
    private handlePositions;
    /**
     * Trade Historie
     */
    private handleTrades;
    /**
     * Verifizierung
     */
    private handleVerify;
    /**
     * Export
     */
    private handleExport;
    /**
     * Alerts
     */
    private handleAlerts;
}
//# sourceMappingURL=investor-api.d.ts.map