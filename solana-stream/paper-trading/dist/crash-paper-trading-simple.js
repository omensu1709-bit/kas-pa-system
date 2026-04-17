/**
 * Standalone Crash Paper Trading Runner
 *
 * Self-contained version that doesn't depend on external module compilation.
 * Can be run directly with: npx ts-node --esm src/crash-paper-trading-simple.ts
 * Or compiled separately.
 */
import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';
class HawkesMetric {
    windowSize;
    events = [];
    constructor(windowSize = 5000) {
        this.windowSize = windowSize;
    }
    addEvent(slot, timestamp) {
        this.events.push(timestamp);
        while (this.events.length > this.windowSize)
            this.events.shift();
    }
    compute() {
        if (this.events.length < 100)
            return { branchingRatio: 0, intensity: 0 };
        const interTimes = [];
        for (let i = 1; i < this.events.length; i++)
            interTimes.push(this.events[i] - this.events[i - 1]);
        if (interTimes.length < 2)
            return { branchingRatio: 0, intensity: 0 };
        const mean = interTimes.reduce((a, b) => a + b, 0) / interTimes.length;
        let cov = 0, var_ = 0;
        for (let i = 0; i < interTimes.length - 1; i++)
            cov += (interTimes[i] - mean) * (interTimes[i + 1] - mean);
        for (let i = 0; i < interTimes.length; i++)
            var_ += Math.pow(interTimes[i] - mean, 2);
        cov /= (interTimes.length - 1);
        var_ /= interTimes.length;
        const autocorr = var_ > 0 ? cov / var_ : 0;
        const n = Math.max(0, Math.min(10, 1 / (1 - Math.max(-0.99, Math.min(0.99, autocorr)))));
        return { branchingRatio: n, intensity: 1 / mean };
    }
}
class PermutationEntropyMetric {
    windowSize;
    order;
    delay;
    prices = [];
    constructor(windowSize = 500, order = 4, delay = 1) {
        this.windowSize = windowSize;
        this.order = order;
        this.delay = delay;
    }
    addPrice(price) {
        this.prices.push(price);
        while (this.prices.length > this.windowSize * this.delay + this.order)
            this.prices.shift();
    }
    compute() {
        if (this.prices.length < this.order * this.delay + 1)
            return { normalizedEntropy: 0 };
        const n = this.order;
        const counts = new Map();
        let total = 0;
        for (let i = 0; i <= this.prices.length - 1 - (n - 1) * this.delay; i++) {
            const vec = [];
            for (let j = 0; j < n; j++)
                vec.push(this.prices[i + j * this.delay]);
            const sorted = [...vec].sort((a, b) => a - b);
            let pattern = 0;
            for (let j = 0; j < n; j++)
                pattern = pattern * n + sorted.indexOf(vec[j]);
            counts.set(pattern, (counts.get(pattern) || 0) + 1);
            total++;
        }
        let entropy = 0;
        for (const c of counts.values()) {
            const p = c / total;
            if (p > 0)
                entropy -= p * Math.log2(p);
        }
        const maxEntropy = Math.log2(24); // 4! = 24
        return { normalizedEntropy: Math.max(0, Math.min(1, entropy / maxEntropy)) };
    }
}
class GraphMetric {
    maxNodes;
    adjacency = new Map();
    constructor(maxNodes = 50000) {
        this.maxNodes = maxNodes;
    }
    addEdge(from, to, timestamp) {
        if (!this.adjacency.has(from))
            this.adjacency.set(from, new Set());
        if (!this.adjacency.has(to))
            this.adjacency.set(to, new Set());
        this.adjacency.get(from).add(to);
        this.adjacency.get(to).add(from);
        if (this.adjacency.size > this.maxNodes) {
            const first = this.adjacency.keys().next().value;
            if (first)
                this.adjacency.delete(first);
        }
    }
    compute() {
        if (this.adjacency.size < 10)
            return { molloyReedRatio: 0, fragmentation: 0 };
        let totalDegree = 0;
        const degrees = [];
        for (const [, neighbors] of this.adjacency) {
            const d = neighbors.size;
            degrees.push(d);
            totalDegree += d;
        }
        const N = this.adjacency.size, meanDeg = totalDegree / N;
        let variance = 0;
        for (const d of degrees)
            variance += Math.pow(d - meanDeg, 2);
        variance /= N;
        const kappa = meanDeg * (1 + variance / (meanDeg || 1));
        const components = this.findComponents();
        components.sort((a, b) => b.length - a.length);
        const frag = components[0].length > 0 ? components[1].length / components[0].length : 0;
        return { molloyReedRatio: kappa, fragmentation: frag };
    }
    findComponents() {
        const visited = new Set();
        const result = [];
        for (const node of this.adjacency.keys()) {
            if (visited.has(node))
                continue;
            const component = [];
            const queue = [node];
            while (queue.length) {
                const curr = queue.shift();
                if (visited.has(curr))
                    continue;
                visited.add(curr);
                component.push(curr);
                for (const n of this.adjacency.get(curr) || [])
                    if (!visited.has(n))
                        queue.push(n);
            }
            result.push(component);
        }
        return result;
    }
}
class EpidemicMetric {
    windowSize;
    events = [];
    constructor(windowSize = 1000) {
        this.windowSize = windowSize;
    }
    addTransmission(src, dst) {
        if (dst <= src)
            return;
        this.events.push({ src, dst });
        while (this.events.length > this.windowSize)
            this.events.shift();
    }
    compute() {
        if (this.events.length < 50)
            return { rt: 0 };
        let totalWeight = 0, weightedChild = 0;
        for (const e of this.events) {
            totalWeight += 1;
            const children = this.events.filter(o => o.src >= e.dst && o.src - e.dst < 1000);
            weightedChild += children.length;
        }
        return { rt: Math.max(0, Math.min(10, weightedChild / (totalWeight || 1))) };
    }
}
class GutenbergRichterMetric {
    windowSize;
    mags = [];
    constructor(windowSize = 1000) {
        this.windowSize = windowSize;
    }
    addMagnitude(m) { this.mags.push(m); while (this.mags.length > this.windowSize)
        this.mags.shift(); }
    compute() {
        if (this.mags.length < 50)
            return { bValue: 0 };
        const sorted = [...this.mags].sort((a, b) => a - b);
        const n = sorted.length;
        const mMin = sorted[0];
        const meanDev = sorted.reduce((s, m) => s + (m - mMin), 0) / n;
        let b = meanDev > 0.001 ? 1 / (meanDev * Math.LN10) : 10;
        b = Math.max(0.1, Math.min(10, b));
        return { bValue: b };
    }
}
class TransferEntropyMetric {
    windowSize;
    clusterCount;
    flows = new Map();
    constructor(windowSize = 1000, clusterCount = 5) {
        this.windowSize = windowSize;
        this.clusterCount = clusterCount;
    }
    addTransfer(src, dst, value = 1) {
        if (src < 0 || src >= this.clusterCount || dst < 0 || dst >= this.clusterCount)
            return;
        if (src === dst)
            return;
        const key = `${src}→${dst}`;
        this.flows.set(key, (this.flows.get(key) || 0) + value);
        while (this.flows.size > this.windowSize) {
            const first = this.flows.keys().next().value;
            if (first)
                this.flows.delete(first);
        }
    }
    compute() {
        if (this.flows.size < 50)
            return { clustering: 0 };
        let totalFlow = 0;
        for (const c of this.flows.values())
            totalFlow += c;
        let herfindahl = 0;
        for (const c of this.flows.values()) {
            const share = c / totalFlow;
            herfindahl += share * share;
        }
        return { clustering: Math.max(0, Math.min(1, herfindahl * (this.clusterCount / (this.clusterCount - 1)) || 0)) };
    }
}
class SuperspreaderMetric {
    activityWindow;
    degreeThreshold;
    activity = new Map();
    degree = new Map();
    constructor(activityWindow = 100, degreeThreshold = 4) {
        this.activityWindow = activityWindow;
        this.degreeThreshold = degreeThreshold;
    }
    addActivity(nodeId, deg, act = 1) {
        this.activity.set(nodeId, (this.activity.get(nodeId) || 0) + act);
        this.degree.set(nodeId, deg);
    }
    compute() {
        if (this.activity.size < 10)
            return { activationIndex: 0 };
        let totalDeg = 0;
        for (const d of this.degree.values())
            totalDeg += d;
        const meanDeg = totalDeg / this.degree.size;
        const threshold = meanDeg * this.degreeThreshold;
        let superspreaderCount = 0, superspreaderActivity = 0, baselineActivity = 0;
        for (const [nodeId, act] of this.activity) {
            const deg = this.degree.get(nodeId) || 0;
            if (deg >= threshold) {
                superspreaderCount++;
                superspreaderActivity += act;
            }
            baselineActivity += act;
        }
        baselineActivity /= this.activity.size;
        const activationIndex = superspreaderActivity > 0 && baselineActivity > 0 && superspreaderCount > 0
            ? superspreaderActivity / (superspreaderCount * baselineActivity) : 0;
        return { activationIndex: Math.max(0, Math.min(10, activationIndex)) };
    }
}
class LiquidityImpactMetric {
    windowSize;
    coeff;
    adv;
    observations = [];
    constructor(windowSize = 500, coeff = 1, adv = 1) {
        this.windowSize = windowSize;
        this.coeff = coeff;
        this.adv = adv;
    }
    addTrade(size, actualImpact, volume) {
        const predicted = this.coeff * Math.sqrt(size / (this.adv || 1)) * 10000;
        this.observations.push({ size, actual: actualImpact, predicted });
        while (this.observations.length > this.windowSize)
            this.observations.shift();
    }
    compute() {
        if (this.observations.length < 50)
            return { deviation: 0 };
        let totalActual = 0, totalPred = 0;
        for (const o of this.observations) {
            totalActual += o.actual;
            totalPred += o.predicted;
        }
        const avgActual = totalActual / this.observations.length;
        const avgPred = totalPred / this.observations.length;
        const deviation = avgPred > 0 ? Math.abs(avgActual - avgPred) / avgPred : 0;
        return { deviation: Math.max(0, Math.min(10, deviation)) };
    }
}
// ============================================================================
// CRASH PROBABILITY FORMULA
// ============================================================================
const COEFFS = {
    beta0: -4.50, beta1_kappa: -1.75, beta2_rt: 1.75, beta3_PE: -2.25,
    beta4_CTE: 1.25, beta5_bValue: -1.75, beta6_n: 2.75, beta7_fragmentation: 2.25,
    beta8_SSI: 1.25, beta9_LFI: 1.75, gamma1: 1.00, gamma2: 0.75, gamma3: 0.75
};
function computeCrashProbability(z) {
    const c = COEFFS;
    const z_n = z.z_n || 0, z_PE = z.z_PE || 0, z_kappa = z.z_kappa || 0;
    const z_frag = z.z_fragmentation || 0, z_rt = z.z_rt || 0, z_bValue = z.z_bValue || 0;
    const z_CTE = z.z_CTE || 0, z_SSI = z.z_SSI || 0, z_LFI = z.z_LFI || 0;
    const linear = c.beta0 + c.beta1_kappa * z_kappa + c.beta2_rt * z_rt + c.beta3_PE * z_PE +
        c.beta4_CTE * z_CTE + c.beta5_bValue * z_bValue + c.beta6_n * z_n + c.beta7_fragmentation * z_frag +
        c.beta8_SSI * z_SSI + c.beta9_LFI * z_LFI + c.gamma1 * z_kappa * z_n + c.gamma2 * z_PE * z_frag +
        c.gamma3 * z_LFI * z_SSI;
    const probability = 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, linear))));
    const confirming = [];
    if (z_n > 1.5)
        confirming.push('n');
    if (z_PE < -1.5)
        confirming.push('PE');
    if (z_kappa < -1.5)
        confirming.push('kappa');
    if (z_frag > 1.5)
        confirming.push('fragmentation');
    if (z_rt > 1.5)
        confirming.push('rt');
    if (z_bValue < -1.5)
        confirming.push('bValue');
    if (z_CTE > 1.5)
        confirming.push('CTE');
    if (z_SSI > 1.5)
        confirming.push('SSI');
    if (z_LFI > 1.5)
        confirming.push('LFI');
    return { probability, confirming };
}
class PredictionLogger {
    predictions = [];
    log(token, slot, raw, z, prob, confirming, zone) {
        const record = {
            id: uuidv4(), timestamp: Date.now(), slot, token, rawMetrics: raw, zScores: z,
            crashProbability: prob, confirmingMetrics: confirming.length, zone,
            verificationStatus: 'PENDING',
            hash: ''
        };
        record.hash = CryptoJS.SHA256(JSON.stringify(record)).toString();
        this.predictions.push(record);
        return record;
    }
    getHighProbabilitySignals(threshold = 0.2) {
        return this.predictions.filter(p => p.crashProbability >= threshold && p.zone === 'IMMEDIATE_SHORT');
    }
    getSummary() {
        const total = this.predictions.length;
        const zones = { IGNORE: 0, MONITOR: 0, IMMEDIATE_SHORT: 0 };
        const signals = { total: 0, accepted: 0, rejected: 0 };
        for (const p of this.predictions) {
            zones[p.zone]++;
            if (p.zone !== 'IGNORE') {
                signals.total++;
                if (p.action === 'OPEN_POSITION')
                    signals.accepted++;
                else if (p.action === 'REJECTED')
                    signals.rejected++;
            }
        }
        return { totalPredictions: total, zoneDistribution: zones, tradingSignals: signals };
    }
    exportCSV() {
        const headers = ['id', 'timestamp', 'slot', 'token', 'crashProbability', 'confirmingMetrics', 'zone', 'action'];
        return [headers.join(','), ...this.predictions.map(p => [p.id, p.timestamp, p.slot, p.token, p.crashProbability.toFixed(6), p.confirmingMetrics, p.zone, p.action || ''].join(','))].join('\n');
    }
}
class SimplePaperEngine {
    startingCapital;
    positions = new Map();
    history = [];
    totalPnl = 0;
    capital;
    constructor(startingCapital) {
        this.startingCapital = startingCapital;
        this.capital = startingCapital;
    }
    async openPosition(tokenMint, amount, signalSource) {
        const pos = { id: uuidv4(), tokenMint, amount, entryPrice: 100, entrySlot: 0, entryTime: Date.now(), signalSource, status: 'OPEN' };
        this.positions.set(tokenMint, pos);
        this.history.push({ ...pos, type: 'ENTRY' });
        return { success: true, position: pos };
    }
    async closePosition(tokenMint, reason) {
        const pos = this.positions.get(tokenMint);
        if (!pos)
            return { success: false, error: 'No position' };
        const pnl = pos.amount * 0.1; // Mock 10% gain
        this.capital += pnl;
        this.totalPnl += pnl;
        pos.status = 'CLOSED';
        pos.pnlSol = pnl;
        this.positions.delete(tokenMint);
        this.history.push({ ...pos, type: 'EXIT' });
        return { success: true, pnl, totalPnl: this.totalPnl };
    }
    getPerformance() {
        const exits = this.history.filter(t => t.type === 'EXIT');
        const wins = exits.filter(t => (t.pnlSol || 0) > 0);
        const losses = exits.filter(t => (t.pnlSol || 0) < 0);
        return {
            startingCapital: this.startingCapital, currentCapital: this.capital, totalPnlSol: this.totalPnl,
            totalTrades: exits.length, winningTrades: wins.length, losingTrades: losses.length,
            winRate: exits.length > 0 ? (wins.length / exits.length) * 100 : 0,
            openPositions: Array.from(this.positions.values())
        };
    }
}
// ============================================================================
// CRASH SIGNAL ADAPTER
// ============================================================================
var Zone;
(function (Zone) {
    Zone["IGNORE"] = "IGNORE";
    Zone["MONITOR"] = "MONITOR";
    Zone["IMMEDIATE_SHORT"] = "IMMEDIATE_SHORT";
})(Zone || (Zone = {}));
class CrashSignalAdapter {
    engine;
    logger;
    config;
    constructor(engine, logger, config = { ignoreThreshold: 0.10, monitorThreshold: 0.20, kellyMode: 'quarter', maxPositions: 4, minConfirming: 3 }) {
        this.engine = engine;
        this.logger = logger;
        this.config = config;
    }
    getZone(prob) {
        if (prob < this.config.ignoreThreshold)
            return Zone.IGNORE;
        if (prob < this.config.monitorThreshold)
            return Zone.MONITOR;
        return Zone.IMMEDIATE_SHORT;
    }
    async processSignal(signal) {
        if (signal.zone === Zone.IGNORE)
            return { action: 'ignored', reason: 'Below threshold' };
        if (signal.zone === Zone.MONITOR)
            return { action: 'monitoring', reason: 'In monitor zone' };
        if (signal.confirmingMetrics < this.config.minConfirming)
            return { action: 'rejected', reason: 'Insufficient confirming metrics' };
        const perf = this.engine.getPerformance();
        if (perf.openPositions.length >= this.config.maxPositions)
            return { action: 'rejected', reason: 'Max positions reached' };
        const kelly = this.config.kellyMode === 'quarter' ? 0.14 : this.config.kellyMode === 'half' ? 0.27 : 0.55;
        const size = perf.currentCapital * kelly * (signal.confirmingMetrics >= 4 ? 1.0 : 0.75);
        if (size < 0.1)
            return { action: 'rejected', reason: 'Position too small' };
        const result = await this.engine.openPosition(signal.token, size, `crash:P=${signal.crashProbability.toFixed(4)}`);
        if (result.success)
            return { action: 'opened', positionId: result.position?.id, size };
        return { action: 'error', reason: result.error };
    }
}
// ============================================================================
// MAIN RUNNER
// ============================================================================
export class CrashPaperTradingRunner {
    tokens;
    engine;
    adapter;
    logger;
    metrics = new Map();
    stats = new Map();
    constructor(tokens, engine, adapter, logger) {
        this.tokens = tokens;
        this.engine = engine;
        this.adapter = adapter;
        this.logger = logger;
        for (const token of tokens) {
            this.metrics.set(token, {
                hawkes: new HawkesMetric(), entropy: new PermutationEntropyMetric(),
                graph: new GraphMetric(), epidemic: new EpidemicMetric(),
                seismic: new GutenbergRichterMetric(), transfer: new TransferEntropyMetric(),
                superspreader: new SuperspreaderMetric(), liquidity: new LiquidityImpactMetric()
            });
            const m = new Map();
            ['n', 'PE', 'kappa', 'fragmentation', 'rt', 'bValue', 'CTE', 'SSI', 'LFI'].forEach(k => m.set(k, { sum: 0, sumSq: 0, count: 0 }));
            this.stats.set(token, m);
        }
    }
    processMarketData(token, slot, price, volume, accounts) {
        const m = this.metrics.get(token);
        if (!m)
            return;
        m.hawkes.addEvent(slot, Date.now());
        m.entropy.addPrice(price);
        if (accounts.length >= 2)
            for (let i = 1; i < accounts.length; i++)
                m.graph.addEdge(accounts[0], accounts[i], Date.now());
        m.seismic.addMagnitude(Math.log1p(100) / 10);
        m.liquidity.addTrade(volume, Math.random() * 5, volume);
        this.updateStats(token);
    }
    updateStats(token) {
        const m = this.metrics.get(token);
        const s = this.stats.get(token);
        if (!m || !s)
            return;
        const values = { n: m.hawkes.compute().branchingRatio, PE: m.entropy.compute().normalizedEntropy,
            kappa: m.graph.compute().molloyReedRatio, fragmentation: m.graph.compute().fragmentation,
            rt: m.epidemic.compute().rt, bValue: m.seismic.compute().bValue,
            CTE: m.transfer.compute().clustering, SSI: m.superspreader.compute().activationIndex,
            LFI: m.liquidity.compute().deviation };
        for (const [k, v] of Object.entries(values)) {
            const st = s.get(k);
            st.sum += v;
            st.sumSq += v * v;
            st.count++;
            if (st.count > 2000) {
                st.sum *= 0.999;
                st.sumSq *= 0.999;
                st.count *= 0.999;
            }
        }
    }
    computeSignal(token, slot) {
        const m = this.metrics.get(token);
        const s = this.stats.get(token);
        if (!m || !s)
            return null;
        const raw = { n: m.hawkes.compute().branchingRatio, PE: m.entropy.compute().normalizedEntropy,
            kappa: m.graph.compute().molloyReedRatio, fragmentation: m.graph.compute().fragmentation,
            rt: m.epidemic.compute().rt, bValue: m.seismic.compute().bValue,
            CTE: m.transfer.compute().clustering, SSI: m.superspreader.compute().activationIndex,
            LFI: m.liquidity.compute().deviation };
        const z = {};
        for (const [k, v] of Object.entries(raw)) {
            const st = s.get(k);
            if (!st || st.count < 30) {
                z[`z_${k}`] = 0;
                continue;
            }
            const mean = st.sum / st.count;
            const variance = st.sumSq / st.count - mean * mean;
            const std = Math.sqrt(Math.max(0, variance));
            z[`z_${k}`] = std > 0.001 ? (v - mean) / std : 0;
        }
        const { probability, confirming } = computeCrashProbability(z);
        const zone = this.adapter.getZone(probability);
        this.logger.log(token, slot, raw, z, probability, confirming, zone);
        return { token, crashProbability: probability, confirmingMetrics: confirming.length, zScores: z, slot, timestamp: Date.now(), zone };
    }
    async run(intervalMs = 1000) {
        console.log('[Runner] Starting Crash Paper Trading...');
        console.log(`[Runner] Tokens: ${this.tokens.join(', ')}`);
        let iteration = 0;
        const runLoop = () => {
            setTimeout(() => {
                for (const token of this.tokens) {
                    const slot = 100_000_000 + iteration * 100;
                    // Simulate market data
                    this.processMarketData(token, slot, 100 + Math.random() * 10, 1000 + Math.random() * 5000, [`wallet_${Math.floor(Math.random() * 10)}`]);
                    const signal = this.computeSignal(token, slot);
                    if (signal && signal.zone !== Zone.IGNORE) {
                        this.adapter.processSignal(signal).then(result => {
                            if (result.action === 'opened') {
                                console.log(`[Runner] ${new Date().toISOString()} OPEN ${token} P=${signal.crashProbability.toFixed(4)} z=${signal.confirmingMetrics}`);
                            }
                        });
                    }
                }
                iteration++;
                runLoop();
            }, intervalMs);
        };
        runLoop();
    }
    getPerformance() { return this.engine.getPerformance(); }
    getPredictionSummary() { return this.logger.getSummary(); }
}
// ============================================================================
// BOOTSTRAP
// ============================================================================
async function main() {
    console.log('='.repeat(60));
    console.log('CRASH PAPER TRADING - INITIALIZATION');
    console.log('='.repeat(60));
    const tokens = ['SOL', 'BTC', 'ETH'];
    const engine = new SimplePaperEngine(100); // 100 SOL starting capital
    const logger = new PredictionLogger();
    const adapter = new CrashSignalAdapter(engine, logger);
    const runner = new CrashPaperTradingRunner(tokens, engine, adapter, logger);
    console.log(`Starting capital: 100 SOL`);
    console.log(`Monitoring: ${tokens.join(', ')}`);
    console.log('');
    // Run for 60 seconds then report
    runner.run(1000);
    setTimeout(() => {
        console.log('\n' + '='.repeat(60));
        console.log('PAPER TRADING RESULTS');
        console.log('='.repeat(60));
        const perf = runner.getPerformance();
        console.log('\nPerformance:');
        console.log(`  Capital: ${perf.currentCapital.toFixed(2)} SOL (${((perf.currentCapital / 100 - 1) * 100).toFixed(1)}%)`);
        console.log(`  Total PnL: ${perf.totalPnlSol.toFixed(2)} SOL`);
        console.log(`  Trades: ${perf.totalTrades} (${perf.winningTrades}W / ${perf.losingTrades}L)`);
        console.log(`  Win Rate: ${perf.winRate.toFixed(1)}%`);
        console.log(`  Open Positions: ${perf.openPositions.length}`);
        const summary = runner.getPredictionSummary();
        console.log('\nPrediction Summary:');
        console.log(`  Total Predictions: ${summary.totalPredictions}`);
        console.log(`  Zone Distribution: IGNORE=${summary.zoneDistribution.IGNORE}, MONITOR=${summary.zoneDistribution.MONITOR}, SHORT=${summary.zoneDistribution.IMMEDIATE_SHORT}`);
        console.log(`  Trading Signals: ${summary.tradingSignals.total} (${summary.tradingSignals.accepted} accepted, ${summary.tradingSignals.rejected} rejected)`);
        console.log('\nCSV Export (first 5 rows):');
        const csv = logger.exportCSV().split('\n').slice(0, 6).join('\n');
        console.log(csv);
        process.exit(0);
    }, 60000);
}
main().catch(console.error);
//# sourceMappingURL=crash-paper-trading-simple.js.map