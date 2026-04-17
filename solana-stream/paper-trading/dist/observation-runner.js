/**
 * KAS PA 24-Stunden Observation Runner
 *
 * Führt eine 24-stündige Beobachtung des Systems durch.
 * Sammelt alle Metriken, Signale und Systemzustände.
 *
 * Usage: npx tsx src/observation-runner.ts
 */
import axios from 'axios';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
// ============================================================================
// CONFIGURATION
// ============================================================================
const OBSERVATION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const LOG_INTERVAL_MS = 60_000; // Log every minute
const METRICS_LOG_FILE = '/data/trinity_apex/logs/24h-observation.jsonl';
const SUMMARY_FILE = '/data/trinity_apex/logs/24h-summary.json';
const CHAINSTACK_RPC = "https://solana-mainnet.core.chainstack.com";
const AUTH = { username: "friendly-mcclintock", password: "armed-stamp-reuse-grudge-armful-script" };
// ============================================================================
// HELPERS
// ============================================================================
async function chainstackRpc(method, params = []) {
    const start = Date.now();
    try {
        const response = await axios.post(CHAINSTACK_RPC, {
            jsonrpc: "2.0",
            id: 1,
            method,
            params
        }, { auth: AUTH, timeout: 10_000 });
        const latency = Date.now() - start;
        return { success: true, result: response.data.result, latency };
    }
    catch (error) {
        const latency = Date.now() - start;
        return { success: false, error: error.message, latency };
    }
}
function formatDuration(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${hours}h ${minutes}m ${seconds}s`;
}
function log(message) {
    const now = new Date().toISOString();
    console.log(`[${now}] ${message}`);
}
// ============================================================================
// MAIN OBSERVATION
// ============================================================================
async function run24hObservation() {
    const startTime = Date.now();
    const endTime = startTime + OBSERVATION_DURATION_MS;
    // State tracking
    let successfulFetches = 0;
    let failedFetches = 0;
    let totalErrors = 0;
    const dataFreshnessHistory = [];
    const observations = [];
    let lastSuccessfulFetch = startTime;
    let currentSlot = null;
    // Start embedded WebSocket server on different port for status
    const wss = new WebSocketServer({ port: 8081 });
    const wsClients = new Set();
    wss.on('connection', (ws) => {
        wsClients.add(ws);
        ws.on('close', () => wsClients.delete(ws));
    });
    log('='.repeat(60));
    log('KAS PA 24-STUNDEN OBSERVATION GESTARTET');
    log('='.repeat(60));
    log(`Start: ${new Date(startTime).toISOString()}`);
    log(`Ende: ${new Date(endTime).toISOString()}`);
    log(`Log File: ${METRICS_LOG_FILE}`);
    log('='.repeat(60));
    // Ensure log directory exists
    fs.mkdirSync('/data/trinity_apex/logs', { recursive: true });
    // Clear previous log
    fs.writeFileSync(METRICS_LOG_FILE, '');
    // Observation loop
    while (Date.now() < endTime) {
        const now = Date.now();
        const uptime = Math.floor((now - startTime) / 1000);
        const dataFreshness = now - lastSuccessfulFetch;
        const observation = {
            timestamp: now,
            uptime,
            slot: currentSlot,
            dataFreshness,
            rpcLatency: 0,
            wsClients: wsClients.size,
            predictionsCount: 0,
            errors: []
        };
        // Fetch current slot
        const slotResult = await chainstackRpc("getSlot");
        if (slotResult.success) {
            currentSlot = slotResult.result;
            observation.rpcLatency = slotResult.latency;
            successfulFetches++;
            lastSuccessfulFetch = now;
            dataFreshnessHistory.push(dataFreshness);
        }
        else {
            failedFetches++;
            observation.errors.push(`Slot fetch failed: ${slotResult.error}`);
        }
        // Log observation
        observations.push(observation);
        // Write to log file every minute
        if (observations.length % (LOG_INTERVAL_MS / 1000) === 0) {
            fs.appendFileSync(METRICS_LOG_FILE, JSON.stringify(observation) + '\n');
        }
        // Broadcast to WebSocket clients
        const statusUpdate = {
            type: 'OBSERVATION_STATUS',
            uptime,
            dataFreshness,
            slot: currentSlot,
            rpcLatency: observation.rpcLatency,
            progress: ((now - startTime) / OBSERVATION_DURATION_MS * 100).toFixed(1),
            remaining: formatDuration(endTime - now),
            successfulFetches,
            failedFetches,
            totalErrors
        };
        for (const client of wsClients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(statusUpdate));
            }
        }
        // Progress update every minute
        const progress = ((now - startTime) / OBSERVATION_DURATION_MS * 100).toFixed(1);
        if (uptime % 60 === 0) {
            log(`Progress: ${progress}% | Uptime: ${formatDuration(now - startTime)} | Remaining: ${formatDuration(endTime - now)}`);
            log(`  Slot: ${currentSlot || 'N/A'} | Freshness: ${dataFreshness}ms | WS Clients: ${wsClients.size}`);
            log(`  Success: ${successfulFetches} | Failed: ${failedFetches} | Errors: ${totalErrors}`);
        }
        // Wait 1 second before next observation
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    // Final summary
    const finalEndTime = Date.now();
    const totalDuration = finalEndTime - startTime;
    const summary = {
        startTime,
        endTime: finalEndTime,
        totalObservations: observations.length,
        successfulFetches,
        failedFetches,
        totalErrors,
        avgDataFreshness: dataFreshnessHistory.length > 0
            ? dataFreshnessHistory.reduce((a, b) => a + b, 0) / dataFreshnessHistory.length
            : 0,
        minDataFreshness: dataFreshnessHistory.length > 0
            ? Math.min(...dataFreshnessHistory)
            : 0,
        maxDataFreshness: dataFreshnessHistory.length > 0
            ? Math.max(...dataFreshnessHistory)
            : 0,
        uptimePercentage: (successfulFetches / (successfulFetches + failedFetches)) * 100
    };
    // Write summary
    fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2));
    // Write all observations
    fs.writeFileSync(METRICS_LOG_FILE, observations.map(o => JSON.stringify(o)).join('\n'));
    log('='.repeat(60));
    log('24-STUNDEN OBSERVATION ABGESCHLOSSEN');
    log('='.repeat(60));
    log(`Duration: ${formatDuration(totalDuration)}`);
    log(`Observations: ${summary.totalObservations}`);
    log(`Successful Fetches: ${summary.successfulFetches}`);
    log(`Failed Fetches: ${summary.failedFetches}`);
    log(`Uptime: ${summary.uptimePercentage.toFixed(2)}%`);
    log(`Avg Data Freshness: ${summary.avgDataFreshness.toFixed(0)}ms`);
    log(`Min Data Freshness: ${summary.minDataFreshness}ms`);
    log(`Max Data Freshness: ${summary.maxDataFreshness}ms`);
    log(`Summary saved to: ${SUMMARY_FILE}`);
    log('='.repeat(60));
    wss.close();
}
// ============================================================================
// RUN
// ============================================================================
run24hObservation().catch(console.error);
//# sourceMappingURL=observation-runner.js.map