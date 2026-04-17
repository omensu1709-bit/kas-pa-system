/**
 * Layer 2: On-Chain Behavior Signals (Helius Enhanced API)
 *
 * 2 Signals derived from Helius Enhanced Transactions API:
 * 1. Whale Sell Pressure - Detects large wallet selling activity
 * 2. Unique Seller Surge - Detects mass exodus pattern
 */
import axios from 'axios';
// ============================================================================
// CONSTANTS
// ============================================================================
const HELIUS_KEY = "bdbceecb-7fca-4dcb-856d-a5e8c5cc38e9";
const HELIUS_ENHANCED_URL = `https://api-mainnet.helius-rpc.com/v0/transactions/?api-key=${HELIUS_KEY}`;
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
const WHALE_THRESHOLD_SOL = 10; // wallets >10 SOL = whale
// ============================================================================
// SIGNAL 1: WHALE SELL PRESSURE
// ============================================================================
/**
 * Calculates whale sell pressure from Helius Enhanced Transaction data.
 * Analyzes swap inputs to find large wallet sells (>10 SOL).
 *
 * @param txs - Array of enhanced transactions from Helius
 * @param mint - Target token mint
 * @returns score 0-1, where >0.30 = 30% whale volume = WARNING
 */
export function calculateWhaleSellPressure(txs, mint) {
    let whaleSellVolume = 0;
    let totalSellVolume = 0;
    for (const tx of txs) {
        const inputs = tx.events?.swap?.tokenInputs || [];
        for (const input of inputs) {
            if (input.mint !== mint)
                continue;
            const amount = parseFloat(input.rawTokenAmount?.tokenAmount || '0') / 1e9; // Convert to SOL
            totalSellVolume += amount;
            if (amount > WHALE_THRESHOLD_SOL) {
                whaleSellVolume += amount;
            }
        }
    }
    if (totalSellVolume === 0)
        return 0;
    // Normalize: 50% whale volume = score 1.0
    return Math.min(1.0, whaleSellVolume / (totalSellVolume * 2));
}
// ============================================================================
// SIGNAL 2: UNIQUE SELLER SURGE
// ============================================================================
/**
 * Calculates unique seller surge.
 * Detects when many different wallets are selling (mass exodus).
 *
 * @param txs - Array of enhanced transactions from Helius
 * @param mint - Target token mint
 * @returns score 0-1, where >0.75 = 15+ unique sellers = MASS EXODUS
 */
export function calculateUniqueSellerSurge(txs, mint) {
    const sellers = new Set();
    for (const tx of txs) {
        const inputs = tx.events?.swap?.tokenInputs || [];
        for (const input of inputs) {
            if (input.mint === mint) {
                sellers.add(input.userAccount);
            }
        }
    }
    // Normalize: 20 unique sellers = score 1.0
    return Math.min(1.0, sellers.size / 20);
}
// ============================================================================
// HELIUS DATA FETCHER
// ============================================================================
/**
 * Fetches recent transactions for a mint using Helius Enhanced API.
 */
export async function fetchHeliusTransactions(mint, limit = 20) {
    try {
        // First get signatures for this mint
        const sigResponse = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: '2.0',
            id: 1,
            method: 'getSignaturesForAddress',
            params: [mint, { limit }]
        }, { timeout: 10000 });
        const signatures = (sigResponse.data.result || []).map((s) => s.signature);
        if (signatures.length === 0)
            return [];
        // Fetch enhanced transaction data
        const txResponse = await axios.post(HELIUS_ENHANCED_URL, { transactions: signatures.slice(0, 10) }, // Limit to 10 for efficiency
        { timeout: 15000 });
        const txs = txResponse.data;
        return Array.isArray(txs) ? txs : [];
    }
    catch (error) {
        console.error('[HeliusCollector] Error fetching transactions:', error);
        return [];
    }
}
// ============================================================================
// ONCHAIN LAYER AGGREGATOR
// ============================================================================
/**
 * Aggregates on-chain signals into a single layer score.
 *
 * @param txs - Array of enhanced transactions from Helius
 * @param mint - Target token mint
 * @returns OnChainLayer with score and individual signals
 */
export async function calculateOnChainLayer(mint, txs) {
    // Fetch transactions if not provided
    if (!txs || txs.length === 0) {
        txs = await fetchHeliusTransactions(mint);
    }
    // Calculate individual signals
    const signals = {
        whaleSellPressure: calculateWhaleSellPressure(txs, mint),
        uniqueSellerSurge: calculateUniqueSellerSurge(txs, mint)
    };
    // Layer score: weighted average
    // Whale sell is more predictive when combined with seller surge
    const score = (signals.whaleSellPressure * 0.60 + // 60% - primary indicator
        signals.uniqueSellerSurge * 0.40 // 40% - confirmation
    );
    // Confidence based on transaction count
    const confidence = Math.min(1.0, txs.length / 10); // Need at least 10 txs for confidence
    return {
        score: Math.min(0.99, score),
        confidence,
        signals
    };
}
// ============================================================================
// QUICK SIGNAL CHECK
// ============================================================================
/**
 * Quick check for severe on-chain signals.
 */
export function hasSevereOnChainSignal(layer) {
    return (layer.signals.whaleSellPressure > 0.5 ||
        layer.signals.uniqueSellerSurge > 0.8);
}
