/**
 * KAS PA - COMPREHENSIVE BOT DETECTION v2.0
 * Basierend auf SOLANA BOT-AKTIVITÄTEN LEXIKON (April 2026)
 *
 * Erkennt alle relevanten Bot-Typen via Multi-RPC + Transaktions-Analyse
 */
import axios from 'axios';
const RPC_ENDPOINTS = [
    { name: 'Chainstack', url: 'https://solana-mainnet.core.chainstack.com', auth: { username: 'friendly-mcclintock', password: 'armed-stamp-reuse-grudge-armful-script' }, failures: 0 },
    { name: 'Public', url: 'https://api.mainnet-beta.solana.com', failures: 0 },
];
let activeRpcIndex = 0;
async function rpcRequest(method, params = []) {
    const rpc = RPC_ENDPOINTS[activeRpcIndex];
    try {
        const response = await axios.post(rpc.url, {
            jsonrpc: '2.0', id: 1, method, params
        }, { timeout: 5000, auth: rpc.auth });
        rpc.failures = 0;
        return response.data.result;
    }
    catch (error) {
        rpc.failures++;
        if (rpc.failures >= 3) {
            activeRpcIndex = (activeRpcIndex + 1) % RPC_ENDPOINTS.length;
        }
        throw error;
    }
}
// ============================================================================
// KNOWN ADDRESSES (aus Lexikon)
// ============================================================================
// Jito Tip Accounts (8 bekannte)
const JITO_TIP_ACCOUNTS = new Set([
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
    "HFqU5x63VTqvBd7vMVavegqHhd2tAC9e6QSjPNzXt5n9",
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
    "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1IfygL5kd9r",
    "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
    "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
    "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
    "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
]);
// Known Sandwich Bots (aus Lexikon)
const SANDWICH_PROGRAMS = new Set([
    "vpeNALhF2ESyLoN7jPgJfC3PoJTDv2TLv5vK8T6D", // DeezNode VPE Bot
]);
// DEX Programme
const DEX_PROGRAMS = new Set([
    "CAMMCzo5YL8w4VFF8KVJ6hE2QQDMgjEganp6Sa2LHt7", // Orca
    "whirLbMiicVdio4qvUf3xXw2gLabaSMGZEGJ4zj5VWK", // Raydium
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV", // Jupiter
    "pL4QS2KaxHSJPLxNMJNXqY7pMxJJddX44PeGbgLy2NR", // Raydium CLMM
    "orcaEKTdK7LKz57wiJPKJe1VJs2vMbeNFJnVPS2Hkqe", // Orca Whirlpool
]);
// Lending Programme (für Liquidation Detection)
const LENDING_PROGRAMS = new Set([
    "MRQ1NTx2V3pXbJkWCS3CDW4qJELJbCd2Nu8TkVRkUi", // Marginfi
    "KAM2Nj2rCND1eC6xPCjN9yq7N4a7rW9vXcQ5mG4sDF", // Kamino
    "driftAum96MpkL3zuJDoRvmWxNMqBjD5ZnJqEqC1", // Drift
    "7My86QbgV9LtrJfTLNiE2gnXzLJjCQsXP9FgWjLmH", // Mango
    "SoLendXob6hCVgLs3Dc4J6o4iGJBrJ3v7PCYMD3X", // Solend
]);
// Pump.fun Program
const PUMPFUN_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
// ============================================================================
// COMPREHENSIVE BOT DETECTOR
// ============================================================================
export class ComprehensiveBotDetector {
    activities = [];
    walletAge = new Map();
    walletTxCount = new Map();
    slotWallets = new Map();
    metrics;
    isRunning = false;
    pollInterval = 5000;
    maxActivities = 2000;
    constructor() {
        this.metrics = this.initMetrics();
    }
    initMetrics() {
        return {
            jitoBundleCount: 0,
            sandwichCount: 0,
            arbitrageCount: 0,
            liquidationCount: 0,
            sniperCount: 0,
            bundlerCount: 0,
            volumeCount: 0,
            copyTradingCount: 0,
            backrunCount: 0,
            totalBotTxs: 0,
            highPriorityTxCount: 0,
            veryHighPriorityTxCount: 0,
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
     * Parse transaction and detect bot type
     */
    parseTransaction(tx, slot) {
        const signature = tx.signature || tx.transaction?.signatures?.[0];
        const meta = tx.meta || {};
        const message = tx.transaction?.message || {};
        const instructions = message.instructions || [];
        const accounts = message.accountKeys || [];
        const wallet = accounts[0] || 'unknown';
        const fee = meta.fee || 0;
        // Get compute units
        const computeUnits = meta.computeUnitsConsumed || 0;
        const computePrice = this.extractComputePrice(tx);
        // Check for Jito tip (Bundle indicator)
        const jitoTip = this.detectJitoTip(tx);
        if (jitoTip) {
            return this.detectBotType(tx, slot, wallet, fee, jitoTip, computeUnits, instructions, accounts);
        }
        // High priority fee detection
        if (fee > 10000 || computePrice > 100000) {
            return this.detectBotType(tx, slot, wallet, fee, 0, computeUnits, instructions, accounts);
        }
        return null;
    }
    /**
     * Detect Jito tip
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
     * Extract compute unit price
     */
    extractComputePrice(tx) {
        const instructions = tx.transaction?.message?.instructions || [];
        for (const ix of instructions) {
            const data = ix.data || '';
            // SetComputeUnitPrice instruction
            if (data.startsWith('06')) {
                // Decode the price from hex
                try {
                    const hex = data.slice(2);
                    return parseInt(hex, 16) || 0;
                }
                catch {
                    return 0;
                }
            }
        }
        return 0;
    }
    /**
     * Detect specific bot type based on transaction characteristics
     */
    detectBotType(tx, slot, wallet, fee, tipLamports, computeUnits, instructions, accounts) {
        const signature = tx.signature || tx.transaction?.signatures?.[0];
        const programs = this.extractPrograms(instructions);
        const programIds = new Set(programs);
        // 1. LIQUIDATION BOT Detection
        //的特征: Lending Programme, liquidate instruction, hohe Tips
        for (const program of programs) {
            if (LENDING_PROGRAMS.has(program)) {
                const hasLiquidationIx = instructions.some((ix) => {
                    const data = ix.data || '';
                    return data.startsWith('02') || data.includes('liquidate');
                });
                if (hasLiquidationIx || tipLamports > 10000000) {
                    return {
                        timestamp: tx.blockTime ? tx.blockTime * 1000 : Date.now(),
                        slot,
                        signature,
                        type: 'LIQUIDATION_BOT',
                        wallet,
                        fee,
                        tipLamports,
                        program,
                        details: tipLamports > 0 ? `Tip: ${(tipLamports / 1e9).toFixed(3)} SOL` : `CU: ${computeUnits}`,
                        confidence: tipLamports > 10000000 ? 0.95 : 0.85
                    };
                }
            }
        }
        // 2. SNIPER BOT Detection (Pump.fun)
        // 特征: Pump.fun program, token age < 3 slots, hohe CU price
        if (programs.includes(PUMPFUN_PROGRAM) || programIds.has(PUMPFUN_PROGRAM)) {
            const cuPrice = this.extractComputePrice(tx);
            if (cuPrice > 500000) { // Typisch für Sniper
                return {
                    timestamp: tx.blockTime ? tx.blockTime * 1000 : Date.now(),
                    slot,
                    signature,
                    type: 'SNIPER_BOT',
                    wallet,
                    fee,
                    tipLamports,
                    program: PUMPFUN_PROGRAM,
                    details: `Pump.fun sniper | CU Price: ${cuPrice}`,
                    confidence: 0.90
                };
            }
        }
        // 3. SANDWICH BOT Detection
        // 特征: 3 TXs im Bundle, gleiche Pool, ephemeral wallets
        if (tipLamports > 0) {
            const slotSet = this.slotWallets.get(slot) || new Set();
            slotSet.add(wallet);
            this.slotWallets.set(slot, slotSet);
            // Check für DEX Programme (Raydium, Orca, Jupiter)
            const hasDex = programs.some(p => DEX_PROGRAMS.has(p));
            if (hasDex && tipLamports > 1000000) {
                return {
                    timestamp: tx.blockTime ? tx.blockTime * 1000 : Date.now(),
                    slot,
                    signature,
                    type: 'SANDWICH_BOT',
                    wallet,
                    fee,
                    tipLamports,
                    program: programs.find(p => DEX_PROGRAMS.has(p)),
                    details: `Sandwich: DEX swap | Tip: ${(tipLamports / 1e9).toFixed(4)} SOL`,
                    confidence: 0.85
                };
            }
        }
        // 4. ARBITRAGE BOT Detection
        // 特征: 2+ verschiedene DEX Programme, keine netto Token-Änderung
        const dexCount = programs.filter(p => DEX_PROGRAMS.has(p)).length;
        if (dexCount >= 2) {
            return {
                timestamp: tx.blockTime ? tx.blockTime * 1000 : Date.now(),
                slot,
                signature,
                type: 'ARBITRAGE_BOT',
                wallet,
                fee,
                tipLamports,
                details: `2-hop arbitrage | ${dexCount} DEX programmes`,
                confidence: 0.80
            };
        }
        // 5. BACKRUN BOT Detection
        // 特征: Folgt auf große User-TX, gleiche Pool
        const cuPrice = this.extractComputePrice(tx);
        if (cuPrice > 500000 && tipLamports > 500000) {
            return {
                timestamp: tx.blockTime ? tx.blockTime * 1000 : Date.now(),
                slot,
                signature,
                type: 'BACKRUN_BOT',
                wallet,
                fee,
                tipLamports,
                details: `Backrun | CU Price: ${cuPrice}`,
                confidence: 0.75
            };
        }
        // Default: JITO BUNDLE
        return {
            timestamp: tx.blockTime ? tx.blockTime * 1000 : Date.now(),
            slot,
            signature,
            type: 'JITO_BUNDLE',
            wallet,
            fee,
            tipLamports,
            details: tipLamports > 0 ? `Jito tip: ${(tipLamports / 1e9).toFixed(4)} SOL` : `Fee: ${fee}`,
            confidence: 0.70
        };
    }
    /**
     * Extract program IDs from instructions
     */
    extractPrograms(instructions) {
        const programs = [];
        for (const ix of instructions) {
            if (ix.programId) {
                programs.push(ix.programId);
            }
        }
        return programs;
    }
    /**
     * Scan Jito tip accounts for bot activity
     */
    async scanJitoAccounts() {
        const jitoAccounts = Array.from(JITO_TIP_ACCOUNTS);
        for (const account of jitoAccounts.slice(0, 5)) {
            try {
                const signatures = await rpcRequest('getSignaturesForAddress', [account, { limit: 5 }]);
                if (!signatures || signatures.length === 0)
                    continue;
                for (const sigInfo of signatures.slice(0, 3)) {
                    try {
                        const tx = await rpcRequest('getTransaction', [sigInfo.signature, { maxSupportedTransactionVersion: 0 }]);
                        if (!tx)
                            continue;
                        const activity = this.parseTransaction(tx, sigInfo.slot);
                        if (activity) {
                            this.recordActivity(activity);
                        }
                    }
                    catch {
                        // Skip
                    }
                }
            }
            catch {
                // Skip
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
            // Scan last 5 blocks
            for (let i = 0; i < 5; i++) {
                const slot = currentSlot - i * 20;
                try {
                    const block = await rpcRequest('getBlock', [slot, { maxSupportedTransactionVersion: 0 }]);
                    if (!block?.transactions)
                        continue;
                    for (const txWrapper of block.transactions.slice(0, 10)) {
                        const tx = txWrapper.transaction || txWrapper;
                        const activity = this.parseTransaction(tx, slot);
                        if (activity) {
                            this.recordActivity(activity);
                        }
                    }
                }
                catch {
                    // Skip
                }
            }
        }
        catch {
            // Skip
        }
    }
    /**
     * Record bot activity and update metrics
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
        // Update metrics by type
        switch (activity.type) {
            case 'JITO_BUNDLE':
                this.metrics.jitoBundleCount++;
                break;
            case 'SANDWICH_BOT':
                this.metrics.sandwichCount++;
                break;
            case 'ARBITRAGE_BOT':
                this.metrics.arbitrageCount++;
                break;
            case 'LIQUIDATION_BOT':
                this.metrics.liquidationCount++;
                break;
            case 'SNIPER_BOT':
                this.metrics.sniperCount++;
                break;
            case 'BUNDLER_BOT':
                this.metrics.bundlerCount++;
                break;
            case 'VOLUME_BOT':
                this.metrics.volumeCount++;
                break;
            case 'COPY_TRADING_BOT':
                this.metrics.copyTradingCount++;
                break;
            case 'BACKRUN_BOT':
                this.metrics.backrunCount++;
                break;
        }
        this.metrics.totalBotTxs++;
        // Track wallet
        if (!this.walletAge.has(activity.wallet)) {
            this.walletAge.set(activity.wallet, activity.slot);
        }
        this.walletTxCount.set(activity.wallet, (this.walletTxCount.get(activity.wallet) || 0) + 1);
        // Update fees
        this.metrics.totalFees += activity.fee;
        this.metrics.avgFee = this.metrics.totalBotTxs > 0
            ? this.metrics.totalFees / this.metrics.totalBotTxs
            : 0;
        // High priority detection
        if (activity.fee > 10000)
            this.metrics.highPriorityTxCount++;
        if (activity.tipLamports && activity.tipLamports > 500000)
            this.metrics.veryHighPriorityTxCount++;
        // Calculate bot probability
        this.updateBotProbability();
    }
    /**
     * Calculate overall bot probability based on activity
     */
    updateBotProbability() {
        let prob = 0;
        // Jito bundles (strongest signal)
        if (this.metrics.jitoBundleCount > 0)
            prob += 0.25;
        if (this.metrics.jitoBundleCount > 10)
            prob += 0.20;
        if (this.metrics.jitoBundleCount > 50)
            prob += 0.25;
        // Specific bot types
        if (this.metrics.sandwichCount > 0)
            prob += 0.15;
        if (this.metrics.liquidationCount > 0)
            prob += 0.20;
        if (this.metrics.sniperCount > 0)
            prob += 0.10;
        if (this.metrics.arbitrageCount > 0)
            prob += 0.10;
        if (this.metrics.backrunCount > 0)
            prob += 0.10;
        // High priority transactions
        if (this.metrics.veryHighPriorityTxCount > 0)
            prob += 0.15;
        // Ephemeral wallets (Bot-Signal: < 1000 slots alt)
        const now = this.metrics.totalBotTxs; // Use slot proxy
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
        console.log('[BotDetection] Starting Comprehensive Bot Detection...');
        console.log('[BotDetection] Monitoring: Jito, Sandwich, Liquidation, Sniper, Arbitrage, Backrun');
        // Initial scan
        await this.scanJitoAccounts();
        // Continuous polling
        setInterval(async () => {
            if (!this.isRunning)
                return;
            await this.scanJitoAccounts();
            await this.scanRecentBlocks();
            this.updateBotProbability();
        }, this.pollInterval);
    }
    /**
     * Stop bot detection
     */
    stop() {
        this.isRunning = false;
    }
    /**
     * Get current metrics
     */
    getMetrics() {
        return { ...this.metrics };
    }
    /**
     * Get recent activities
     */
    getRecentActivities(limit = 100) {
        return this.activities.slice(-limit);
    }
    /**
     * Get activities by type
     */
    getActivitiesByType(type) {
        return this.activities.filter(a => a.type === type);
    }
    /**
     * Get top bot wallets
     */
    getTopBotWallets(limit = 10) {
        const walletStats = new Map();
        for (const activity of this.activities.slice(-500)) {
            const existing = walletStats.get(activity.wallet);
            if (existing) {
                existing.count++;
            }
            else {
                walletStats.set(activity.wallet, { count: 1, type: activity.type });
            }
        }
        return Array.from(walletStats.entries())
            .map(([wallet, stats]) => ({ wallet, ...stats }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }
}
// Singleton
export const comprehensiveBotDetector = new ComprehensiveBotDetector();
// CLI Test
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
    (async () => {
        console.log('=== COMPREHENSIVE BOT DETECTION TEST ===\n');
        const detector = new ComprehensiveBotDetector();
        await detector.start();
        setTimeout(() => {
            const metrics = detector.getMetrics();
            console.log('\n=== BOT METRICS ===');
            console.log(`Jito Bundles: ${metrics.jitoBundleCount}`);
            console.log(`Sandwich: ${metrics.sandwichCount}`);
            console.log(`Liquidation: ${metrics.liquidationCount}`);
            console.log(`Sniper: ${metrics.sniperCount}`);
            console.log(`Arbitrage: ${metrics.arbitrageCount}`);
            console.log(`Backrun: ${metrics.backrunCount}`);
            console.log(`Total Bot TXs: ${metrics.totalBotTxs}`);
            console.log(`Bot Probability: ${(metrics.botProbability * 100).toFixed(1)}%`);
            const topWallets = detector.getTopBotWallets(5);
            console.log('\n=== TOP BOT WALLETS ===');
            topWallets.forEach((w, i) => {
                console.log(`${i + 1}. ${w.wallet.slice(0, 15)}... (${w.count} txs, ${w.type})`);
            });
            detector.stop();
            process.exit(0);
        }, 25000);
    })();
}
//# sourceMappingURL=comprehensive-bot-detector.js.map