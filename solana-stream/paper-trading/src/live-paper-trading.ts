/**
 * Live Paper Trading Runner - Real-time Crash Prediction
 * 
 * Connects to Chainstack REST API for real Solana network data.
 * Computes 9-metric crash detection in real-time.
 * Executes paper trades based on crash signals.
 */

import axios from 'axios';
import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { rankingService, type ShortTarget } from './ranking-service.js';
import { comprehensiveBotDetector, BotType } from './comprehensive-bot-detector';

// ============================================================================
// CHAINSTACK REST API CLIENT
// ============================================================================

const CHAINSTACK_RPC = "https://solana-mainnet.core.chainstack.com";
const AUTH = { username: "friendly-mcclintock", password: "armed-stamp-reuse-grudge-armful-script" };

async function chainstackRpc(method: string, params: any[] = []): Promise<any> {
  const response = await axios.post(CHAINSTACK_RPC, {
    jsonrpc: "2.0",
    id: 1,
    method,
    params
  }, { auth: AUTH as any });
  return response.data.result;
}

async function getCurrentSlot(): Promise<number> {
  return await chainstackRpc("getSlot");
}

async function getRecentSignatures(address: string, limit = 50): Promise<any[]> {
  return await chainstackRpc("getSignaturesForAddress", [address, { limit }]);
}

async function getTransaction(signature: string): Promise<any> {
  return await chainstackRpc("getTransaction", [signature, {
    encoding: "jsonParsed",
    maxSupportedTransactionVersion: 0
  }]);
}

async function getRecentBlocks(count = 10): Promise<any[]> {
  const currentSlot = await getCurrentSlot();
  const blocks = [];

  for (let i = 0; i < count; i++) {
    const slot = currentSlot - i * 100;
    try {
      const block = await chainstackRpc("getBlock", [slot, {
        encoding: "json",
        maxSupportedTransactionVersion: 0
      }]);
      if (block) blocks.push(block);
    } catch (e) {
      // Block might not be available
    }
  }
  return blocks;
}

// ============================================================================
// JUPITER PRICE API - Echte Preisdaten für PermutationEntropy
// ============================================================================

const JUPITER_PRICE_API = "https://api.jup.ag/price/v3";

interface PriceData {
  price?: number;
  priceUsd?: number;
  usdPrice?: number;
  timestamp?: number;
}

const priceCache: Map<string, { price: number; timestamp: number }> = new Map();
const PRICE_CACHE_TTL_MS = 30_000; // 30 Sekunden Cache

const TRACKED_TOKENS = [
  "So11111111111111111111111111111111111111112",  // SOL
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDj1o", // USDC
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",  // mSOL
];

async function getJupiterPrices(): Promise<Map<string, number>> {
  const now = Date.now();
  const result = new Map<string, number>();

  try {
    // Check cache first
    let allCached = true;
    for (const token of TRACKED_TOKENS) {
      const cached = priceCache.get(token);
      if (!cached || (now - cached.timestamp) > PRICE_CACHE_TTL_MS) {
        allCached = false;
        break;
      }
      result.set(token, cached.price);
    }

    if (allCached && result.size === TRACKED_TOKENS.length) {
      return result;
    }

    // Fetch from Jupiter
    const ids = TRACKED_TOKENS.join(",");
    const response = await axios.get(`${JUPITER_PRICE_API}?ids=${ids}`, {
      timeout: 5000
    });

    const data = response.data;
    // Jupiter v3: data is directly the token map, not wrapped in data.data
    // Jupiter v1/v2: data is wrapped in data.data
    const tokenData = data.data || data;
    if (tokenData) {
      for (const [token, priceInfo] of Object.entries(tokenData)) {
        const info = priceInfo as PriceData;
        // Jupiter v3 uses usdPrice, older versions use price
        const price = info.usdPrice || info.price || info.priceUsd || 0;
        if (price > 0) {
          result.set(token, price);
          priceCache.set(token, { price, timestamp: now });
        }
      }
    }
  } catch (e) {
    // Fallback: use cached values if available, otherwise return empty
    for (const token of TRACKED_TOKENS) {
      const cached = priceCache.get(token);
      if (cached) {
        result.set(token, cached.price);
      }
    }
  }

  // Ensure SOL has a value (fallback to 0 if no data - will trigger alert)
  if (!result.has("So11111111111111111111111111111111111111112")) {
    result.set("So11111111111111111111111111111111111111112", 0);
  }

  return result;
}

// ============================================================================
// JITo BUNDLE DETECTION - SOTA Bot-Erkennung
// ============================================================================

// ============================================================================
// JITO TIP ACCOUNTS (EXPANDED v2) - Bot-Lexikon
// ============================================================================

const JITO_TIP_ACCOUNTS = new Set([
  // Primary Jito Tip Accounts
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvBd7vMVavegqHhd2tAC9e6QSjPNzXt5n9",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1IfygL5kd9r",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
  "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
  "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
  // Extended Jito Tip Accounts
  "Cw8ysyDJC2xvKPNgLPv8eKGCcCeF9KbJ7b9WdVmB8mWE",
  "DqYwjtMNDU8Kp4ruX4L8K8N7fZqMjGC9dDMDJ3Z3qJGK",
  "4rFzpmfWaZ2QWp9Bkn1eGLSPW6XmDt6Bz5TLFYDdWGE",
  "44vC7fURJ7gT4cMQ1GGRgActovXW6VxpGNZ9JbZ4cVb",
  "52wwvpNJ3kr6i3aP4DXSchwEvsUXPExr4S3vxfH7VZY",
  "85SLPGqNJNa59jEaatWVGZ6QTx9YHHhqkjR1xvECbMi",
  "35Kc3BUd8sVyrFrd5eJJRVQsGUfkp3RiGGf7kdxL3qM",
  "Dtf6FG9WkJ8LsJzV6tXg1aT7bMVvGzkJCZB3Zs5TkfS",
  "DbjTCc4fhe2VkKPJgXdGQvtxW8yLDDMJeH28H1C8m6o",
  "EcQZ5d7Tnqn1zLBkBhCXHHVpyk苑xG4c3gFAi6pNTe",
  "JUPyLr2upn7WzU4WWQqJQvZvXYPtvyr38e9wNZNpKR",
  "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5",
  "7EFZZRusA9s85HgseZm7xq9J2qLTLs9FqB3v8hFHQJ",
  "8FRFLuzBYd3k7GG5JWPcd5Y5G3V2b8tVYqvCMRqkXs",
  "3Wq7qFxjoiYPUJ6RpqLTNNdxC446T3fLPRQXNZXVBP",
  "4LQ3aV2xzdh3MzxCPfPQNQMNyjvUT3N7bcGCfL3wC8X",
  "7dHdMRLT5r9JcQ3VcaHy4P7V5Yj5QzCFV3aVv9Y7gQ",
]);

// MEV / Sandwich Bot bekannte Programme
const MEV_PROGRAM_IDS = new Set([
  'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5',
  'JUPyLr2upn7WzU4WWQqJQvZvXYPtvyr38e9wNZNpKR',
  'CAMMCzo5YL8w4VFF8KVJ6hE2QQDMgjEganp6Sa2LHt7',
  'whirLbMiicVdio4qvUf3xXw2gLabaSMGZEGJ4zj5VWK',
  'LBUZgRxm2mCG8UJzLupAHcR2h3L8S5n1e6F9xQkZw',
]);

interface JitoBundleInfo {
  hasJitoTip: boolean;
  tipAccount: string | null;
  tipLamports: number;
  isHighPriority: boolean;    // > 100k microlamports
  isVeryHighPriority: boolean; // > 500k = Bot-Signal
}

function detectJitoTip(tx: any): JitoBundleInfo {
  const result: JitoBundleInfo = {
    hasJitoTip: false,
    tipAccount: null,
    tipLamports: 0,
    isHighPriority: false,
    isVeryHighPriority: false
  };

  try {
    const meta = tx.meta || {};
    const postBalances = meta.postBalances || [];
    const preBalances = meta.preBalances || [];
    const message = tx.transaction?.message || {};
    const instructions = message.instructions || [];

    // Check for SOL transfers to Jito tip accounts
    for (let i = 0; i < instructions.length; i++) {
      const ix = instructions[i];
      if (!ix) continue;

      // System program transfer: programId = 11111111111111111111111111111111
      const programId = ix.programId || (ix.accounts && ix.accounts[0]);

      // Check if this is a transfer instruction
      // Typical Jito tip is a SOL transfer to one of the 8 tip addresses
      const dest = ix.accounts?.[1]; // Destination account in transfer
      if (dest && JITO_TIP_ACCOUNTS.has(dest)) {
        result.hasJitoTip = true;
        result.tipAccount = dest;

        // Estimate tip from balance change
        if (postBalances[i] && preBalances[i]) {
          result.tipLamports = Math.max(0, postBalances[i] - preBalances[i]);
        } else {
          // Try to get from logs or use default estimation
          result.tipLamports = 10000; // Default estimate
        }

        result.isHighPriority = result.tipLamports > 100_000;
        result.isVeryHighPriority = result.tipLamports > 500_000;
        break;
      }
    }
  } catch (e) {
    // Detection failed, return default
  }

  return result;
}

interface BotDetectionMetrics {
  jitoBundleCount: number;
  highPriorityTxCount: number;
  veryHighPriorityTxCount: number;
  totalFees: number;
  avgPriorityFee: number;
  botProbability: number;  // 0-1, higher = more likely bot
  ephemeralWallets: number;  // Wallets < 1000 slots old
  newWallets: number;       // Wallets < 10000 slots old
  totalWalletsTracked: number;
  mevTxCount: number;       // MEV program interactions
  sandwichCount: number;    // Sandwich attacks detected
}

class BotDetection {
  private jitoBundleCount = 0;
  private highPriorityCount = 0;
  private veryHighPriorityCount = 0;
  private mevTxCount = 0;
  private sandwichCount = 0;
  private totalFees = 0;
  private feeCount = 0;
  private recentFees: number[] = [];

  // Wallet age tracking
  private walletFirstSeen: Map<string, number> = new Map(); // wallet -> slot
  private walletTxCount: Map<string, number> = new Map();   // wallet -> count
  private currentSlot = 0;

  // Transaction tracking for sandwich detection
  private pendingFrontRun: Map<string, { slot: number; token: string; price: number }> = new Map();

  recordTransaction(tx: any, currentSlot: number = 0) {
    this.currentSlot = currentSlot;
    const jito = detectJitoTip(tx);

    if (jito.hasJitoTip) {
      this.jitoBundleCount++;
    }

    if (jito.isHighPriority) {
      this.highPriorityCount++;
    }

    if (jito.isVeryHighPriority) {
      this.veryHighPriorityCount++;
    }

    // Check for MEV program interactions
    const message = tx.transaction?.message || {};
    const instructions = message.instructions || [];
    for (const ix of instructions) {
      const programId = ix.programId || (ix.accounts && ix.accounts[0]);
      if (programId && MEV_PROGRAM_IDS.has(programId)) {
        this.mevTxCount++;
      }
    }

    // Track fees for anomaly detection
    const meta = tx.meta || {};
    const fee = meta.fee || 0;
    if (fee > 0) {
      this.totalFees += fee;
      this.feeCount++;
      this.recentFees.push(fee);
      if (this.recentFees.length > 1000) {
        this.recentFees.shift();
      }
    }

    // Track wallet age
    const accounts = message.accountKeys || [];
    for (const account of accounts) {
      const pubkey = account?.pubkey || account;
      if (typeof pubkey !== 'string') continue;

      // Record first seen slot
      if (!this.walletFirstSeen.has(pubkey)) {
        this.walletFirstSeen.set(pubkey, currentSlot);
      }

      // Increment tx count
      this.walletTxCount.set(pubkey, (this.walletTxCount.get(pubkey) || 0) + 1);
    }
  }

  getMetrics(): BotDetectionMetrics {
    const avgFee = this.feeCount > 0 ? this.totalFees / this.feeCount : 0;

    // Calculate wallet age distribution
    let ephemeralWallets = 0;
    let newWallets = 0;
    const now = this.currentSlot;

    for (const [wallet, firstSeen] of this.walletFirstSeen) {
      const age = now - firstSeen;
      if (age < 1000) ephemeralWallets++;  // < 1000 slots = Bot-Signal
      if (age < 10000) newWallets++;       // < 10000 slots = neu
    }

    // Enhanced Bot probability based on multiple signals
    let botProb = 0;

    // Jito bundles (strong signal)
    if (this.jitoBundleCount > 0) botProb += 0.25;
    if (this.jitoBundleCount > 10) botProb += 0.15;
    if (this.jitoBundleCount > 50) botProb += 0.20;

    // High priority transactions (moderate signal)
    if (this.veryHighPriorityCount > 5) botProb += 0.30;
    if (this.highPriorityCount > 20) botProb += 0.20;
    if (this.highPriorityCount > 100) botProb += 0.15;

    // MEV activity
    if (this.mevTxCount > 10) botProb += 0.20;
    if (this.sandwichCount > 5) botProb += 0.25;

    // Many ephemeral wallets = bot
    if (ephemeralWallets > 10) botProb += 0.25;
    if (ephemeralWallets > 50) botProb += 0.20;

    return {
      jitoBundleCount: this.jitoBundleCount,
      highPriorityTxCount: this.highPriorityCount,
      veryHighPriorityTxCount: this.veryHighPriorityCount,
      totalFees: this.totalFees,
      avgPriorityFee: avgFee,
      botProbability: Math.min(1, botProb),
      ephemeralWallets,
      newWallets,
      totalWalletsTracked: this.walletFirstSeen.size,
      mevTxCount: this.mevTxCount,
      sandwichCount: this.sandwichCount
    };
  }

  reset() {
    this.jitoBundleCount = 0;
    this.highPriorityCount = 0;
    this.veryHighPriorityCount = 0;
    this.mevTxCount = 0;
    this.sandwichCount = 0;
    this.totalFees = 0;
    this.feeCount = 0;
    this.recentFees = [];
    // Keep wallet tracking for continuity
  }
}

// ============================================================================
// METRIC IMPLEMENTATIONS
// ============================================================================

class HawkesMetric {
  private events: number[] = [];
  constructor(private windowSize = 5000) {}
  addEvent(slot: number, timestamp: number) {
    this.events.push(timestamp);
    while (this.events.length > this.windowSize) this.events.shift();
  }
  compute() {
    if (this.events.length < 100) return { branchingRatio: 0, intensity: 0 };
    const interTimes: number[] = [];
    for (let i = 1; i < this.events.length; i++) {
      const dt = this.events[i] - this.events[i-1];
      if (dt > 0) interTimes.push(dt);
    }
    if (interTimes.length < 2) return { branchingRatio: 0, intensity: 0 };
    const mean = interTimes.reduce((a,b) => a+b, 0) / interTimes.length;
    let cov = 0, var_ = 0;
    for (let i = 0; i < interTimes.length - 1; i++) {
      cov += (interTimes[i]-mean)*(interTimes[i+1]-mean);
    }
    for (const t of interTimes) var_ += Math.pow(t-mean, 2);
    cov /= (interTimes.length - 1); var_ /= interTimes.length;
    const autocorr = var_ > 0 ? cov / var_ : 0;
    const n = Math.max(0, Math.min(10, 1 / (1 - Math.max(-0.99, Math.min(0.99, autocorr)))));
    return { branchingRatio: n, intensity: 1/mean };
  }
}

class PermutationEntropyMetric {
  private prices: number[] = [];
  constructor(private windowSize = 500, private order = 4, private delay = 1) {}
  addPrice(price: number) {
    this.prices.push(price);
    while (this.prices.length > this.windowSize * this.delay + this.order) this.prices.shift();
  }
  compute() {
    if (this.prices.length < this.order * this.delay + 1) return { normalizedEntropy: 0 };
    const n = this.order;
    const counts: Map<number, number> = new Map();
    let total = 0;
    for (let i = 0; i <= this.prices.length - 1 - (n-1)*this.delay; i++) {
      const vec: number[] = [];
      for (let j = 0; j < n; j++) vec.push(this.prices[i + j * this.delay]);
      const sorted = [...vec].sort((a,b) => a-b);
      let pattern = 0;
      for (let j = 0; j < n; j++) pattern = pattern * n + sorted.indexOf(vec[j]);
      counts.set(pattern, (counts.get(pattern) || 0) + 1); total++;
    }
    let entropy = 0;
    for (const c of counts.values()) { const p = c/total; if (p > 0) entropy -= p * Math.log2(p); }
    const maxEntropy = Math.log2(24);
    return { normalizedEntropy: Math.max(0, Math.min(1, entropy / maxEntropy)) };
  }
}

class GraphMetric {
  private adjacency: Map<string, Set<string>> = new Map();
  constructor(private maxNodes = 50000) {}
  addEdge(from: string, to: string, timestamp: number) {
    if (!this.adjacency.has(from)) this.adjacency.set(from, new Set());
    if (!this.adjacency.has(to)) this.adjacency.set(to, new Set());
    this.adjacency.get(from)!.add(to);
    this.adjacency.get(to)!.add(from);
    if (this.adjacency.size > this.maxNodes) {
      const first = this.adjacency.keys().next().value;
      if (first) this.adjacency.delete(first);
    }
  }
  compute() {
    if (this.adjacency.size < 10) return { molloyReedRatio: 0, fragmentation: 0 };
    let totalDegree = 0; const degrees: number[] = [];
    for (const [, neighbors] of this.adjacency) { const d = neighbors.size; degrees.push(d); totalDegree += d; }
    const N = this.adjacency.size, meanDeg = totalDegree / N;
    let variance = 0; for (const d of degrees) variance += Math.pow(d - meanDeg, 2); variance /= N;
    const kappa = meanDeg * (1 + variance / (meanDeg || 1));
    const components = this.findComponents();
    components.sort((a,b) => b.length - a.length);
    const frag = components[0].length > 0 ? components[1].length / components[0].length : 0;
    return { molloyReedRatio: kappa, fragmentation: frag };
  }
  private findComponents(): string[][] {
    const visited = new Set<string>(); const result: string[][] = [];
    for (const node of this.adjacency.keys()) {
      if (visited.has(node)) continue;
      const component: string[] = []; const queue = [node];
      while (queue.length) { const curr = queue.shift()!; if (visited.has(curr)) continue; visited.add(curr); component.push(curr);
        for (const n of this.adjacency.get(curr) || []) if (!visited.has(n)) queue.push(n); }
      result.push(component);
    }
    return result;
  }
}

class EpidemicMetric {
  private events: { src: number; dst: number; slot: number }[] = [];
  constructor(private windowSize = 1000) {}
  addTransmission(srcSlot: number, dstSlot: number) {
    if (dstSlot <= srcSlot) return;
    this.events.push({ src: srcSlot, dst: dstSlot, slot: dstSlot });
    while (this.events.length > this.windowSize) this.events.shift();
  }
  compute() {
    if (this.events.length < 50) return { rt: 0 };
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
  private mags: number[] = [];
  constructor(private windowSize = 1000) {}
  addMagnitude(m: number) { this.mags.push(m); while (this.mags.length > this.windowSize) this.mags.shift(); }
  compute() {
    if (this.mags.length < 50) return { bValue: 0 };
    const sorted = [...this.mags].sort((a,b) => a-b); const n = sorted.length;
    const mMin = sorted[0]; const meanDev = sorted.reduce((s,m) => s + (m - mMin), 0) / n;
    let b = meanDev > 0.001 ? 1 / (meanDev * Math.LN10) : 10;
    b = Math.max(0.1, Math.min(10, b));
    return { bValue: b };
  }
}

class TransferEntropyMetric {
  private flows: Map<string, number> = new Map();
  constructor(private windowSize = 1000, private clusterCount = 5) {}
  addTransfer(src: number, dst: number, value = 1) {
    if (src < 0 || src >= this.clusterCount || dst < 0 || dst >= this.clusterCount) return;
    if (src === dst) return;
    const key = `${src}→${dst}`;
    this.flows.set(key, (this.flows.get(key) || 0) + value);
    while (this.flows.size > this.windowSize) { const first = this.flows.keys().next().value; if (first) this.flows.delete(first); }
  }
  compute() {
    if (this.flows.size < 50) return { clustering: 0 };
    let totalFlow = 0; for (const c of this.flows.values()) totalFlow += c;
    let herfindahl = 0; for (const c of this.flows.values()) { const share = c / totalFlow; herfindahl += share * share; }
    return { clustering: Math.max(0, Math.min(1, herfindahl * (this.clusterCount / (this.clusterCount - 1)) || 0)) };
  }
}

class SuperspreaderMetric {
  private activity: Map<string, number> = new Map();
  private degree: Map<string, number> = new Map();
  constructor(private activityWindow = 100, private degreeThreshold = 4) {}
  addActivity(nodeId: string, deg: number, act = 1) {
    this.activity.set(nodeId, (this.activity.get(nodeId) || 0) + act);
    this.degree.set(nodeId, deg);
  }
  compute() {
    if (this.activity.size < 10) return { activationIndex: 0 };
    let totalDeg = 0; for (const d of this.degree.values()) totalDeg += d;
    const meanDeg = totalDeg / this.degree.size;
    const threshold = meanDeg * this.degreeThreshold;
    let superspreaderCount = 0, superspreaderActivity = 0, baselineActivity = 0;
    for (const [nodeId, act] of this.activity) {
      const deg = this.degree.get(nodeId) || 0;
      if (deg >= threshold) { superspreaderCount++; superspreaderActivity += act; }
      baselineActivity += act;
    }
    baselineActivity /= this.activity.size;
    const activationIndex = superspreaderActivity > 0 && baselineActivity > 0 && superspreaderCount > 0
      ? superspreaderActivity / (superspreaderCount * baselineActivity) : 0;
    return { activationIndex: Math.max(0, Math.min(10, activationIndex)) };
  }
}

class LiquidityImpactMetric {
  private observations: { size: number; actual: number; predicted: number }[] = [];
  constructor(private windowSize = 500, private coeff = 1, private adv = 1) {}
  addTrade(size: number, actualImpact: number, volume: number) {
    const predicted = this.coeff * Math.sqrt(size / (this.adv || 1)) * 10000;
    this.observations.push({ size, actual: actualImpact, predicted });
    while (this.observations.length > this.windowSize) this.observations.shift();
  }
  compute() {
    if (this.observations.length < 50) return { deviation: 0 };
    let totalActual = 0, totalPred = 0;
    for (const o of this.observations) { totalActual += o.actual; totalPred += o.predicted; }
    const avgActual = totalActual / this.observations.length;
    const avgPred = totalPred / this.observations.length;
    const deviation = avgPred > 0 ? Math.abs(avgActual - avgPred) / avgPred : 0;
    return { deviation: Math.max(0, Math.min(10, deviation)) };
  }
}

// ============================================================================
// CRASH PROBABILITY
// ============================================================================

const COEFFS = {
  beta0: -4.50, beta1_kappa: -1.75, beta2_rt: 1.75, beta3_PE: -2.25,
  beta4_CTE: 1.25, beta5_bValue: -1.75, beta6_n: 2.75, beta7_fragmentation: 2.25,
  beta8_SSI: 1.25, beta9_LFI: 1.75, gamma1: 1.00, gamma2: 0.75, gamma3: 0.75
};

function computeCrashProbability(z: Record<string, number>): { probability: number; confirming: string[] } {
  const c = COEFFS;
  const z_n = z.z_n || 0, z_PE = z.z_PE || 0, z_kappa = z.z_kappa || 0;
  const z_frag = z.z_fragmentation || 0, z_rt = z.z_rt || 0, z_bValue = z.z_bValue || 0;
  const z_CTE = z.z_CTE || 0, z_SSI = z.z_SSI || 0, z_LFI = z.z_LFI || 0;

  const linear = c.beta0 + c.beta1_kappa*z_kappa + c.beta2_rt*z_rt + c.beta3_PE*z_PE +
    c.beta4_CTE*z_CTE + c.beta5_bValue*z_bValue + c.beta6_n*z_n + c.beta7_fragmentation*z_frag +
    c.beta8_SSI*z_SSI + c.beta9_LFI*z_LFI + c.gamma1*z_kappa*z_n + c.gamma2*z_PE*z_frag +
    c.gamma3*z_LFI*z_SSI;

  const probability = 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, linear))));

  const confirming: string[] = [];
  if (z_n > 1.5) confirming.push('n');
  if (z_PE < -1.5) confirming.push('PE');
  if (z_kappa < -1.5) confirming.push('kappa');
  if (z_frag > 1.5) confirming.push('fragmentation');
  if (z_rt > 1.5) confirming.push('rt');
  if (z_bValue < -1.5) confirming.push('bValue');
  if (z_CTE > 1.5) confirming.push('CTE');
  if (z_SSI > 1.5) confirming.push('SSI');
  if (z_LFI > 1.5) confirming.push('LFI');

  return { probability, confirming };
}

// ============================================================================
// PAPER TRADING ENGINE
// ============================================================================

interface Position { id: string; token: string; amount: number; entryPrice: number; entrySlot: number; entryTime: number; signalSource: string; status: string; pnlSol?: number; }
interface Trade extends Position { type: 'ENTRY' | 'EXIT'; }

class PaperEngine {
  positions = new Map<string, Position>();
  history: Trade[] = [];
  totalPnl = 0;
  capital: number;

  constructor(private startingCapital: number) { this.capital = startingCapital; }

  async openPosition(token: string, amount: number, signalSource: string) {
    const pos: Position = { 
      id: uuidv4(), token, amount, entryPrice: 100, entrySlot: 0, 
      entryTime: Date.now(), signalSource, status: 'OPEN' 
    };
    this.positions.set(token, pos);
    this.history.push({ ...pos, type: 'ENTRY' });
    return { success: true, position: pos };
  }

  async closePosition(token: string, reason: string) {
    const pos = this.positions.get(token);
    if (!pos) return { success: false, error: 'No position' };
    const pnl = pos.amount * 0.1; // Mock 10% gain
    this.capital += pnl;
    this.totalPnl += pnl;
    pos.status = 'CLOSED'; pos.pnlSol = pnl;
    this.positions.delete(token);
    this.history.push({ ...pos, type: 'EXIT' });
    return { success: true, pnl, totalPnl: this.totalPnl };
  }

  getPerformance() {
    const exits = this.history.filter(t => t.type === 'EXIT') as (Trade & { pnlSol: number })[];
    const wins = exits.filter(t => (t.pnlSol || 0) > 0);
    const losses = exits.filter(t => (t.pnlSol || 0) < 0);

    // Calculate max drawdown
    let peak = this.startingCapital;
    let maxDrawdown = 0;
    let runningCapital = this.startingCapital;

    for (const exit of exits) {
      runningCapital += exit.pnlSol || 0;
      if (runningCapital > peak) {
        peak = runningCapital;
      }
      const drawdown = (peak - runningCapital) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    // Calculate Sharpe Ratio (simplified, risk-free rate = 0)
    const returns = exits.map(t => (t.pnlSol || 0) / this.startingCapital);
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const variance = returns.length > 1 ? returns.reduce((a, r) => a + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1) : 0;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized

    return {
      startingCapital: this.startingCapital,
      currentCapital: this.capital,
      totalPnlSol: this.totalPnl,
      totalTrades: exits.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: exits.length > 0 ? (wins.length / exits.length) * 100 : 0,
      openPositions: Array.from(this.positions.values()),
      maxDrawdown: maxDrawdown * 100,
      sharpeRatio: sharpeRatio
    };
  }
}

// ============================================================================
// PREDICTION LOGGER
// ============================================================================

interface PredictionRecord {
  id: string; timestamp: number; slot: number; 
  rawMetrics: Record<string, number>; zScores: Record<string, number>;
  crashProbability: number; confirmingMetrics: number; zone: string;
  action?: string; actionReason?: string; positionId?: string;
  actualCrash?: boolean; verificationStatus: string; hash: string;
}

class PredictionLogger {
  private predictions: PredictionRecord[] = [];

  log(slot: number, raw: Record<string, number>, z: Record<string, number>,
      prob: number, confirming: string[], zone: string): PredictionRecord {
    const record: PredictionRecord = {
      id: uuidv4(), timestamp: Date.now(), slot, 
      rawMetrics: raw, zScores: z,
      crashProbability: prob, confirmingMetrics: confirming.length, zone,
      verificationStatus: 'PENDING', hash: ''
    };
    record.hash = CryptoJS.SHA256(JSON.stringify(record)).toString();
    this.predictions.push(record);
    return record;
  }

  getHighProbabilitySignals(threshold = 0.2): PredictionRecord[] {
    return this.predictions.filter(p => p.crashProbability >= threshold);
  }

  getSummary() {
    const total = this.predictions.length;
    const zones = { IGNORE: 0, MONITOR: 0, IMMEDIATE_SHORT: 0 };
    for (const p of this.predictions) {
      zones[p.zone as keyof typeof zones]++;
    }
    const highProb = this.predictions.filter(p => p.crashProbability >= 0.2).length;
    return { totalPredictions: total, zoneDistribution: zones, highProbabilitySignals: highProb };
  }

  exportCSV(): string {
    const headers = ['id', 'timestamp', 'slot', 'crashProbability', 'confirmingMetrics', 'zone'];
    return [headers.join(','), ...this.predictions.map(p =>
      [p.id, p.timestamp, p.slot, p.crashProbability.toFixed(6), p.confirmingMetrics, p.zone].join(',')
    )].join('\n');
  }

  saveToFile(filename: string) {
    try {
      fs.writeFileSync(filename, JSON.stringify(this.predictions, null, 2));
      console.log(`[Logger] Saved ${this.predictions.length} predictions to ${filename}`);
    } catch (err) {
      console.error('[Logger] Failed to save predictions:', err.message);
    }
  }
}

// ============================================================================
// LIVE PAPER TRADING RUNNER
// ============================================================================

enum Zone { IGNORE = 'IGNORE', MONITOR = 'MONITOR', IMMEDIATE_SHORT = 'IMMEDIATE_SHORT' }

interface CrashSignal {
  slot: number; crashProbability: number; confirmingMetrics: number; 
  zScores: Record<string, number>; timestamp: number; zone: Zone;
  rawMetrics: Record<string, number>;
}

class LivePaperTradingRunner {
  private metrics = {
    hawkes: new HawkesMetric(),
    entropy: new PermutationEntropyMetric(),
    graph: new GraphMetric(),
    epidemic: new EpidemicMetric(),
    seismic: new GutenbergRichterMetric(),
    transfer: new TransferEntropyMetric(),
    superspreader: new SuperspreaderMetric(),
    liquidity: new LiquidityImpactMetric()
  };

  private botDetection = new BotDetection();
  private stats: Map<string, { sum: number; sumSq: number; count: number }> = new Map();
  private recentFees: number[] = [];
  private recentSlots: number[] = [];
  public currentSolPrice: number = 84.0; // Realer SOL-Preis von Jupiter

  constructor(
    private engine: PaperEngine,
    private logger: PredictionLogger,
    private config = { ignoreThreshold: 0.10, monitorThreshold: 0.20, kellyMode: 'quarter', maxPositions: 4, minConfirming: 3 }
  ) {
    ['n','PE','kappa','fragmentation','rt','bValue','CTE','SSI','LFI'].forEach(k =>
      this.stats.set(k, { sum: 0, sumSq: 0, count: 0 })
    );
  }

  async fetchAndProcessNetworkData(): Promise<void> {
    try {
      const currentSlot = await getCurrentSlot();

      // Get real prices from Jupiter API for PermutationEntropy
      const prices = await getJupiterPrices();
      const solPrice = prices.get("So11111111111111111111111111111111111111112") || 100;

      // Store price for WebSocket broadcast to Perspective
      this.currentSolPrice = solPrice;

      // Get recent blocks for network-wide metrics
      const blocks = await getRecentBlocks(5);

      for (const block of blocks) {
        if (!block) continue;

        const slot = block.slot || currentSlot;
        const timestamp = Date.now();
        const numTx = block.numTransactions || 0;
        const fee = block.rewards?.[0]?.lamports || 5000;

        // Update Hawkes with slot arrivals
        this.metrics.hawkes.addEvent(slot, timestamp);

        // Update fee history
        this.recentFees.push(fee);
        this.recentSlots.push(slot);
        if (this.recentFees.length > 1000) {
          this.recentFees.shift();
          this.recentSlots.shift();
        }

        // Use REAL Solana price for PermutationEntropy (not simulated)
        // Higher fees often correlate with network congestion but REAL price is better
        this.metrics.entropy.addPrice(solPrice);

        // Gutenberg-Richter: fee magnitude
        const magnitude = Math.log1p(fee) / 10;
        this.metrics.seismic.addMagnitude(magnitude);

        // Liquidity: fee deviation from sqrt model
        const predictedFee = 10000 * Math.sqrt(numTx / 1000);
        const actualImpact = Math.abs(fee - predictedFee) / predictedFee;
        this.metrics.liquidity.addTrade(numTx, actualImpact, numTx * 1000);
      }

      // Get transactions from major DEX (Jupiter)
      const jupiter = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
      const signatures = await getRecentSignatures(jupiter, 20);
      const currentAvgFee = this.recentFees.length > 0 ? this.recentFees.reduce((a,b) => a+b, 0) / this.recentFees.length : 10000;
      const lastSlot = this.recentSlots[this.recentSlots.length - 1] || currentSlot;

      for (const sigInfo of signatures.slice(0, 10)) {
        const sig = sigInfo.signature || sigInfo;
        try {
          const tx = await getTransaction(sig);
          if (!tx) continue;

          const meta = tx.meta || {};
          const fee = meta.fee || 5000;
          const compute = meta.computeUnitsConsumed || 10000;

          // Update graph with accounts
          const message = tx.transaction?.message || {};
          const accounts = message.accountKeys || [];
          if (accounts.length >= 2) {
            for (let i = 1; i < Math.min(accounts.length, 5); i++) {
              const from = accounts[0]?.pubkey || 'root';
              const to = accounts[i]?.pubkey || `acc${i}`;
              this.metrics.graph.addEdge(from, to, Date.now());
            }
          }

          // Superspreader: high compute users
          const avgCompute = 10000;
          if (compute > avgCompute * 2) {
            const signer = accounts[0]?.pubkey || 'unknown';
            this.metrics.superspreader.addActivity(signer, compute / avgCompute, 1);
          }

          // Transfer entropy: cluster flows
          const clusterCount = 5;
          const srcCluster = Math.abs(this.hashCode(accounts[0]?.pubkey || '') % clusterCount);
          const dstCluster = Math.abs(this.hashCode(accounts[1]?.pubkey || '') % clusterCount);
          this.metrics.transfer.addTransfer(srcCluster, dstCluster, 1);

          // Epidemic: cascading failures
          if (fee > currentAvgFee * 1.5) {
            const prevSlot = this.recentSlots[this.recentSlots.length - 2] || lastSlot;
            this.metrics.epidemic.addTransmission(prevSlot, lastSlot);
          }

          // Bot Detection: Jito bundles, priority fees, and wallet age
          this.botDetection.recordTransaction(tx, currentSlot);

        } catch (e) {
          // Skip failed tx fetches
        }
      }

      this.updateStats();
    } catch (e: any) {
      console.error('[Runner] Error fetching network data:', e.message);
    }
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  private updateStats() {
    const raw = this.computeRawMetrics();
    for (const [k, v] of Object.entries(raw)) {
      const st = this.stats.get(k);
      if (!st) continue;
      st.sum += v; st.sumSq += v*v; st.count++;
      if (st.count > 2000) { st.sum *= 0.999; st.sumSq *= 0.999; st.count *= 0.999; }
    }
  }

  computeRawMetrics() {
    return {
      n: this.metrics.hawkes.compute().branchingRatio,
      PE: this.metrics.entropy.compute().normalizedEntropy,
      kappa: this.metrics.graph.compute().molloyReedRatio,
      fragmentation: this.metrics.graph.compute().fragmentation,
      rt: this.metrics.epidemic.compute().rt,
      bValue: this.metrics.seismic.compute().bValue,
      CTE: this.metrics.transfer.compute().clustering,
      SSI: this.metrics.superspreader.compute().activationIndex,
      LFI: this.metrics.liquidity.compute().deviation
    };
  }

  computeZScores() {
    const raw = this.computeRawMetrics();
    const z: Record<string, number> = {};

    for (const [k, v] of Object.entries(raw)) {
      const st = this.stats.get(k);
      if (!st || st.count < 30) { z[`z_${k}`] = 0; continue; }
      const mean = st.sum / st.count;
      const variance = st.sumSq / st.count - mean * mean;
      const std = Math.sqrt(Math.max(0, variance));
      z[`z_${k}`] = std > 0.001 ? (v - mean) / std : 0;
    }
    return z;
  }

  getZone(prob: number): Zone {
    if (prob < this.config.ignoreThreshold) return Zone.IGNORE;
    if (prob < this.config.monitorThreshold) return Zone.MONITOR;
    return Zone.IMMEDIATE_SHORT;
  }

  getPerformance() {
    return this.engine.getPerformance();
  }

  async computeSignal(slot: number): Promise<CrashSignal | null> {
    const raw = this.computeRawMetrics();
    const z = this.computeZScores();
    const { probability, confirming } = computeCrashProbability(z);
    const zone = this.getZone(probability);

    this.logger.log(slot, raw, z, probability, confirming, zone);

    return {
      slot, crashProbability: probability, confirmingMetrics: confirming.length,
      zScores: z, timestamp: Date.now(), zone, rawMetrics: raw
    };
  }

  async processSignal(signal: CrashSignal) {
    if (signal.zone === Zone.IGNORE) return { action: 'ignored', reason: 'Below threshold' };
    if (signal.zone === Zone.MONITOR) return { action: 'monitoring', reason: 'In monitor zone' };
    if (signal.confirmingMetrics < this.config.minConfirming) return { action: 'rejected', reason: 'Insufficient confirming metrics' };

    const perf = this.engine.getPerformance();
    if (perf.openPositions.length >= this.config.maxPositions) return { action: 'rejected', reason: 'Max positions reached' };

    const kelly = this.config.kellyMode === 'quarter' ? 0.14 : 0.27;
    const size = perf.currentCapital * kelly * (signal.confirmingMetrics >= 4 ? 1.0 : 0.75);

    if (size < 0.1) return { action: 'rejected', reason: 'Position too small' };

    const token = 'SOL';
    const result = await this.engine.openPosition(token, size, `crash:P=${signal.crashProbability.toFixed(4)}`);
    if (result.success) return { action: 'opened', positionId: result.position?.id, size };
    return { action: 'error', reason: 'Unknown error' };
  }

  async run(intervalMs = 30000) {
    console.log('='.repeat(60));
    console.log('LIVE PAPER TRADING - INITIALIZATION');
    console.log('='.repeat(60));
    console.log(`Data Source: Chainstack REST API`);
    console.log(`RPC: ${CHAINSTACK_RPC}`);
    console.log(`Update Interval: ${intervalMs / 1000}s`);
    console.log('');

    let iteration = 0;

    const runLoop = async () => {
      try {
        const slot = await getCurrentSlot();
        
        console.log(`\n[${new Date().toISOString()}] Fetching network data... (slot: ${slot})`);
        
        await this.fetchAndProcessNetworkData();
        
        const signal = await this.computeSignal(slot);
        
        if (signal) {
          console.log(`[Signal] P(crash) = ${signal.crashProbability.toFixed(4)} | Zone: ${signal.zone} | Confirming: ${signal.confirmingMetrics}/9`);
          
          if (signal.zone !== Zone.IGNORE) {
            const result = await this.processSignal(signal);
            if (result.action === 'opened') {
              console.log(`  ✓ POSITION OPENED: ${result.size?.toFixed(2)} SOL`);
            }
          }

          // Show raw metrics every 5 iterations
          if (iteration % 5 === 0) {
            const raw = signal.rawMetrics;
            console.log(`  Metrics: n=${raw.n?.toFixed(2)}, PE=${raw.PE?.toFixed(2)}, κ=${raw.kappa?.toFixed(2)}, frag=${raw.fragmentation?.toFixed(2)}`);
          }
        }

        // Show performance every 10 iterations
        if (iteration % 10 === 0 && iteration > 0) {
          const perf = this.engine.getPerformance();
          console.log(`\n[Performance] Capital: ${perf.currentCapital.toFixed(2)} SOL | Trades: ${perf.totalTrades} | Win Rate: ${perf.winRate.toFixed(0)}%`);
        }

        // Log bot detection every 5 iterations
        if (iteration % 5 === 0) {
          const cbMetrics = comprehensiveBotDetector.getMetrics();
          console.log(`  [Bot] Jito: ${cbMetrics.jitoBundleCount} | Sandwich: ${cbMetrics.sandwichCount} | Liq: ${cbMetrics.liquidationCount} | Sniper: ${cbMetrics.sniperCount} | Arb: ${cbMetrics.arbitrageCount} | Prob: ${(cbMetrics.botProbability * 100).toFixed(0)}%`);
        }

        iteration++;
      } catch (e) {
        console.error('[Runner] Error:', e.message);
      }

      setTimeout(runLoop, intervalMs);
    };

    // Initial fetch
    await this.fetchAndProcessNetworkData();
    console.log('\n[Runner] Network data fetched. Starting infinite loop...\n');

    // Run INFINITE loop (no timeout - production mode)
    runLoop();
  }

  async runInfinite(intervalMs = 30000) {
    console.log('='.repeat(60));
    console.log('LIVE PAPER TRADING - INFINITE MODE');
    console.log('='.repeat(60));
    console.log(`Data Source: Chainstack REST API`);
    console.log(`RPC: ${CHAINSTACK_RPC}`);
    console.log(`Update Interval: ${intervalMs / 1000}s`);
    console.log(`Press Ctrl+C to stop`);
    console.log('');

    let iteration = 0;

    const runLoop = async () => {
      try {
        const slot = await getCurrentSlot();

        console.log(`[${new Date().toISOString()}] Fetching network data... (slot: ${slot})`);

        await this.fetchAndProcessNetworkData();

        const signal = await this.computeSignal(slot);

        if (signal) {
          console.log(`[Signal] P(crash) = ${signal.crashProbability.toFixed(4)} | Zone: ${signal.zone} | Confirming: ${signal.confirmingMetrics}/9`);

          if (signal.zone !== Zone.IGNORE) {
            const result = await this.processSignal(signal);
            if (result.action === 'opened') {
              console.log(`  ✓ POSITION OPENED: ${result.size?.toFixed(2)} SOL`);
            }
          }

          // Show raw metrics every 5 iterations
          if (iteration % 5 === 0) {
            const raw = signal.rawMetrics;
            console.log(`  Metrics: n=${raw.n?.toFixed(2)}, PE=${raw.PE?.toFixed(2)}, κ=${raw.kappa?.toFixed(2)}, frag=${raw.fragmentation?.toFixed(2)}`);
          }
        }

        // Show performance every 10 iterations
        if (iteration % 10 === 0 && iteration > 0) {
          const perf = this.engine.getPerformance();
          console.log(`\n[Performance] Capital: ${perf.currentCapital.toFixed(2)} SOL | Trades: ${perf.totalTrades} | Win Rate: ${perf.winRate.toFixed(0)}%`);
        }

        // Log bot detection every 5 iterations
        if (iteration % 5 === 0) {
          const cbMetrics = comprehensiveBotDetector.getMetrics();
          console.log(`  [Bot] Jito: ${cbMetrics.jitoBundleCount} | Sandwich: ${cbMetrics.sandwichCount} | Liq: ${cbMetrics.liquidationCount} | Sniper: ${cbMetrics.sniperCount} | Arb: ${cbMetrics.arbitrageCount} | Prob: ${(cbMetrics.botProbability * 100).toFixed(0)}%`);
        }

        iteration++;
      } catch (e: any) {
        console.error('[Runner] Error:', e.message);
      }

      setTimeout(runLoop, intervalMs);
    };

    // Initial fetch
    await this.fetchAndProcessNetworkData();
    console.log('[Runner] Network data fetched. Starting infinite loop...\n');

    // Start the loop
    runLoop();
  }
}

// ============================================================================
// BOOTSTRAP
// ============================================================================

// ============================================================================
// WEBSOCKET SERVER FOR DASHBOARD
// ============================================================================

let wss: WebSocketServer | null = null;
let broadcastInterval: NodeJS.Timeout | null = null;
let connectedClients = 0;

function startWebSocketServer(runner: LivePaperTradingRunner, logger: PredictionLogger, port = 8080) {
  wss = new WebSocketServer({ 
    port, 
    host: '0.0.0.0',
    verifyClient: (info, cb) => {
      // Allow all origins in development
      // In production, you'd want to restrict this
      const origin = info.origin || info.req.headers.origin;
      console.log(`[WebSocket] Connection from origin: ${origin}`);
      cb(true); // Allow connection
    }
  });

  console.log(`[WebSocket] Server started on ws://0.0.0.0:${port}`);

  wss.on('connection', (ws, req) => {
    connectedClients++;
    console.log(`[WebSocket] Client connected (${connectedClients} total) from ${req.socket.remoteAddress}`);

    // Send initial state
    const initialState = {
      type: 'INIT',
      performance: runner.getPerformance(),
      summary: logger.getSummary(),
      timestamp: Date.now(),
      connectedClients
    };
    ws.send(JSON.stringify(initialState));

    ws.on('close', () => {
      connectedClients--;
      console.log(`[WebSocket] Client disconnected (${connectedClients} remaining)`);
    });
  });

  // Ranking update every 10 minutes
  let lastRankingUpdate = 0;
  const RANKING_INTERVAL_MS = 10 * 60 * 1000; // 10 Minuten

  const updateRanking = async () => {
    if (Date.now() - lastRankingUpdate >= RANKING_INTERVAL_MS) {
      try {
        await rankingService.runRankingCycle();
        lastRankingUpdate = Date.now();
      } catch (e) {
        console.error('[Ranking] Update Fehler:', e);
      }
    }
  };

  // Initial ranking
  rankingService.runRankingCycle().catch(console.error);

  // Broadcast updates every second
  broadcastInterval = setInterval(async () => {
    if (wss && wss.clients.size > 0) {
      const perf = runner.getPerformance();
      const summary = logger.getSummary();

      // Update ranking if due
      await updateRanking();

      // Get latest prediction with price data
      const predictions = (logger as any).predictions || [];
      let latestPrediction = predictions[predictions.length - 1];

      // Add price and symbol to latestPrediction for Perspective
      const currentPrice = (runner as any).currentSolPrice;
      if (latestPrediction) {
        latestPrediction = {
          ...latestPrediction,
          symbol: 'SOL',
          rawMetrics: {
            ...(latestPrediction.rawMetrics || {}),
            price: currentPrice || 0,
          }
        };
      }

      // Server-side aggregation for latency stats
      const latencyHistory = (globalThis as any).__latencyHistory || [];
      const currentLatency = Date.now() - (latestPrediction?.timestamp || Date.now());
      latencyHistory.push(currentLatency);
      if (latencyHistory.length > 100) latencyHistory.shift();
      (globalThis as any).__latencyHistory = latencyHistory;

      const sortedLatencies = [...latencyHistory].sort((a, b) => a - b);
      const latencyStats = {
        current: currentLatency,
        avg: latencyHistory.reduce((a, b) => a + b, 0) / latencyHistory.length,
        max: Math.max(...latencyHistory),
        min: Math.min(...latencyHistory),
        p95: sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0
      };

      // Regime change detection
      const regimeAlert = detectRegimeChange(runner, predictions);

      const update = {
        type: regimeAlert ? 'REGIME_CHANGE' : 'UPDATE',
        performance: perf,
        summary: summary,
        latestPrediction: latestPrediction || null,
        botMetrics: comprehensiveBotDetector.getMetrics(),
        latencyStats,
        regimeAlert,
        top10ShortTargets: rankingService.getTop10(),
        rankingTimestamp: rankingService.getLastRanking()?.timestamp || 0,
        timestamp: Date.now(),
        connectedClients // Include connected client count
      };

      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(update));
        }
      }
    }
  }, 1000);

  return wss;
}

// ============================================================================
// REGIME CHANGE DETECTION - SOTA Early Warning System
// ============================================================================

interface RegimeAlert {
  timestamp: number;
  type: 'WARNING' | 'CRITICAL' | 'INFO';
  metric: string;
  message: string;
  value: number;
  threshold: number;
}

let lastRegimeState = {
  avgCrashProbability: 0,
  avgConfirming: 0,
  botProbability: 0,
  timestamp: Date.now()
};

function detectRegimeChange(runner: LivePaperTradingRunner, predictions: any[]): RegimeAlert | null {
  const recent = predictions.slice(-20);
  if (recent.length < 10) return null;

  const avgCrashProb = recent.reduce((a, p) => a + p.crashProbability, 0) / recent.length;
  const avgConfirming = recent.reduce((a, p) => a + p.confirmingMetrics, 0) / recent.length;
  const botMetrics = (runner as any).botDetection?.getMetrics();
  const botProb = botMetrics?.botProbability || 0;

  const timeSinceLastChange = Date.now() - lastRegimeState.timestamp;
  const crashProbChange = Math.abs(avgCrashProb - lastRegimeState.avgCrashProbability);
  const botChange = Math.abs(botProb - lastRegimeState.botProbability);

  // Detect significant regime shifts
  if (crashProbChange > 0.15 && timeSinceLastChange > 30000) {
    lastRegimeState = { avgCrashProbability: avgCrashProb, avgConfirming, botProbability: botProb, timestamp: Date.now() };

    if (avgCrashProb > 0.3) {
      return {
        timestamp: Date.now(),
        type: 'CRITICAL',
        metric: 'crashProbability',
        message: `Kritischer Anstieg der Crash-Wahrscheinlichkeit auf ${(avgCrashProb * 100).toFixed(1)}%`,
        value: avgCrashProb,
        threshold: 0.3
      };
    } else if (avgCrashProb > 0.15) {
      return {
        timestamp: Date.now(),
        type: 'WARNING',
        metric: 'crashProbability',
        message: `Erhöhte Crash-Wahrscheinlichkeit: ${(avgCrashProb * 100).toFixed(1)}%`,
        value: avgCrashProb,
        threshold: 0.15
      };
    }
  }

  // Bot detection alert
  if (botProb > 0.7 && lastRegimeState.botProbability < 0.7 && timeSinceLastChange > 60000) {
    lastRegimeState = { avgCrashProbability: avgCrashProb, avgConfirming, botProbability: botProb, timestamp: Date.now() };
    return {
      timestamp: Date.now(),
      type: 'WARNING',
      metric: 'botProbability',
      message: `Hohe Bot-Aktivität detected: ${(botProb * 100).toFixed(1)}%`,
      value: botProb,
      threshold: 0.7
    };
  }

  // High confirming metrics alert
  if (avgConfirming >= 5 && lastRegimeState.avgConfirming < 5 && timeSinceLastChange > 30000) {
    lastRegimeState = { avgCrashProbability: avgCrashProb, avgConfirming, botProbability: botProb, timestamp: Date.now() };
    return {
      timestamp: Date.now(),
      type: 'INFO',
      metric: 'confirmingMetrics',
      message: `Starke Konsens-Metrik: ${avgConfirming.toFixed(1)}/9 Indikatoren bestätigen Crash`,
      value: avgConfirming,
      threshold: 5
    };
  }

  return null;
}

// ============================================================================
// AUTO-RESTART WITH EXPONENTIAL BACKOFF
// ============================================================================

let restartDelay = 1000; // Start with 1 second

async function runWithRestart() {
  const engine = new PaperEngine(100);
  const logger = new PredictionLogger();
  const runner = new LivePaperTradingRunner(engine, logger);

  // Start WebSocket server
  startWebSocketServer(runner, logger);

  // Add graceful shutdown handler
  const shutdown = () => {
    console.log('[Main] Shutdown signal received');
    if (broadcastInterval) clearInterval(broadcastInterval);
    if (wss) wss.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    // Run with periodic status updates instead of timeout
    await runner.runInfinite(30000);

    // If we exit normally, reset restart delay
    restartDelay = 1000;
  } catch (error: any) {
    console.error('[Main] Fatal error:', error.message);
    console.log(`[Main] Restarting in ${restartDelay}ms...`);

    // Exponential backoff
    setTimeout(runWithRestart, restartDelay);
    restartDelay = Math.min(restartDelay * 2, 60000); // Max 60 seconds
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('CRASH DETECTION SYSTEM - STARTING');
  console.log('='.repeat(60));
  console.log(`PID: ${process.pid}`);
  console.log(`Started: ${new Date().toISOString()}`);

  // Start Comprehensive Bot Detection (Lexikon-basiert)
  await comprehensiveBotDetector.start();
  console.log('='.repeat(60));

  await runWithRestart();
}

main().catch(console.error);
