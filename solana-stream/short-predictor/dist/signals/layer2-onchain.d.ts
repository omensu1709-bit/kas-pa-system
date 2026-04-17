/**
 * Layer 2: On-Chain Behavior Signals (Helius Enhanced API)
 *
 * 2 Signals derived from Helius Enhanced Transactions API:
 * 1. Whale Sell Pressure - Detects large wallet selling activity
 * 2. Unique Seller Surge - Detects mass exodus pattern
 */
export interface OnChainSignals {
    whaleSellPressure: number;
    uniqueSellerSurge: number;
}
export interface OnChainLayer {
    score: number;
    confidence: number;
    signals: OnChainSignals;
}
export interface EnhancedTransaction {
    type?: string;
    signature?: {
        signature: string;
    };
    slot?: number;
    fee?: number;
    timestamp?: number;
    tokenTransfers?: Array<{
        fromUserAccount: string;
        toUserAccount: string;
        mint: string;
        rawTokenAmount?: {
            tokenAmount: string;
            decimals: number;
        };
    }>;
    events?: {
        swap?: {
            tokenInputs?: Array<{
                userAccount: string;
                tokenAccount: string;
                mint: string;
                rawTokenAmount?: {
                    tokenAmount: string;
                    decimals: number;
                };
            }>;
            tokenOutputs?: Array<{
                userAccount: string;
                tokenAccount: string;
                mint: string;
                rawTokenAmount?: {
                    tokenAmount: string;
                    decimals: number;
                };
            }>;
        };
    };
}
/**
 * Calculates whale sell pressure from Helius Enhanced Transaction data.
 * Analyzes swap inputs to find large wallet sells (>10 SOL).
 *
 * @param txs - Array of enhanced transactions from Helius
 * @param mint - Target token mint
 * @returns score 0-1, where >0.30 = 30% whale volume = WARNING
 */
export declare function calculateWhaleSellPressure(txs: EnhancedTransaction[], mint: string): number;
/**
 * Calculates unique seller surge.
 * Detects when many different wallets are selling (mass exodus).
 *
 * @param txs - Array of enhanced transactions from Helius
 * @param mint - Target token mint
 * @returns score 0-1, where >0.75 = 15+ unique sellers = MASS EXODUS
 */
export declare function calculateUniqueSellerSurge(txs: EnhancedTransaction[], mint: string): number;
/**
 * Fetches recent transactions for a mint using Helius Enhanced API.
 */
export declare function fetchHeliusTransactions(mint: string, limit?: number): Promise<EnhancedTransaction[]>;
/**
 * Aggregates on-chain signals into a single layer score.
 *
 * @param txs - Array of enhanced transactions from Helius
 * @param mint - Target token mint
 * @returns OnChainLayer with score and individual signals
 */
export declare function calculateOnChainLayer(mint: string, txs?: EnhancedTransaction[]): Promise<OnChainLayer>;
/**
 * Quick check for severe on-chain signals.
 */
export declare function hasSevereOnChainSignal(layer: OnChainLayer): boolean;
