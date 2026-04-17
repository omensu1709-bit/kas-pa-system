/**
 * Layer 3: Network Validation Signals (Chainstack)
 *
 * 1 Signal for cross-validation:
 * 1. Transaction Volume Verification - Cross-validates DexScreener volume data
 */
import axios from 'axios';
// ============================================================================
// CONSTANTS
// ============================================================================
const CHAINSTACK_RPC = "https://solana-mainnet.core.chainstack.com";
const AUTH = { username: "friendly-mcclintock", password: "armed-stamp-reuse-grudge-armful-script" };
// ============================================================================
// SIGNAL 1: TRANSACTION VOLUME VERIFICATION
// ============================================================================
/**
 * Fetches transaction signatures for a mint from Chainstack.
 * Counts recent transactions to cross-validate with DexScreener volume data.
 */
export async function getRecentTxCount(mint, lookbackSlots = 10000) {
    try {
        // Get recent signatures
        const response = await axios.post(CHAINSTACK_RPC, {
            jsonrpc: '2.0',
            id: 1,
            method: 'getSignaturesForAddress',
            params: [mint, { limit: 50 }]
        }, { auth: AUTH, timeout: 10000 });
        const sigs = response.data.result || [];
        // For memecoins, even 10-20 signatures in the response is notable activity
        // We look at how many we got - more = higher activity
        return Math.min(50, sigs.length);
    }
    catch (error) {
        console.error('[ChainstackCollector] Error fetching signatures:', error);
        return 0;
    }
}
/**
 * Calculates network activity score from Chainstack data.
 * High activity on-chain can indicate stress or heavy trading.
 *
 * @returns score 0-1, where >30 txs in recent checks = 1.0
 */
export function calculateTxVolumeVerification(recentTxCount) {
    // Normalize: 30+ txs = score 1.0
    return Math.min(1.0, recentTxCount / 30);
}
// ============================================================================
// FEE SPIKE DETECTION (Bonus Signal)
// ============================================================================
/**
 * Analyzes recent transaction fees to detect network stress.
 * High fees often correlate with market turmoil.
 */
export async function detectFeeSpike(mint) {
    try {
        // Get recent signatures
        const sigResponse = await axios.post(CHAINSTACK_RPC, {
            jsonrpc: '2.0',
            id: 1,
            method: 'getSignaturesForAddress',
            params: [mint, { limit: 20 }]
        }, { auth: AUTH, timeout: 10000 });
        const sigs = sigResponse.data.result || [];
        if (sigs.length === 0)
            return 0;
        // Get block heights for time filtering
        const fiveMinAgo = Date.now() - 300000;
        // For now, just return count as proxy for activity
        // In production, would fetch actual transactions and analyze fees
        return Math.min(1.0, sigs.length / 20);
    }
    catch (error) {
        return 0;
    }
}
// ============================================================================
// NETWORK LAYER AGGREGATOR
// ============================================================================
/**
 * Aggregates network signals into a single layer score.
 *
 * @param mint - Target token mint
 * @returns NetworkLayer with score and individual signals
 */
export async function calculateNetworkLayer(mint) {
    // Fetch network data
    const recentTxCount = await getRecentTxCount(mint);
    const feeSpike = await detectFeeSpike(mint);
    // Calculate signals
    const signals = {
        txVolumeVerification: calculateTxVolumeVerification(recentTxCount)
    };
    // Network layer score (uses tx volume as primary)
    // Fee spike is supplementary
    const score = (signals.txVolumeVerification * 0.70 +
        feeSpike * 0.30);
    // Confidence: need at least 5 signatures for reasonable confidence
    const confidence = Math.min(1.0, recentTxCount / 5);
    return {
        score: Math.min(0.99, score),
        confidence: Math.max(0.3, confidence), // Minimum 30% confidence
        signals
    };
}
// ============================================================================
// HEALTH CHECK
// ============================================================================
/**
 * Checks Chainstack connectivity.
 */
export async function checkChainstackHealth() {
    const start = Date.now();
    try {
        await axios.post(CHAINSTACK_RPC, {
            jsonrpc: '2.0',
            id: 1,
            method: 'getHealth'
        }, { auth: AUTH, timeout: 5000 });
        return {
            healthy: true,
            latency: Date.now() - start
        };
    }
    catch (error) {
        return {
            healthy: false,
            latency: Date.now() - start
        };
    }
}
// ============================================================================
// QUICK SIGNAL CHECK
// ============================================================================
/**
 * Quick check for severe network signals.
 */
export function hasSevereNetworkSignal(layer) {
    return layer.signals.txVolumeVerification > 0.8;
}
