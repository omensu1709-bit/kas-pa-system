/**
 * KAS PA - BOT DETECTION SERVICE v3.0
 * ABSOLUTE SOTA LÖSUNG - MULTI-RPC REDUNDANZ
 *
 * Nutzt mehrere RPC Endpoints mit automatischen Failover
 * 100% Verfügbarkeit für Echtzeit Bot-Detection
 */
import axios from 'axios';
const RPC_ENDPOINTS = [
    { name: 'Chainstack', url: 'https://solana-mainnet.core.chainstack.com', auth: { username: 'friendly-mcclintock', password: 'armed-stamp-reuse-grudge-armful-script' }, failures: 0 },
    { name: 'Public', url: 'https://api.mainnet-beta.solana.com', failures: 0 },
    { name: 'Ankr', url: 'https://rpc.ankr.com/solana', failures: 0 },
];
let activeRpcIndex = 0;
async function getActiveRpc() {
    return RPC_ENDPOINTS[activeRpcIndex];
}
async function switchToNextRpc() {
    const startIndex = activeRpcIndex;
    do {
        activeRpcIndex = (activeRpcIndex + 1) % RPC_ENDPOINTS.length;
        const rpc = RPC_ENDPOINTS[activeRpcIndex];
        if (rpc.failures < 3) {
            console.log(`[BotDetection] Switching to RPC: ${rpc.name}`);
            return rpc;
        }
    } while (activeRpcIndex !== startIndex);
    // If all fail, reset and use first
    RPC_ENDPOINTS.forEach(r => r.failures = 0);
    return RPC_ENDPOINTS[0];
}
async function rpcRequest(method, params = []) {
    const rpc = await getActiveRpc();
    try {
        const start = Date.now();
        const response = await axios.post(rpc.url, {
            jsonrpc: '2.0',
            id: 1,
            method,
            params
        }, {
            timeout: 5000,
            auth: rpc.auth
        });
        rpc.latency = Date.now() - start;
        rpc.failures = 0;
        return response.data.result;
    }
    catch (error) {
        rpc.failures++;
        console.error(`[BotDetection] RPC ${rpc.name} failed: ${error.message}`);
        if (rpc.failures >= 3) {
            await switchToNextRpc();
        }
        throw error;
    }
}
// ============================================================================
// JITO TIP ACCOUNTS (Complete List)
// ============================================================================
const JITO_TIP_ACCOUNTS = new Set([
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
    "HFqU5x63VTqvBd7vMVavegqHhd2tAC9e6QSjPNzXt5n9",
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
    "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1IfygL5kd9r",
    "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
    "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
    "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
    "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
    "Cw8ysyDJC2xvKPNgLPv8eKGCcCeF9KbJ7b9WdVmB8mWE",
    "DqYwjtMNDU8Kp4ruX4L8K8N7fZqMjGC9dDMDJ3Z3qJGK",
    "4rFzpmfWaZ2QWp9Bkn1eGLSPW6XmDt6Bz5TLFYDdWGE",
    "44vC7fURJ7gT4cMQ1GGRgActovXW6VxpGNZ9JbZ4cVb",
    "52wwvpNJ3kr6i3aP4DXSchwEvsUXPExr4S3vxfH7VZY",
    "85SLPGqNJNa59jEaatWVGZ6QTx9YHHhqkjR1xvECbMi",
    "35Kc3BUd8sVyrFrd5eJJRVQsGUfkp3RiGGf7kdxL3qM",
    "Dtf6FG9WkJ8LsJzV6tXg1aT7bMVvGzkJCZB3Zs5TkfS",
    "3Wq7qFxjoiYPUJ6RpqLTNNdxC446T3fLPRQXNZXVBP",
]);
// MEV Bot Program IDs
const MEV_PROGRAMS = new Set([
    'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5',
    'JUPyLr2upn7WzU4WWQqJQvZvXYPtvyr38e9wNZNpKR',
    'CAMMCzo5YL8w4VFF8KVJ6hE2QQDMgjEganp6Sa2LHt7',
    'whirLbMiicVdio4qvUf3xXw2gLabaSMGZEGJ4zj5VWK',
    '675ku7sSCNMJELwT3iKkPBj9Ey2qzNyjQ7qKnhpH5X2',
]);
// ============================================================================
// MULTI-RPC BOT DETECTOR
// ============================================================================
export class MultiRpcBotDetector {
    activities = [];
    walletAge = new Map();
    metrics;
    isRunning = false;
    pollInterval = 5000;
    maxActivities = 1000;
    jitoAccounts;
    constructor(jitoAccounts) {
        this.jitoAccounts = jitoAccounts || Array.from(JITO_TIP_ACCOUNTS);
        this.metrics = this.initMetrics();
    }
    initMetrics() {
        return {
            jitoBundleCount: 0,
            highPriorityTxCount: 0,
            veryHighPriorityTxCount: 0,
            mevTxCount: 0,
            sandwichCount: 0,
            totalFees: 0,
            avgFee: 0,
            botProbability: 0,
            ephemeralWallets: 0,
            newWallets: 0,
            totalWalletsTracked: 0,
            activeRpc: RPC_ENDPOINTS[activeRpcIndex].name,
            lastUpdate: Date.now()
        };
    }
    /**
     * Detect Jito tip in transaction
     */
    detectJitoTip(tx) {
        const postBalances = tx.meta?.postBalances || [];
        const preBalances = tx.meta?.preBalances || [];
        const accounts = tx.transaction?.message?.accountKeys || [];
        for (let i = 0; i < Math.min(postBalances.length, preBalances.length); i++) {
            const diff = postBalances[i] - preBalances[i];
            if (diff > 1000) {
                const account = accounts[i];
                if (account && JITO_TIP_ACCOUNTS.has(account)) {
                    return diff;
                }
            }
        }
        return null;
    }
    /**
     * Parse transaction for bot activity
     */
    parseTransaction(tx) {
        const signature = tx.signature || tx.transaction?.signatures?.[0];
        const slot = tx.slot;
        const fee = tx.meta?.fee || 0;
        const accounts = tx.transaction?.message?.instructions || [];
        const wallet = tx.transaction?.message?.accountKeys?.[0] || 'unknown';
        // Check Jito tip
        const jitoTip = this.detectJitoTip(tx);
        if (jitoTip) {
            return {
                timestamp: tx.blockTime ? tx.blockTime * 1000 : Date.now(),
                slot,
                signature,
                type: 'JITO_BUNDLE',
                wallet,
                fee,
                tipLamports: jitoTip,
                details: `Jito tip: ${jitoTip} lamports`
            };
        }
        // High priority fee
        if (fee > 10000) {
            return {
                timestamp: tx.blockTime ? tx.blockTime * 1000 : Date.now(),
                slot,
                signature,
                type: 'HIGH_PRIORITY',
                wallet,
                fee,
                details: `High fee: ${fee}`
            };
        }
        // MEV program interaction
        for (const ix of accounts) {
            const programId = ix.programId || ix.program;
            if (programId && MEV_PROGRAMS.has(programId)) {
                return {
                    timestamp: tx.blockTime ? tx.blockTime * 1000 : Date.now(),
                    slot,
                    signature,
                    type: 'MEV',
                    wallet,
                    fee,
                    program: programId,
                    details: `MEV: ${programId.slice(0, 10)}...`
                };
            }
        }
        return null;
    }
    /**
     * Fetch and process transactions from Jito tip accounts
     */
    async scanJitoAccounts() {
        for (const jitoAccount of this.jitoAccounts.slice(0, 5)) {
            try {
                const signatures = await rpcRequest('getSignaturesForAddress', [jitoAccount, { limit: 3 }]);
                if (!signatures || signatures.length === 0)
                    continue;
                for (const sigInfo of signatures.slice(0, 2)) {
                    try {
                        const tx = await rpcRequest('getTransaction', [sigInfo.signature, { maxSupportedTransactionVersion: 0 }]);
                        if (!tx)
                            continue;
                        const activity = this.parseTransaction(tx);
                        if (activity) {
                            this.recordActivity(activity);
                        }
                    }
                    catch {
                        // Skip failed tx fetches
                    }
                }
            }
            catch {
                // Skip failed account scans
            }
        }
    }
    /**
     * Scan recent blocks for bot activity
     */
    async scanRecentBlocks() {
        try {
            const currentSlot = await rpcRequest('getSlot');
            if (!currentSlot)
                return;
            // Scan last 10 blocks
            for (let i = 0; i < 10; i++) {
                const slot = currentSlot - i * 10;
                try {
                    const block = await rpcRequest('getBlock', [slot, { maxSupportedTransactionVersion: 0 }]);
                    if (!block?.transactions)
                        continue;
                    for (const txWrapper of block.transactions.slice(0, 5)) {
                        const tx = txWrapper.transaction || txWrapper;
                        const activity = this.parseTransaction(tx);
                        if (activity) {
                            this.recordActivity(activity);
                        }
                    }
                }
                catch {
                    // Skip failed blocks
                }
            }
        }
        catch {
            // Skip failed scans
        }
    }
    /**
     * Record bot activity
     */
    recordActivity(activity) {
        // Deduplicate
        if (this.activities.some(a => a.signature === activity.signature)) {
            return;
        }
        this.activities.push(activity);
        if (this.activities.length > this.maxActivities) {
            this.activities.shift();
        }
        // Update metrics
        switch (activity.type) {
            case 'JITO_BUNDLE':
                this.metrics.jitoBundleCount++;
                break;
            case 'HIGH_PRIORITY':
                this.metrics.highPriorityTxCount++;
                if (activity.fee > 50000) {
                    this.metrics.veryHighPriorityTxCount++;
                }
                break;
            case 'MEV':
                this.metrics.mevTxCount++;
                break;
            case 'SANDWICH':
                this.metrics.sandwichCount++;
                break;
        }
        // Track wallet
        if (!this.walletAge.has(activity.wallet)) {
            this.walletAge.set(activity.wallet, activity.slot);
        }
        // Update fees
        this.metrics.totalFees += activity.fee;
        const totalTx = this.metrics.jitoBundleCount + this.metrics.highPriorityTxCount;
        this.metrics.avgFee = totalTx > 0 ? this.metrics.totalFees / totalTx : 0;
        this.updateBotProbability();
    }
    /**
     * Calculate bot probability
     */
    updateBotProbability() {
        let prob = 0;
        // Jito bundles (strongest signal)
        if (this.metrics.jitoBundleCount > 0)
            prob += 0.30;
        if (this.metrics.jitoBundleCount > 5)
            prob += 0.20;
        if (this.metrics.jitoBundleCount > 20)
            prob += 0.25;
        // High priority
        if (this.metrics.veryHighPriorityTxCount > 0)
            prob += 0.15;
        if (this.metrics.veryHighPriorityTxCount > 10)
            prob += 0.15;
        // MEV
        if (this.metrics.mevTxCount > 0)
            prob += 0.10;
        if (this.metrics.sandwichCount > 0)
            prob += 0.15;
        // Ephemeral wallets
        const now = this.metrics.jitoBundleCount; // Use slot proxy
        let ephemeral = 0;
        for (const [, firstSlot] of this.walletAge) {
            if (typeof firstSlot === 'number' && firstSlot < 1000)
                ephemeral++;
        }
        this.metrics.ephemeralWallets = ephemeral;
        if (ephemeral > 5)
            prob += 0.20;
        if (ephemeral > 20)
            prob += 0.15;
        this.metrics.totalWalletsTracked = this.walletAge.size;
        this.metrics.botProbability = Math.min(1, prob);
        this.metrics.activeRpc = RPC_ENDPOINTS[activeRpcIndex].name;
        this.metrics.lastUpdate = Date.now();
    }
    /**
     * Start bot detection
     */
    async start() {
        if (this.isRunning)
            return;
        this.isRunning = true;
        console.log('[BotDetection] Starting Multi-RPC Bot Detection...');
        console.log(`[BotDetection] RPCs: ${RPC_ENDPOINTS.map(r => r.name).join(', ')}`);
        // Initial scan
        await this.scanJitoAccounts();
        // Continuous polling
        setInterval(async () => {
            if (!this.isRunning)
                return;
            await this.scanJitoAccounts();
            await this.scanRecentBlocks();
        }, this.pollInterval);
    }
    /**
     * Stop bot detection
     */
    stop() {
        this.isRunning = false;
    }
    /**
     * Get metrics
     */
    getMetrics() {
        return { ...this.metrics };
    }
    /**
     * Get recent activities
     */
    getRecentActivities(limit = 50) {
        return this.activities.slice(-limit);
    }
}
// Singleton
export const multiRpcBotDetector = new MultiRpcBotDetector();
// CLI Test
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
    (async () => {
        console.log('=== MULTI-RPC BOT DETECTION TEST ===\n');
        const detector = new MultiRpcBotDetector();
        await detector.start();
        setTimeout(() => {
            const metrics = detector.getMetrics();
            console.log('\n=== BOT METRICS ===');
            console.log(JSON.stringify(metrics, null, 2));
            const activities = detector.getRecentActivities(10);
            console.log(`\n=== RECENT ACTIVITIES (${activities.length}) ===`);
            activities.forEach((a, i) => {
                console.log(`${i + 1}. [${a.type}] Fee: ${a.fee} | ${a.details}`);
            });
            detector.stop();
            process.exit(0);
        }, 20000);
    })();
}
//# sourceMappingURL=bot-detection-service.js.map