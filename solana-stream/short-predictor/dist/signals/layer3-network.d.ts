/**
 * Layer 3: Network Validation Signals (Chainstack)
 *
 * 1 Signal for cross-validation:
 * 1. Transaction Volume Verification - Cross-validates DexScreener volume data
 */
export interface NetworkSignals {
    txVolumeVerification: number;
}
export interface NetworkLayer {
    score: number;
    confidence: number;
    signals: NetworkSignals;
}
/**
 * Fetches transaction signatures for a mint from Chainstack.
 * Counts recent transactions to cross-validate with DexScreener volume data.
 */
export declare function getRecentTxCount(mint: string, lookbackSlots?: number): Promise<number>;
/**
 * Calculates network activity score from Chainstack data.
 * High activity on-chain can indicate stress or heavy trading.
 *
 * @returns score 0-1, where >30 txs in recent checks = 1.0
 */
export declare function calculateTxVolumeVerification(recentTxCount: number): number;
/**
 * Analyzes recent transaction fees to detect network stress.
 * High fees often correlate with market turmoil.
 */
export declare function detectFeeSpike(mint: string): Promise<number>;
/**
 * Aggregates network signals into a single layer score.
 *
 * @param mint - Target token mint
 * @returns NetworkLayer with score and individual signals
 */
export declare function calculateNetworkLayer(mint: string): Promise<NetworkLayer>;
/**
 * Checks Chainstack connectivity.
 */
export declare function checkChainstackHealth(): Promise<{
    healthy: boolean;
    latency: number;
}>;
/**
 * Quick check for severe network signals.
 */
export declare function hasSevereNetworkSignal(layer: NetworkLayer): boolean;
