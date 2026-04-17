/**
 * KAS PA - COMPREHENSIVE BOT DETECTION v2.0
 * Basierend auf SOLANA BOT-AKTIVITÄTEN LEXIKON (April 2026)
 *
 * Erkennt alle relevanten Bot-Typen via Multi-RPC + Transaktions-Analyse
 */
export type BotType = 'JITO_BUNDLE' | 'SANDWICH_BOT' | 'ARBITRAGE_BOT' | 'LIQUIDATION_BOT' | 'SNIPER_BOT' | 'BUNDLER_BOT' | 'VOLUME_BOT' | 'COPY_TRADING_BOT' | 'BACKRUN_BOT' | 'UNKNOWN';
export interface BotActivity {
    timestamp: number;
    slot: number;
    signature: string;
    type: BotType;
    wallet: string;
    fee: number;
    tipLamports?: number;
    program?: string;
    poolId?: string;
    details: string;
    confidence: number;
}
export interface BotMetrics {
    jitoBundleCount: number;
    sandwichCount: number;
    arbitrageCount: number;
    liquidationCount: number;
    sniperCount: number;
    bundlerCount: number;
    volumeCount: number;
    copyTradingCount: number;
    backrunCount: number;
    totalBotTxs: number;
    highPriorityTxCount: number;
    veryHighPriorityTxCount: number;
    totalFees: number;
    avgFee: number;
    botProbability: number;
    ephemeralWallets: number;
    newWallets: number;
    totalWalletsTracked: number;
    activeRpc: string;
    lastUpdate: number;
}
export declare class ComprehensiveBotDetector {
    private activities;
    private walletAge;
    private walletTxCount;
    private slotWallets;
    private metrics;
    private isRunning;
    private pollInterval;
    private maxActivities;
    constructor();
    private initMetrics;
    /**
     * Parse transaction and detect bot type
     */
    private parseTransaction;
    /**
     * Detect Jito tip
     */
    private detectJitoTip;
    /**
     * Extract compute unit price
     */
    private extractComputePrice;
    /**
     * Detect specific bot type based on transaction characteristics
     */
    private detectBotType;
    /**
     * Extract program IDs from instructions
     */
    private extractPrograms;
    /**
     * Scan Jito tip accounts for bot activity
     */
    private scanJitoAccounts;
    /**
     * Scan recent blocks for bot activity
     */
    private scanRecentBlocks;
    /**
     * Record bot activity and update metrics
     */
    private recordActivity;
    /**
     * Calculate overall bot probability based on activity
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
     * Get current metrics
     */
    getMetrics(): BotMetrics;
    /**
     * Get recent activities
     */
    getRecentActivities(limit?: number): BotActivity[];
    /**
     * Get activities by type
     */
    getActivitiesByType(type: BotType): BotActivity[];
    /**
     * Get top bot wallets
     */
    getTopBotWallets(limit?: number): Array<{
        wallet: string;
        count: number;
        type: BotType;
    }>;
}
export declare const comprehensiveBotDetector: ComprehensiveBotDetector;
//# sourceMappingURL=comprehensive-bot-detector.d.ts.map