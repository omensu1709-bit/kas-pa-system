/**
 * KAS PA - BOT DETECTION SERVICE v3.0
 * ABSOLUTE SOTA LÖSUNG - MULTI-RPC REDUNDANZ
 *
 * Nutzt mehrere RPC Endpoints mit automatischen Failover
 * 100% Verfügbarkeit für Echtzeit Bot-Detection
 */
export interface BotActivity {
    timestamp: number;
    slot: number;
    signature: string;
    type: 'JITO_BUNDLE' | 'HIGH_PRIORITY' | 'MEV' | 'SANDWICH' | 'FRONTRUN' | 'UNKNOWN';
    wallet: string;
    fee: number;
    tipLamports?: number;
    program?: string;
    details: string;
}
export interface BotMetrics {
    jitoBundleCount: number;
    highPriorityTxCount: number;
    veryHighPriorityTxCount: number;
    mevTxCount: number;
    sandwichCount: number;
    totalFees: number;
    avgFee: number;
    botProbability: number;
    ephemeralWallets: number;
    newWallets: number;
    totalWalletsTracked: number;
    activeRpc: string;
    lastUpdate: number;
}
export declare class MultiRpcBotDetector {
    private activities;
    private walletAge;
    private metrics;
    private isRunning;
    private pollInterval;
    private maxActivities;
    private jitoAccounts;
    constructor(jitoAccounts?: string[]);
    private initMetrics;
    /**
     * Detect Jito tip in transaction
     */
    private detectJitoTip;
    /**
     * Parse transaction for bot activity
     */
    private parseTransaction;
    /**
     * Fetch and process transactions from Jito tip accounts
     */
    private scanJitoAccounts;
    /**
     * Scan recent blocks for bot activity
     */
    private scanRecentBlocks;
    /**
     * Record bot activity
     */
    private recordActivity;
    /**
     * Calculate bot probability
     */
    private updateBotProbability;
    /**
     * Start bot detection
     */
    start(): Promise<void>;
    /**
     * Stop bot detection
     */
    stop(): void;
    /**
     * Get metrics
     */
    getMetrics(): BotMetrics;
    /**
     * Get recent activities
     */
    getRecentActivities(limit?: number): BotActivity[];
}
export declare const multiRpcBotDetector: MultiRpcBotDetector;
//# sourceMappingURL=bot-detection-service.d.ts.map