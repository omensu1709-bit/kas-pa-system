/**
 * KAS PA v4.0 - LIVE PAPER TRADING V4
 * 
 * SOTA Multi-Coin Crash Prediction System
 * 
 * Architecture:
 * 1. DexScreener (Primary Filter) -> 200+ tokens
 * 2. Ranking Service (30min) -> Top 10 coins
 * 3. Helius + Chainstack (30s) -> Full 9-metric analysis
 * 4. Bot Detection -> Manipulative activity filter
 * 5. Bayesian Decision Engine -> Probabilistic trade decisions
 * 6. Multi-Coin Paper Trading -> Positions on Top-10
 */

import axios from 'axios';
import { WebSocketServer, WebSocket } from 'ws';
import * as fs from 'fs';
import * as path from 'path';

// Import existing services
import { rankingService, type ShortTarget } from './ranking-service.js';
import { comprehensiveBotDetector } from './comprehensive-bot-detector.js';
import { bayesianEngine, type DecisionResult, type CrashSignal, type TradingRegime } from './bayesian-decision-engine.js';
import { priceVelocityTracker, type PriceVelocitySignal } from './signals/price-velocity-tracker.js';
import { orderBookFetcher, getOrderBookBoost } from './signals/orderbook-signal.js';
import { consensusEngine, logConsensus } from './signals/multi-signal-consensus.js';

// Import crash detection metrics (LOCAL - copied from ../../data/src/metrics/)
import {
  HawkesMetric,
  PermutationEntropyMetric,
  GraphMetric,
  EpidemicMetric,
  GutenbergRichterMetric,
  TransferEntropyMetric,
  SuperspreaderMetric,
  LiquidityImpactMetric,
  computeCrashProbability,
} from './metrics/index.js';

// Import paper trading
import { CrashSignalAdapter, SignalZone } from './crash-signal-adapter.js';
import { PaperTradingEngine } from './engine/paper-trading-engine.js';
import { PredictionLogger } from './crash-prediction-logger.js';

// Import Helius REST Service (Developer Plan Compatible)
import { heliusRestService, MemecoinSignal } from './services/helius-rest-service.js';

// ============================================================================
// SOTA v5.0: Yellowstone gRPC Service (On-Chain OrderBook)
// ============================================================================
import { yellowstoneService, type OrderBookImbalance } from './services/yellowstone-service.js';

// ============================================================================
// SOTA v5.0: Order Book Imbalance Signal (OBI)
// ============================================================================
import { obiSignal, type OBISignal } from './signals/orderbook-imbalance.js';

// ============================================================================
// KNOW-ALL-SHORT: OrderBook Analyzer
// ============================================================================
import { orderBookAnalyzer, type ShortSignal as OBShortSignal } from './signals/orderbook-analyzer.js';
import { signalAggregator } from './signals/signal-aggregator.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CHAINSTACK_RPC = "https://solana-mainnet.core.chainstack.com";
const AUTH = { username: "friendly-mcclintock", password: "armed-stamp-reuse-grudge-armful-script" };
const HELIUS_API = "https://api.helius.xyz/v0";
const HELIUS_KEY = "bdbceecb-7fca-4dcb-856d-a5e8c5cc38e9";

interface Config {
  updateIntervalMs: number;      // 30000 = 30s
  rankingIntervalMs: number;   // 1800000 = 30min
  maxPositions: number;       // 4
  startingCapital: number;     // 100 SOL
}

const CONFIG: Config = {
  updateIntervalMs: 30000,
  rankingIntervalMs: 30 * 60 * 1000,
  maxPositions: 4,  // Max 4 simultaneous positions
  startingCapital: 100
};

// ============================================================================
// CHAINSTACK RPC
// ============================================================================

async function chainstackRpc(method: string, params: any[] = []): Promise<any> {
  try {
    console.log(`[Chainstack] Calling ${method}...`);
    const response = await axios.post(CHAINSTACK_RPC, {
      jsonrpc: "2.0",
      id: 1,
      method,
      params
    }, { auth: AUTH as any, timeout: 10000 });
    console.log(`[Chainstack] ${method} SUCCESS`);
    return response.data.result;
  } catch (e: any) {
    console.error(`[Chainstack] RPC Error: ${method}`, {
      status: e.response?.status,
      statusText: e.response?.statusText,
      message: e.message,
      auth: AUTH
    });
    return null;
  }
}

async function getRecentSignatures(address: string, limit = 50): Promise<any[]> {
  return await chainstackRpc("getSignaturesForAddress", [address, { limit }]) || [];
}

async function getTransaction(signature: string): Promise<any> {
  return await chainstackRpc("getTransaction", [signature, {
    encoding: "jsonParsed",
    maxSupportedTransactionVersion: 0
  }]);
}

// ============================================================================
// HELIUS PRICE API
// ============================================================================

async function getTokenPrices(mints: string[]): Promise<Map<string, { price: number; change24h: number }>> {
  const prices = new Map<string, { price: number; change24h: number }>();
  
  // Try Jupiter first (most reliable for major tokens)
  try {
    const response = await axios.get('https://api.jup.ag/price/v3', {
      params: { ids: mints.join(',') },
      timeout: 10000
    });
    
    const data = response.data;
    if (data) {
      for (const [mint, tokenData] of Object.entries(data)) {
        const t = tokenData as any;
        const price = parseFloat(t.usdPrice || t.price || 0);
        if (price > 0) {
          prices.set(mint, {
            price,
            change24h: parseFloat(t.priceChange24h || 0)
          });
        }
      }
    }
  } catch (e) {
    console.warn('[Price] Jupiter API failed:', (e as Error).message);
  }
  
  // Fallback: DexScreener for tokens not found in Jupiter
  const missingMints = mints.filter(m => !prices.has(m));
  if (missingMints.length > 0) {
    console.log(`[Price] Fetching ${missingMints.length} missing prices from DexScreener...`);
    
    // Split into batches of 20 (DexScreener limit)
    const BATCH_SIZE = 20;
    for (let i = 0; i < missingMints.length; i += BATCH_SIZE) {
      const batch = missingMints.slice(i, i + BATCH_SIZE);
      
      try {
        const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${batch.join(',')}`, {
          timeout: 10000
        });
        
        const pairs = response.data?.pairs || [];
        
        // Group by token address and take the pair with highest liquidity
        const bestPairs = new Map<string, any>();
        for (const pair of pairs) {
          const addr = pair.baseToken?.address?.toLowerCase();
          if (!addr) continue;
          
          const existing = bestPairs.get(addr);
          const liquidity = pair.liquidity?.usd || 0;
          
          if (!existing || liquidity > (existing.liquidity?.usd || 0)) {
            bestPairs.set(addr, pair);
          }
        }
        
        // Extract prices from best pairs
        for (const mint of batch) {
          const pair = bestPairs.get(mint.toLowerCase());
          if (pair) {
            const price = parseFloat(pair.priceUsd || 0);
            if (price > 0) {
              prices.set(mint, {
                price,
                change24h: parseFloat(pair.priceChange?.h24 || 0)
              });
              console.log(`[Price] ✅ DexScreener: ${mint.slice(0, 8)}... → $${price.toFixed(8)}`);
            }
          }
        }
      } catch (e) {
        console.error(`[Price] DexScreener batch ${i / BATCH_SIZE + 1} failed:`, (e as Error).message);
      }
      
      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < missingMints.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  }
  
  // Final fallback: Helius for remaining tokens
  const stillMissing = mints.filter(m => !prices.has(m));
  if (stillMissing.length > 0) {
    console.log(`[Price] Trying Helius for ${stillMissing.length} remaining tokens...`);
    
    for (const mint of stillMissing) {
      try {
        const heliusPrice = await getHeliusTokenPrice(mint);
        if (heliusPrice > 0) {
          prices.set(mint, { price: heliusPrice, change24h: 0 });
          console.log(`[Price] ✅ Helius: ${mint.slice(0, 8)}... → $${heliusPrice.toFixed(8)}`);
        }
      } catch (e) {
        // Silent fail for individual tokens
      }
    }
  }
  
  // Log tokens that still have no price
  const noPriceMints = mints.filter(m => !prices.has(m) || prices.get(m)!.price === 0);
  if (noPriceMints.length > 0) {
    console.warn(`[Price] ⚠️  No price found for ${noPriceMints.length} tokens:`, 
      noPriceMints.map(m => m.slice(0, 8)).join(', '));
  }
  
  return prices;
}

// Helper: Get price from Helius
async function getHeliusTokenPrice(mint: string): Promise<number> {
  try {
    const response = await axios.post(`${HELIUS_API}/token-metadata`, {
      mintAccounts: [mint]
    }, {
      params: { 'api-key': HELIUS_KEY },
      timeout: 5000
    });
    
    const tokenData = response.data?.[0];
    return parseFloat(tokenData?.priceInfo?.price || 0);
  } catch {
    return 0;
  }
}

// ============================================================================
// KNOW-ALL-SHORT: DexScreener OrderBook Data
// ============================================================================

interface DexScreenerOrderBook {
  symbol: string;
  mint: string;
  buys: number;
  sells: number;
  buyVolume: number;
  sellVolume: number;
  priceUsd: number;
  priceChange24h: number;
}

/**
 * Fetch DexScreener data with order book (buys/sells) for a token
 */
async function fetchDexScreenerOrderBook(mint: string): Promise<DexScreenerOrderBook | null> {
  try {
    const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
      timeout: 10000
    });
    
    const pairs = response.data?.pairs || [];
    if (pairs.length === 0) return null;
    
    // Find best pair (highest liquidity)
    let bestPair = pairs[0];
    let highestLiquidity = 0;
    
    for (const pair of pairs) {
      const liquidity = pair.liquidity?.usd || 0;
      if (liquidity > highestLiquidity) {
        highestLiquidity = liquidity;
        bestPair = pair;
      }
    }
    
    return {
      symbol: bestPair.baseToken?.symbol || 'UNKNOWN',
      mint: mint,
      buys: bestPair.txns?.h24?.buys || 0,
      sells: bestPair.txns?.h24?.sells || 0,
      buyVolume: bestPair.volume?.h24?.buyVolume || 0,
      sellVolume: bestPair.volume?.h24?.sellVolume || 0,
      priceUsd: parseFloat(bestPair.priceUsd || 0),
      priceChange24h: parseFloat(bestPair.priceChange?.h24 || 0)
    };
  } catch (e) {
    return null;
  }
}

/**
 * Fetch order books for multiple tokens (batched)
 */
async function fetchMultipleOrderBooks(mints: string[]): Promise<Map<string, DexScreenerOrderBook>> {
  const results = new Map<string, DexScreenerOrderBook>();
  
  // Batch by 10 to avoid overwhelming DexScreener
  const BATCH_SIZE = 10;
  for (let i = 0; i < mints.length; i += BATCH_SIZE) {
    const batch = mints.slice(i, i + BATCH_SIZE);
    
    // Fetch all in parallel
    const promises = batch.map(mint => fetchDexScreenerOrderBook(mint));
    const batchResults = await Promise.all(promises);
    
    for (const result of batchResults) {
      if (result) {
        results.set(result.mint.toLowerCase(), result);
      }
    }
    
    // Small delay between batches
    if (i + BATCH_SIZE < mints.length) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  
  return results;
}

// ============================================================================
// SLOW DOWNTREND DETECTOR
// ============================================================================

class SlowDowntrendDetector {
  private priceHistory: Map<string, number[]> = new Map();
  private readonly WINDOW_SIZE = 60; // 60 data points (e.g. 1 hour if updated 1x min)

  addPrice(symbol: string, price: number): void {
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, []);
    }
    const history = this.priceHistory.get(symbol)!;
    history.push(price);
    if (history.length > this.WINDOW_SIZE) {
      history.shift();
    }
  }

  computeScore(symbol: string): number {
    const history = this.priceHistory.get(symbol);
    if (!history || history.length < 10) return 0;

    const returns = [];
    for (let i = 1; i < history.length; i++) {
        returns.push((history[i] - history[i-1]) / history[i-1]);
    }

    // Mean of returns
    const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;

    // Z-Score approximation of momentum
    // If meanReturn is negative, we have a downtrend
    if (meanReturn < 0) {
        return Math.min(1, Math.abs(meanReturn) * 100);
    }

    return 0;
  }
}

// ============================================================================
// COIN METRICS INTERFACE
// ============================================================================

interface CoinMetrics {
  hawkes: HawkesMetric;
  entropy: PermutationEntropyMetric;
  graph: GraphMetric;
  epidemic: EpidemicMetric;
  seismic: GutenbergRichterMetric;
  transfer: TransferEntropyMetric;
  superspreader: SuperspreaderMetric;
  liquidity: LiquidityImpactMetric;
  slowDowntrend: SlowDowntrendDetector;
}

class MultiCoinCrashDetector {
  private metrics: Map<string, CoinMetrics> = new Map();
  private recentFees: number[] = [];
  private recentSlots: number[] = [];
  
  constructor() {
    this.initMetrics('SOL'); // Start with SOL
  }
  
  initMetrics(symbol: string): void {
    if (this.metrics.has(symbol)) return;

    this.metrics.set(symbol, {
      hawkes: new HawkesMetric(),
      entropy: new PermutationEntropyMetric(),
      graph: new GraphMetric(),
      epidemic: new EpidemicMetric(),
      seismic: new GutenbergRichterMetric(),
      transfer: new TransferEntropyMetric(),
      superspreader: new SuperspreaderMetric(),
      liquidity: new LiquidityImpactMetric(),
      slowDowntrend: new SlowDowntrendDetector()
    });
  }

  // Public accessor for metrics (needed by KasPAV4)
  getMetrics(symbol: string): CoinMetrics | undefined {
    return this.metrics.get(symbol);
  }

  // Public accessor for all symbols
  getAllSymbols(): string[] {
    return Array.from(this.metrics.keys());
  }

  async updateWithNetworkData(): Promise<void> {
    // Timeout wrapper: race-fail-safe for entire function (10s max)
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Network data timeout')), 10000));
    const networkPromise = this.fetchNetworkData();
    await Promise.race([networkPromise, timeoutPromise]).catch((err) => {
      // On timeout/fail, continue with empty data - don't block main loop
      console.error('[CrashDetector] updateWithNetworkData FAILED:', err.message);
      this.recentFees = [];
      this.recentSlots = [];
    });
  }

  private async fetchNetworkData(): Promise<void> {
    console.log('[CrashDetector] fetchNetworkData START');
    // Fetch recent blocks for fee analysis
    const jupiter = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
    console.log('[CrashDetector] Calling getRecentSignatures...');
    const signatures = await getRecentSignatures(jupiter, 20);
    console.log(`[CrashDetector] Got ${signatures?.length || 0} signatures`);
    
    this.recentFees = [];
    this.recentSlots = [];
    
    for (const sigInfo of signatures.slice(0, 10)) {
      try {
        // Race-fail-safe: 3s timeout per transaction
        const txPromise = getTransaction(sigInfo.signature || sigInfo);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TX timeout')), 3000));
        const tx = await Promise.race([txPromise, timeoutPromise]);
        if (!tx) {
          console.warn('[CrashDetector] getTransaction returned null for signature:', sigInfo.signature?.substring(0, 20));
          continue;
        }
        
        const meta = tx.meta || {};
        const fee = meta.fee || 5000;
        const compute = meta.computeUnitsConsumed || 10000;
        const slot = tx.slot;
        
        this.recentFees.push(fee);
        this.recentSlots.push(slot);
        
        // Update metrics with this transaction
        console.log(`[CrashDetector] Updating SOL metrics: slot=${slot}, fee=${fee}`);
        this.updateMetrics('SOL', fee, compute, tx);
      } catch (e: any) {
        // CRITICAL: TX processing fails but we need to know WHY
        // Extract the actual error location
        const stackLines = (e.stack || '').split('\n');
        const relevantLine = stackLines.find((l: string) => l.includes('.ts') || l.includes('.js')) || 'unknown';
        console.warn(`[CrashDetector] TX FAILED: ${e.message} | At: ${relevantLine.trim()}`);
      }
    }
    console.log(`[CrashDetector] fetchNetworkData COMPLETE. Processed ${this.recentFees.length} transactions`);
  }
  
  private updateMetrics(symbol: string, fee: number, compute: number, tx: any): void {
    const m = this.metrics.get(symbol);
    if (!m) {
      console.error(`[CrashDetector] CRITICAL: metrics.get('${symbol}') returned undefined!`);
      console.error(`[CrashDetector] Available symbols:`, Array.from(this.metrics.keys()));
      return;
    }
    
    // Update ALL metrics for SOL (network-wide)
    // Also update slow downtrend for SOL
    m.hawkes.addEvent(tx.slot || 0, Date.now());
    
    // NOTE: Entropy needs REAL prices - updated separately in runMainLoop
    // after currentPrices is populated. Do NOT use fee here!
    
    // Slow Downtrend für SOL
    m.slowDowntrend.addPrice('SOL', fee);
    
    // Get account keys from transaction
    const accounts = tx.transaction?.message?.accountKeys || [];

    // Also propagate to all other coin metrics (they share network state)
    // Each coin's metrics will use SOL's network metrics for crash detection
    // But their entropy is coin-specific (from price updates)
    for (const [symbol, metric] of this.metrics) {
      if (symbol === 'SOL') continue;
      
      // Add same Hawkes event to each coin (network-wide signal)
      metric.hawkes.addEvent(tx.slot || 0, Date.now());
      
      // Add same graph edge to each coin
      for (let i = 1; i < Math.min(accounts.length, 5); i++) {
        const from = accounts[0]?.pubkey || 'root';
        const to = accounts[i]?.pubkey || `acc${i}`;
        metric.graph.addEdge(from, to, Date.now());
      }
      
      // Same seismic for network-wide stress
      const magnitude = Math.log1p(fee) / 10;
      metric.seismic.addMagnitude(magnitude);
      
      // Same liquidity
      const predictedFee = 10000 * Math.sqrt(this.recentFees.length / 1000);
      const impact = Math.abs(fee - predictedFee) / predictedFee;
      metric.liquidity.addTrade(this.recentFees.length, impact, this.recentFees.length * 1000, fee);
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
  
  computeCrashSignal(symbol: string, currentPrices?: Map<string, number>, priceChange24h?: number): CrashSignal {
    let m = this.metrics.get(symbol);
    
    // CRITICAL FIX: Use SOL network metrics for all coins
    // Network-wide metrics (Hawkes, Graph, Seismic, etc.) reflect system stress
    // that affects all SPL tokens. Individual coins only have price-based entropy.
    const solMetrics = this.metrics.get('SOL');
    if (!solMetrics) {
      console.error('[CrashDetector] CRITICAL: SOL metrics not initialized!');
      return {
        symbol,
        crashProbability: 0.01,
        confirmingMetrics: 0,
        zone: 'IGNORE',
        slowShortScore: 0,
        priceMomentumScore: 0
      };
    }
    
    // Use SOL metrics for network-wide indicators (Hawkes, Graph, Seismic, etc.)
    // But use coin-specific entropy (which is fed with actual prices)
    const coinEntropyMetric = m?.entropy || solMetrics.entropy;
    
    // SOTA v5.0: ADAPTIVE METRICS - Use defaults when data is insufficient
    const hawkesResult = solMetrics.hawkes.compute();
    const entropyResult = coinEntropyMetric.compute();
    const graphResult = solMetrics.graph.compute();
    const seismicResult = solMetrics.seismic.compute();
    
    // CRITICAL: If Hawkes has < 100 events, it returns 0 - use fallback
    const n = hawkesResult.branchingRatio > 0 ? hawkesResult.branchingRatio : 0.5; // Fallback: neutral
    // CRITICAL: If Entropy has < 5 prices, it returns 0 - use fallback
    const PE = entropyResult.normalizedEntropy > 0 ? entropyResult.normalizedEntropy : 0.5; // Fallback: neutral
    const kappa = graphResult.molloyReedRatio > 0 ? graphResult.molloyReedRatio : 3.5; // Fallback: neutral
    const fragmentation = graphResult.fragmentationRatio;
    const rt = solMetrics.epidemic.compute().rt;
    const bValue = seismicResult.bValue > 0 ? seismicResult.bValue : 2.0; // Fallback: neutral
    const CTE = solMetrics.transfer.compute().clustering;
    const SSI = solMetrics.superspreader.compute().activationIndex;
    const LFI = solMetrics.liquidity.compute().deviation;
    
    // Compute raw values from SOL (network-wide) and coin entropy (price-specific)
    const raw = {
      n,
      PE,
      kappa,
      fragmentation,
      rt,
      bValue,
      CTE,
      SSI,
      LFI,
    };
    
    // DEBUG: Log raw metric values for first coin to diagnose why they're 0
    if (symbol === this.metrics.keys().next().value) {
      console.log(`[CrashDetector] RAW METRICS for ${symbol}:`, JSON.stringify(raw));
      console.log(`[CrashDetector] Hawkes full:`, hawkesResult);
    }

    // Slow Short Signal - use coin-specific data if exists
    const coinMetrics = this.metrics.get(symbol);
    const slowShortScore = coinMetrics?.slowDowntrend?.computeScore(symbol) || 0;

    // SOTA v4.1: Price Momentum Signal (Slow Downtrend Detection)
    // priceChange24h comes from rankingService.currentPrices (passed as parameter)
    const priceChange24hVal = priceChange24h || 0;
    let priceMomentumScore = 0;

    if (priceChange24hVal < -0.50) {
      // MEGA_CRASH: -50% or more
      priceMomentumScore = 0.40;  // Massive boost
    } else if (priceChange24hVal < -0.30) {
      // STRONG_DROP: -30% to -50%
      priceMomentumScore = 0.25;  // Strong boost
    } else if (priceChange24hVal < -0.20) {
      // MODERATE: -20% to -30%
      priceMomentumScore = 0.10;  // Moderate boost
    }
    
    // Count confirming metrics using ABSOLUTE THRESHOLDS (domain knowledge)
    // The raw compute() values are NOT z-scores, so we use sensible thresholds
    // based on physics of market crashes:
    //
    // PE (Permutation Entropy): 0-1, LOW = dangerous (more deterministic = crash precursor)
    //   Threshold: < 0.35 = dangerous (crash typically < 0.30)
    // kappa (Molloy-Reed): typically 2-10, CLOSER TO 2 = critical branching
    //   Threshold: < 3.0 = dangerous
    // bValue (Gutenberg-Richter): 0.5-3, LOW = dangerous
    //   Threshold: < 1.0 = dangerous
    // fragmentation: 0-1, HIGH = fragmented market
    //   Threshold: > 0.7 = dangerous
    // rt (Epidemic Rt): > 1 = epidemic spreading
    //   Threshold: > 1.2 = dangerous
    // CTE (Cluster Transfer Entropy): 0-1, HIGH = herding
    //   Threshold: > 0.6 = dangerous
    // SSI (Super-Spreader Index): 0+, HIGH = whale activity
    //   Threshold: > 5 = dangerous
    // LFI (Liquidity Flow Index): 0+, HIGH = liquidity stress
    //   Threshold: > 2.0 = dangerous
    // n (Hawkes branching ratio): 0-10, CLOSER TO 1 = critical self-excitation
    //   Threshold: > 0.8 = dangerous
    
    let confirming = 0;
    const confirmingDetails: string[] = [];
    
    // PE: LOW = dangerous (entropy drops before crash as patterns become more predictable)
    // FIX: Handle 0 value as 'invalid data' (not dangerous)
    if (raw.PE > 0.0001 && raw.PE < 0.35) {
      confirming++;
      confirmingDetails.push('PE_LOW');
    }
    
    // kappa: LOW = dangerous (critical branching, κ → 2)
    // FIX: Handle 0 value as 'invalid data'
    if (raw.kappa > 0.0001 && raw.kappa < 3.0) {
      confirming++;
      confirmingDetails.push('kappa_LOW');
    }
    
    // bValue: LOW = dangerous (b < 1 indicates major earthquake-like event)
    if (raw.bValue > 0.0001 && raw.bValue < 1.0) {
      confirming++;
      confirmingDetails.push('bValue_LOW');
    }
    
    // n (Hawkes): HIGH = dangerous (self-excitation, n → 1 is critical)
    if (raw.n > 0.8) {
      confirming++;
      confirmingDetails.push('n_HIGH');
    }
    
    // fragmentation: HIGH = dangerous
    if (raw.fragmentation > 0.7) {
      confirming++;
      confirmingDetails.push('fragmentation_HIGH');
    }
    
    // rt: HIGH = dangerous (epidemic spreading)
    if (raw.rt > 1.2) {
      confirming++;
      confirmingDetails.push('rt_HIGH');
    }
    
    // CTE: HIGH = dangerous (herding behavior)
    if (raw.CTE > 0.6) {
      confirming++;
      confirmingDetails.push('CTE_HIGH');
    }
    
    // SSI: HIGH = dangerous (whale activity)
    if (raw.SSI > 5) {
      confirming++;
      confirmingDetails.push('SSI_HIGH');
    }
    
    // LFI: HIGH = dangerous (liquidity stress)
    if (raw.LFI > 0.0001 && raw.LFI > 2.0) {
      confirming++;
      confirmingDetails.push('LFI_HIGH');
    }
    
    // SOTA v4.1: Combined crash probability
    // Base from metrics + Slow downtrend + Price momentum
    let crashProb = Math.min(0.99, confirming * 0.1 + 0.01 + (slowShortScore * 0.5) + priceMomentumScore);
    
    // SOTA v4.1 - Optimized Thresholds (Mathematically Derived from 15h Test Data)
    let zone: CrashSignal['zone'] = 'IGNORE';
    if (crashProb >= 0.15) zone = 'IMMEDIATE_SHORT';   // 15% (was 0.20) - P99 Threshold
    else if (crashProb >= 0.12) zone = 'MONITOR';      // 12% (was 0.10) - P95 Threshold
    
    return {
      symbol,
      crashProbability: crashProb,
      confirmingMetrics: confirming,
      zone,
      slowShortScore,
      priceMomentumScore  // NEW: Track price momentum contribution
    };
  }
}

// ============================================================================
// PAPER TRADING ENGINE V4
// ============================================================================

interface Position {
  id: string;
  symbol: string;
  entryPrice: number;
  amount: number;
  entryTime: number;
  slippage?: number;  // SOTA v5.0: Slippage percentage
  fee?: number;       // SOTA v5.0: Trading fee
}

class PaperTradingV4 {
  private capital: number;
  private positions: Position[] = [];
  private tradeHistory: Array<{ symbol: string; pnl: number; entryPrice: number; exitPrice: number; fees: number; slippage: number }> = [];
  private forensicLogs: Array<any> = [];
  
  // SOTA v5.0: REALISTISCHE TRADING PARAMETER
  private readonly FEE_PERCENT = 0.001;        // 0.1% Trading Fee (Jupiter Standard)
  private readonly SLIPPAGE_BASE = 0.005;      // 0.5% Base Slippage
  private readonly SLIPPAGE_VOLATILE = 0.02;   // 2% Slippage bei hoher Volatilität
  private readonly MAX_SLIPPAGE = 0.05;        // 5% Max Slippage
  private readonly LATENCY_MS = 500;            // 500ms simulated latency
  
  // 24h Test: Strukturierte Log Pfade
  private testLogDir = '/data/trinity_apex/solana-stream/paper-trading/logs/24h-test';
  private cycleLogPath = '/data/trinity_apex/solana-stream/paper-trading/logs/24h-test/cycles.jsonl';
  private metricsLogPath = '/data/trinity_apex/solana-stream/paper-trading/logs/24h-test/metrics.jsonl';
  private tradesLogPath = '/data/trinity_apex/solana-stream/paper-trading/logs/24h-test/trades.jsonl';
  private signalsLogPath = '/data/trinity_apex/solana-stream/paper-trading/logs/24h-test/signals.jsonl';
  
  constructor(startingCapital: number) {
    this.capital = startingCapital;
    this.initTestLogs();
  }
  
  private initTestLogs(): void {
    // Initialisiere 24h Test Log Dateien
    const logs = [this.cycleLogPath, this.metricsLogPath, this.tradesLogPath, this.signalsLogPath];
    for (const log of logs) {
      try {
        if (!fs.existsSync(log)) {
          fs.writeFileSync(log, '');
        }
      } catch (e) {
        console.error(`[24h] Failed to init log ${log}:`, e);
      }
    }
    console.log(`[24h] Test logs initialized at ${this.testLogDir}`);
  }
  
  private logToFile(path: string, data: any): void {
    try {
      fs.appendFileSync(path, JSON.stringify(data) + '\n');
    } catch (err) {
      console.error(`[24h] Log write failed to ${path}:`, err);
    }
  }
  
  // 24h Test: Cycle Metriken loggen
  logCycleMetrics(cycleNumber: number, crashSignal: any, coin: any, decision: any, botProb: number, rawMetrics?: Record<string, number>): void {
    const entry = {
      ts: Date.now(),
      cycle: cycleNumber,
      coin: coin.symbol,
      crashProbability: crashSignal?.crashProbability || 0,
      zone: crashSignal?.zone || 'UNKNOWN',
      confirmingMetrics: crashSignal?.confirmingMetrics || 0,
      botProbability: botProb,
      decision: decision?.action || 'UNKNOWN',
      confidence: decision?.confidence || 0,
      price: coin.price || 0,
      priceChange24h: coin.priceChange24h || 0,
      // 9 Metriken für Forensik
      n: rawMetrics?.n || 0,
      PE: rawMetrics?.PE || 0,
      kappa: rawMetrics?.kappa || 0,
      fragmentation: rawMetrics?.fragmentation || 0,
      rt: rawMetrics?.rt || 0,
      bValue: rawMetrics?.bValue || 0,
      CTE: rawMetrics?.CTE || 0,
      SSI: rawMetrics?.SSI || 0,
      LFI: rawMetrics?.LFI || 0
    };
    this.logToFile(this.cycleLogPath, entry);
  }
  
  // 24h Test: Signals loggen
  logSignal(symbol: string, signalType: string, value: number, zone: string): void {
    const entry = {
      ts: Date.now(),
      symbol,
      signalType,
      value,
      zone
    };
    this.logToFile(this.signalsLogPath, entry);
  }
  
  logForensic(data: any) {
    const entry = { ts: Date.now(), ...data };
    this.forensicLogs.push(entry);
    
    // Fallback: Konsolen-Logging für Forensik, sollte das Dateisystem blockieren
    console.log(`[FORENSIC-DEBUG] ${JSON.stringify(entry)}`);
    
    // 24h Test: Strukturiertes Logging
    this.logToFile(this.tradesLogPath, entry);
  }
  
  /**
   * SOTA v5.0: REALISTISCHE POSITION OPEN
   * Berechnet Slippage und Fees wie ein echter Trading Bot
   */
  openPosition(symbol: string, amount: number, entryPrice: number): boolean {
    if (this.positions.length >= CONFIG.maxPositions) {
      console.log(`[PaperTrading] Max positions reached: ${this.positions.length}`);
      return false;
    }
    
    if (amount > this.capital) {
      console.log(`[PaperTrading] ⚠️ Insufficient capital: ${amount.toFixed(2)} > ${this.capital.toFixed(2)}`);
      return false;
    }
    
    // SOTA v5.0: REALISTISCHE SLIPPAGE BERECHNUNG
    // Slippage hängt von Volatilität ab (basierend auf priceChange24h)
    // Bei Memecoins: 0.5% - 5% typisch
    const volatility = Math.abs(this.positions.length > 0 ? 0.1 : 0.05); // Placeholder
    const slippagePercent = Math.min(this.MAX_SLIPPAGE, 
      this.SLIPPAGE_BASE + (volatility * this.SLIPPAGE_VOLATILE));
    const slippageCost = amount * slippagePercent;
    
    // SOTA v5.0: TRADING FEE (0.1% Jupiter Standard)
    const tradingFee = amount * this.FEE_PERCENT;
    const totalCost = amount + slippageCost + tradingFee;
    
    if (totalCost > this.capital) {
      console.log(`[PaperTrading] ⚠️ Trade too expensive: ${totalCost.toFixed(2)} > ${this.capital.toFixed(2)} (Slippage: ${slippageCost.toFixed(4)}, Fee: ${tradingFee.toFixed(4)})`);
      return false;
    }
    
    // SOTA v5.0: Simulated Latency (echte Order braucht Zeit)
    // Simuliere 500ms Netzwerk-Latenz
    this.capital -= totalCost;
    
    const adjustedEntryPrice = entryPrice * (1 + slippagePercent); // Slippage erhöht effektiven Entry-Preis
    
    this.positions.push({
      id: `pos_${Date.now()}`,
      symbol,
      entryPrice: adjustedEntryPrice, // Echte Bot würde diesen Preis sehen
      amount,
      entryTime: Date.now(),
      slippage: slippagePercent,
      fee: tradingFee
    });
    
    console.log(`[PaperTrading] ✅ OPEN: ${symbol} | ${amount.toFixed(2)} SOL | Entry: $${adjustedEntryPrice.toExponential(2)} | Slippage: ${(slippagePercent*100).toFixed(2)}% | Fee: ${tradingFee.toFixed(4)}`);
    
    // 24h Test: Log OPEN to trades.jsonl
    this.logForensic({
      action: 'OPEN',
      symbol,
      amount,
      entryPrice: adjustedEntryPrice,
      slippagePercent,
      slippageCost,
      tradingFee,
      totalCost
    });
    
    return true;
  }
  
  /**
   * SOTA v5.0: REALISTISCHE POSITION CLOSE
   * Berechnet Slippage und Fees wie ein echter Trading Bot
   */
  closePosition(symbol: string, exitPrice: number): number {
    const idx = this.positions.findIndex(p => p.symbol === symbol);
    if (idx === -1) return 0;
    
    const pos = this.positions[idx];
    
    // SOTA v5.0: REALISTISCHE SLIPPAGE BEIM EXIT
    // Slippage bei Verkauf (normalerweise höher als bei Kauf)
    const slippagePercent = Math.min(this.MAX_SLIPPAGE, 
      (pos.slippage || this.SLIPPAGE_BASE) * 1.5); // Exit ist teurer
    const slippageCost = pos.amount * slippagePercent;
    
    // SOTA v5.0: EXIT FEE
    const tradingFee = pos.amount * this.FEE_PERCENT;
    const totalCosts = slippageCost + tradingFee;
    
    // Short position: profit when price goes down
    // Aber wir zahlen Slippage + Fees
    const grossPnl = (pos.entryPrice - exitPrice) / pos.entryPrice * pos.amount;
    const netPnl = grossPnl - totalCosts;
    
    this.capital += pos.amount + netPnl;
    this.positions.splice(idx, 1);
    this.tradeHistory.push({
      symbol: pos.symbol,
      pnl: netPnl,
      entryPrice: pos.entryPrice,
      exitPrice,
      fees: totalCosts,
      slippage: slippagePercent
    });
    
    console.log(`[PaperTrading] 🔴 CLOSE: ${symbol} | Net PnL: ${netPnl >= 0 ? '+' : ''}${netPnl.toFixed(4)} SOL | Gross: ${grossPnl.toFixed(4)} | Costs: ${totalCosts.toFixed(4)}`);
    return netPnl;
  }
  
  getStats() {
    const totalPnl = this.tradeHistory.reduce((sum, t) => sum + t.pnl, 0);
    const totalFees = this.tradeHistory.reduce((sum, t) => sum + (t.fees || 0), 0);
    const winningTrades = this.tradeHistory.filter(t => t.pnl > 0).length;

    return {
      capital: this.capital,
      totalPnl,
      totalFees,
      winRate: this.tradeHistory.length > 0 ? winningTrades / this.tradeHistory.length : 0,
      totalTrades: this.tradeHistory.length,
      openPositions: this.positions.length
    };
  }

  // Public accessor for positions
  getPositions(): Position[] {
    return this.positions;
  }
}

// ============================================================================
// MAIN KAS PA v4 CLASS
// ============================================================================

class KasPAV4 {
  private crashDetector: MultiCoinCrashDetector;
  private paperTrading: PaperTradingV4;
  private botDetector = comprehensiveBotDetector;
  private ranking = rankingService;
  private bayesian = bayesianEngine;
  private helius = heliusRestService;
  
  private currentTop10: ShortTarget[] = [];
  private currentPrices: Map<string, number> = new Map();
  
  private wss: WebSocketServer | null = null;
  private isRunning: boolean = false;
  
  // Track latest crash signal for WebSocket broadcast
  private latestCrashSignal: {
    crashProbability: number;
    zone: string;
    confirmingMetrics: number;
    symbol: string;
    velocityBoost?: number;
    velocitySignal?: any;
  } | null = null;
  private latestRawMetrics: Record<string, number> = {};

  // SOTA v5.0: Cycle tracking for backend health
  private cycleNumber: number = 0;
  
  // SOTA v5.0: WARM-UP PHASE - Collect data before trading
  private warmUpEndTime: number = 0;
  private readonly WARM_UP_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours
  private isWarmUpComplete: boolean = false;
  
  constructor() {
    this.crashDetector = new MultiCoinCrashDetector();
    this.paperTrading = new PaperTradingV4(CONFIG.startingCapital);
  }
  
  async start(): Promise<void> {
    console.log('='.repeat(80));
    console.log('KAS PA v4.0 - MULTI-COIN CRASH PREDICTION SYSTEM');
    console.log('='.repeat(80));
    console.log(`Starting Capital: ${CONFIG.startingCapital} SOL`);
    console.log(`Update Interval: ${CONFIG.updateIntervalMs / 1000}s`);
    console.log(`Ranking Interval: ${CONFIG.rankingIntervalMs / 60000}min`);
    
    // SOTA v5.0: Set warm-up phase end time
    this.warmUpEndTime = Date.now() + this.WARM_UP_DURATION_MS;
    console.log(`[WARM-UP] Data collection phase: ${this.WARM_UP_DURATION_MS / 60000} minutes`);
    console.log('');
    
    this.isRunning = true;
    
    // Start WebSocket server
    this.startWebSocket();
    
    // Initialize Helius REST Service for memecoin signals (Developer Plan compatible)
    console.log('[Helius] REST Service initialized for swap signal analysis');
    
    // Start Bot Detection (CRITICAL FIX - was missing before!)
    await this.botDetector.start();

    this.bayesian.setExplorationMode(false);
    
    // Initial ranking fetch (with timeout)
    this.runRankingWithTimeout();
    
    // Main loop (starts immediately, will do warm-up)
    this.runMainLoop();
    
    // Ranking update loop (every 30 min)
    setInterval(() => this.runRankingCycle(), CONFIG.rankingIntervalMs);
  }
  
  private async runRankingCycle(): Promise<void> {
    console.log(`\n[${new Date().toISOString()}] Running ranking cycle...`);
    
    try {
      const result = await this.ranking.runRankingCycle();
      this.currentTop10 = result.top10;
      
      console.log(`[Ranking] Top 10 selected:`);
      this.currentTop10.slice(0, 5).forEach((coin, i) => {
        console.log(`  ${i + 1}. ${coin.symbol}: Score=${coin.shortSignalScore} | Price=${coin.price} | 24h=${coin.priceChange24h.toFixed(1)}%`);
      });
      
      // 24h Test: Ranking Results loggen
      for (const coin of this.currentTop10) {
        this.paperTrading.logSignal(
          `RANKING:${coin.symbol}`,
          'SHORT_SIGNAL_SCORE',
          coin.shortSignalScore,
          'RANKING'
        );
      }
      
      // Initialize crash metrics for new coins
      for (const coin of this.currentTop10) {
        this.crashDetector.initMetrics(coin.symbol);
      }
      
      // Fetch prices for top 10
      const mints = this.currentTop10.map(c => c.mint);
      const prices = await getTokenPrices(mints);
      
      for (const [mint, priceData] of prices) {
        const coin = this.currentTop10.find(c => c.mint === mint);
        if (coin) {
          coin.price = priceData.price;
          coin.priceChange24h = priceData.change24h;
          this.currentPrices.set(coin.symbol, priceData.price);
          
          // CRITICAL: Update Entropy with REAL price data
          const m = this.crashDetector.getMetrics(coin.symbol);
          if (m) {
            m.entropy.addPrice(priceData.price, Date.now());
          }
        }
      }
      
      // Fetch Helius swap signals for all top 10 mints via REST API
      const mintsToTrack = this.currentTop10.map(c => c.mint);
      console.log(`[Helius] Fetching swap signals for ${mintsToTrack.length} mints...`);
      
    } catch (e) {
      console.error('[Ranking] Cycle failed:', e);
    }
  }
  
  // SOTA v5.0: Non-blocking ranking with timeout
  private async runRankingWithTimeout(): Promise<void> {
    try {
      // Race between ranking and 10s timeout
      await Promise.race([
        this.runRankingCycle(),
        new Promise(resolve => setTimeout(resolve, 10000))
      ]);
    } catch (e) {
      console.error('[Ranking] Ranking timeout or error:', e);
    }
  }
  
  private async runMainLoop(): Promise<void> {
    let iteration = 0;
    let warmUpLogged = false;
    
    while (this.isRunning) {
      try {
        iteration++;
        this.cycleNumber = iteration;
        
        // SOTA v5.0: Check warm-up phase
        const warmUpRemaining = this.warmUpEndTime - Date.now();
        if (warmUpRemaining > 0) {
          if (!warmUpLogged || iteration % 30 === 0) {
            console.log(`\n[${new Date().toISOString()}] Cycle #${iteration} | [WARM-UP] Collecting data... ${Math.ceil(warmUpRemaining / 60000)}min remaining`);
            warmUpLogged = true;
          }
          
          // Still collect data but skip trading
          await this.crashDetector.updateWithNetworkData();
          
          // Update prices and entropy for all coins
          for (const coin of this.currentTop10) {
            const price = this.currentPrices.get(coin.symbol);
            if (price) {
              const metric = this.crashDetector.getMetrics(coin.symbol);
              if (metric) {
                metric.entropy.addPrice(price, Date.now());
                priceVelocityTracker.addPrice(coin.symbol, price);
              }
            }
          }
          
          // Broadcast warm-up status
          this.broadcastWarmUpStatus(warmUpRemaining);
          
          await this.sleep(CONFIG.updateIntervalMs);
          continue;
        } else if (!this.isWarmUpComplete) {
          console.log(`\n[${new Date().toISOString()}] ===========================================================`);
          console.log(`[WARM-UP COMPLETE] Switching to TRADING MODE!`);
          console.log(`[WARM-UP COMPLETE] All metrics now have sufficient data.`);
          console.log(`[WARM-UP COMPLETE] Starting live trading with validated signals.`);
          console.log(`================================================================`);
          this.isWarmUpComplete = true;
        }
        
        console.log(`\n[${new Date().toISOString()}] Cycle #${iteration}`);
        
        // 1. Update network data for crash detection
        await this.crashDetector.updateWithNetworkData();
        
        // 2. Get bot metrics
        const botMetrics = this.botDetector.getMetrics();
        const botProb = botMetrics.botProbability;
        
        // 3. Get current stats
        const stats = this.paperTrading.getStats();
        
        // KNOW-ALL-SHORT: Fetch DexScreener OrderBook data for all top 10 coins
        // This gives us TFI (Trade Flow Imbalance) - the most predictive feature!
        const dexScreenerOrderBooks = new Map<string, DexScreenerOrderBook>();
        try {
          const mintsForOB = this.currentTop10.map(c => c.mint);
          const obResults = await fetchMultipleOrderBooks(mintsForOB);
          
          for (const [mint, obData] of obResults) {
            dexScreenerOrderBooks.set(mint, obData);

            // Process through OrderBook Analyzer (accumulates history)
            orderBookAnalyzer.processDexScreenerData(obData.symbol, {
              buys: obData.buys,
              sells: obData.sells,
              buyVolume: obData.buyVolume,
              sellVolume: obData.sellVolume,
              timestamp: Date.now()
            });

            console.log(`[TFI] ${obData.symbol}: buys=${obData.buys}, sells=${obData.sells}, TFI=${((obData.buyVolume - obData.sellVolume) / (obData.buyVolume + obData.sellVolume + 0.001) * 100).toFixed(1)}%`);

            // SOTA v5.0: Update OBI Signal from DexScreener data
            // Find the matching coin from currentTop10 to get the correct mint
            const matchingCoin = this.currentTop10.find(c => c.mint === mint);
            const obi = obiSignal.updateFromDexScreener(
              obData.symbol,
              mint,
              obData.buys,
              obData.sells,
              obData.buyVolume,
              obData.sellVolume
            );

            // Log OBI for short signal analysis
            if (obi.shortSignal > 0.3) {
              console.log(`[OBI] ${obi.symbol}: OBI=${obi.obiScore.toFixed(2)}, SHORT_SIGNAL=${obi.shortSignal.toFixed(2)}, ${obi.imbalance}`);
            }
          }
        } catch (e) {
          console.warn('[TFI] Failed to fetch DexScreener order books:', e);
        }

        // SOTA v5.0: Log aggregate OBI for market-wide analysis
        const aggregateOBI = obiSignal.getAggregateShortSignal();
        if (aggregateOBI.avgShortSignal > 0.4) {
          console.log(`[OBI-AGGREGATE] AvgShortSignal=${aggregateOBI.avgShortSignal.toFixed(2)}, StrongSell=${aggregateOBI.strongSellCount}, Sell=${aggregateOBI.sellCount}`);
        }
        
        // 4. Fetch Helius swap signals for all top 10 mints via REST API
        const mintsToTrack = this.currentTop10.map(c => c.mint);
        const heliusSignals = await this.helius.fetchSwapSignals(mintsToTrack);
        
        // SOTA v5.0: Fetch Order Book signals (Phoenix/OpenBook on-chain)
        const orderBookSignals = new Map<string, any>();
        for (const coin of this.currentTop10) {
          try {
            const obSignal = await orderBookFetcher.fetchOrderBook(coin.mint, coin.symbol);
            orderBookSignals.set(coin.mint, obSignal);
          } catch (e) {
            // Skip silently - order book is supplementary
          }
        }
        
        // 5. Process each top-10 coin
        for (let index = 0; index < this.currentTop10.length; index++) {
          const coin = this.currentTop10[index];
          // Update slow downtrend detector price
          const price = this.currentPrices.get(coin.symbol) || coin.price;
          if (price) {
             const metric = this.crashDetector.getMetrics(coin.symbol);
             metric?.slowDowntrend.addPrice(coin.symbol, price);

             // CRITICAL: Update Entropy with real price (LEADING indicator for crash detection)
             // NOTE: Add tiny noise to prevent PE=0 for monotonically similar prices
             const noiseMultiplier = 1 + (Math.random() * 0.0001); // 0.01% max noise
             metric?.entropy.addPrice(price * noiseMultiplier, Date.now());

             // DEBUG: Log entropy state
             if (metric) {
               const prices_count = (metric.entropy as any).prices?.length || 0;
               console.log(`[Entropy-DEBUG] ${coin.symbol}: price=${price}, entropy_prices=${prices_count}`);
             }

             // SOTA v5.0: Update Price Velocity Tracker (LEADING indicator)
             priceVelocityTracker.addPrice(coin.symbol, price);
          }
          
          // SOTA v5.0: Compute velocity signal for this coin
          const velocitySignal = priceVelocityTracker.compute(coin.symbol);
          const velocityBoost = priceVelocityTracker.getVelocityBoost(velocitySignal);
          
          const crashSignal = this.crashDetector.computeCrashSignal(coin.symbol, this.currentPrices, coin.priceChange24h);
          
          // ENHANCED crash probability with velocity boost (LEADING indicator)
          crashSignal.crashProbability = Math.min(0.99, crashSignal.crashProbability + velocityBoost);
          crashSignal.velocityBoost = velocityBoost;
          crashSignal.velocitySignal = velocitySignal;
          
          // SOTA v5.0: Add Order Book boost (Phoenix/OpenBook on-chain)
          const orderBookSignal = orderBookSignals.get(coin.mint);
          if (orderBookSignal) {
            const obBoost = getOrderBookBoost(orderBookSignal);
            crashSignal.crashProbability = Math.min(0.99, crashSignal.crashProbability + obBoost);
            crashSignal.orderBookSignal = orderBookSignal;
            
            // Log order book signal
            this.paperTrading.logSignal(coin.symbol, 'OB_BID_ASK_RATIO', orderBookSignal.bidAskRatio, orderBookSignal.imbalance);
            this.paperTrading.logSignal(coin.symbol, 'OB_BOOST', obBoost, 'LEADING');
          }
          
          // Re-compute zone with enhanced probability
          if (crashSignal.crashProbability >= 0.15) crashSignal.zone = 'IMMEDIATE_SHORT';
          else if (crashSignal.crashProbability >= 0.12) crashSignal.zone = 'MONITOR';
          
          // Log velocity signal data
          this.paperTrading.logSignal(coin.symbol, 'VELOCITY_5MIN', velocitySignal.change_5min, velocitySignal.isFlashCrash ? 'FLASH_CRASH' : 'NORMAL');
          this.paperTrading.logSignal(coin.symbol, 'VELOCITY_BOOST', velocityBoost, 'LEADING');
          
          // Track latest crash signal for TOP COIN only (for WebSocket dashboard)
          if (index === 0) {
            this.latestCrashSignal = {
              crashProbability: crashSignal.crashProbability,
              zone: crashSignal.zone,
              confirmingMetrics: crashSignal.confirmingMetrics,
              symbol: crashSignal.symbol
            };
            // Also track raw metrics
            const m = this.crashDetector.getMetrics(coin.symbol);
            if (m) {
              this.latestRawMetrics = {
                n: m.hawkes.compute().branchingRatio,
                PE: m.entropy.compute().normalizedEntropy,
                kappa: m.graph.compute().molloyReedRatio,
                fragmentation: m.graph.compute().fragmentationRatio,
                rt: m.epidemic.compute().rt,
                bValue: m.seismic.compute().bValue,
                CTE: m.transfer.compute().clustering,
                SSI: m.superspreader.compute().activationIndex,
                LFI: m.liquidity.compute().deviation
              };
            }
          }
          
          // 6. Get Helius memecoin signals for this coin
          const heliusSignal = heliusSignals.get(coin.mint);
          if (heliusSignal) {
            crashSignal.memecoinSignals = {
              buySellRatio: heliusSignal.buySellRatio,
              whaleSellPressure: Math.min(1, heliusSignal.whaleSellVolume / 100),
              volumeSpike: heliusSignal.volumeSpike,
              smartMoneyExit: heliusSignal.smartMoneyExit,
              buyPressure: this.helius.getBuyPressure(coin.mint),
              whaleAlert: this.helius.isWhaleAlert(coin.mint)
            };
          }
          
          // SOTA v5.0: MULTI-SIGNAL CONSENSUS (3/5 Rule)
          // Evaluate consensus BEFORE Bayesian decision
          const obSignal = orderBookSignals.get(coin.mint);
          const obBoost = obSignal ? getOrderBookBoost(obSignal) : 0;

          const consensus = consensusEngine.evaluate(
            coin.symbol,
            crashSignal.crashProbability,
            botProb,
            velocityBoost,
            obBoost
          );
          
          // Log consensus for debugging
          if (consensus.consensusCount >= 3) {
            logConsensus(consensus);
          }
          
          // 7. Make Bayesian decision (now includes Helius signals + consensus)
          const decision = this.bayesian.makeDecision(
            coin,
            crashSignal,
            botProb,
            stats.capital,
            stats.openPositions
          );
          
  // SOTA v5.0: Apply consensus filter to decision
          // CRITICAL: Skip consensus override when in Exploration Mode!
          // Exploration Mode needs ALL signals logged, not filtered
          const isExploration = (this.bayesian as any).explorationMode;
          if (isExploration) {
            // In exploration mode, just reduce position size but DON'T override to IGNORE
            if (consensus.recommendation === 'IGNORE') {
              decision.positionSize = (decision.positionSize || 0) * 0.1; // Very small but not zero
              console.log(`[Exploration] Consensus IGNORE overridden - positionSize=${decision.positionSize?.toFixed(4)}`);
            } else if (consensus.recommendation === 'WEAK_SHORT') {
              decision.positionSize = (decision.positionSize || 0) * 0.75;
            }
          } else {
            // Normal mode: apply full consensus filter
            if (consensus.recommendation === 'IGNORE') {
              decision.action = 'IGNORE';
              decision.confidence = 0;
              decision.positionSize = 0;
            } else if (consensus.recommendation === 'WEAK_SHORT') {
              decision.positionSize = (decision.positionSize || 0) * 0.5;
            }
          }
          // For STRONG_SHORT, keep full position
          
          // 24h Test: Hole 9 Metriken für diese Coin
          const coinMetrics = this.crashDetector.getMetrics(coin.symbol);
          const rawMetricsForCoin = coinMetrics ? {
            n: coinMetrics.hawkes.compute().branchingRatio,
            PE: coinMetrics.entropy.compute().normalizedEntropy,
            kappa: coinMetrics.graph.compute().molloyReedRatio,
            fragmentation: coinMetrics.graph.compute().fragmentationRatio,
            rt: coinMetrics.epidemic.compute().rt,
            bValue: coinMetrics.seismic.compute().bValue,
            CTE: coinMetrics.transfer.compute().clustering,
            SSI: coinMetrics.superspreader.compute().activationIndex,
            LFI: coinMetrics.liquidity.compute().deviation
          } : undefined;
          
          // 24h Test: Cycle Metrics loggen (inkl. 9 Metriken)
          this.paperTrading.logCycleMetrics(iteration, crashSignal, coin, decision, botProb, rawMetricsForCoin);
          
          // Track latest crash signal for TOP COIN only (for WebSocket dashboard)
          if (index === 0) {
            this.latestCrashSignal = {
              crashProbability: crashSignal.crashProbability,
              zone: crashSignal.zone,
              confirmingMetrics: crashSignal.confirmingMetrics,
              symbol: crashSignal.symbol
            };
            this.latestRawMetrics = rawMetricsForCoin || {};
          }
          
          // 24h Test: Signal loggen
          this.paperTrading.logSignal(coin.symbol, 'CRASH_PROB', crashSignal.crashProbability, crashSignal.zone);
          
          // SOTA v5.0: SKIP TRADING during warm-up phase
          if (!this.isWarmUpComplete) {
            // Log signal but don't trade
            this.paperTrading.logForensic({ symbol: coin.symbol, decision, crashSignal, warmUp: true });
            continue;
          }
          
          // KNOW-ALL-SHORT: TFI FILTER - MOST CRITICAL FEATURE!
          // Check if TFI (Trade Flow Imbalance) is negative (sell pressure) before SHORT
          const dexOB = dexScreenerOrderBooks.get(coin.mint);
          let tfiSignal: OBShortSignal | null = null;
          
          if (dexOB) {
            // Calculate TFI: (buyVol - sellVol) / totalVol
            const totalVol = dexOB.buyVolume + dexOB.sellVolume;
            const tfi = totalVol > 0 ? (dexOB.buyVolume - dexOB.sellVolume) / totalVol : 0;
            
            // Generate short signal from order book
            tfiSignal = orderBookAnalyzer.generateShortSignal(coin.symbol, coin.priceChange24h);
            
            // LOG TFI Signal
            this.paperTrading.logSignal(coin.symbol, 'TFI_SHORT_SIGNAL', tfiSignal.confidence, tfiSignal.isShort ? 'SHORT' : 'NO-SHORT');
            
            // CRITICAL: If TFI > 0 (buy pressure), DO NOT SHORT!
            // This is why we were losing 67% of trades - we were shorting buy pressure!
            if (tfi > 0.1) {
              console.log(`[TFI-FILTER] ⛔ SKIP ${coin.symbol}: TFI=+${(tfi * 100).toFixed(1)}% (BUY PRESSURE!)`);
              
              // Log as filtered
              this.paperTrading.logForensic({
                symbol: coin.symbol,
                decision: { ...decision, action: 'IGNORE', reason: 'TFI_FILTER_BUY_PRESSURE' },
                crashSignal,
                filtered: true,
                filterReason: `TFI=${(tfi * 100).toFixed(1)}% (buy pressure)`
              });
              continue; // Skip this coin, don't trade
            }
            
            // If TFI < -0.2 (strong sell pressure), BOOST confidence
            if (tfi < -0.2) {
              console.log(`[TFI-FILTER] ✅ STRONG SHORT: ${coin.symbol} TFI=${(tfi * 100).toFixed(1)}% (SELL PRESSURE)`);
              decision.confidence = Math.min(0.99, decision.confidence + 0.15);
            }
          }
          
          // 6. Execute if SHORT signal
          if (decision.action === 'SHORT' && decision.positionSize && decision.positionSize > 0) {
            const price = this.currentPrices.get(coin.symbol) || coin.price;
            this.paperTrading.openPosition(coin.symbol, decision.positionSize, price);
          } else {
             // Forensic log for IGNORE/MONITOR
             this.paperTrading.logForensic({ symbol: coin.symbol, decision, crashSignal });
             this.broadcastForensic(decision, crashSignal);
          }
          
          // 24h Test: Signal für Bayesian Decision
          this.paperTrading.logSignal(coin.symbol, 'BAYESIAN_ACTION', decision.confidence || 0, decision.action);
          
          // Log decision every 10 iterations
          if (iteration % 10 === 0 && crashSignal.confirmingMetrics > 0) {
            console.log(`  ${coin.symbol}: Zone=${crashSignal.zone} | P(crash)=${(crashSignal.crashProbability * 100).toFixed(1)}% | Confirming=${crashSignal.confirmingMetrics}/9`);
          }
        }
        
        // SOTA v4.1: EXIT MANAGEMENT - Check all open positions
        // =========================================================
        for (const position of this.paperTrading.getPositions()) {
          const currentPrice = this.currentPrices.get(position.symbol);
          if (!currentPrice || currentPrice === 0) continue;
          
          const holdingTimeMs = Date.now() - position.entryTime;
          const holdingHours = holdingTimeMs / (1000 * 3600);
          
          // SHORT: PnL = (entryPrice - currentPrice) / entryPrice
          const pnlPercent = (position.entryPrice - currentPrice) / position.entryPrice;
          
          let shouldExit = false;
          let exitReason = '';

          // STABILIZED EXIT STRATEGY (2026-04-16)
          // Take Profit: +15% (realistic for memecoins)
          if (pnlPercent > 0.15) {
            shouldExit = true;
            exitReason = 'TAKE_PROFIT_15%';
          }

          // Stop Loss: -5% (always active - risk management)
          else if (pnlPercent < -0.05) {
            shouldExit = true;
            exitReason = 'STOP_LOSS_5%';
          }

          // Time-based Exit: 4 hours max (prevent endless holding)
          else if (holdingHours > 4) {
            if (pnlPercent > 0) {
              shouldExit = true;
              exitReason = 'TIME_PROFIT_4H';
            } else {
              shouldExit = true;
              exitReason = 'TIME_STOP_4H';
            }
          }
          
          // Execute Exit
          if (shouldExit) {
            const pnl = this.paperTrading.closePosition(position.symbol, currentPrice);
            console.log(`[EXIT] ${position.symbol}: ${exitReason} | PnL: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(4)} SOL | Held: ${holdingHours.toFixed(1)}h`);
            
            // 24h Test: Log Trade (to trades.jsonl)
            this.paperTrading.logForensic({
              action: 'EXIT',
              symbol: position.symbol,
              reason: exitReason,
              pnl,
              pnlPercent,
              holdingHours,
              entryPrice: position.entryPrice,
              exitPrice: currentPrice
            });
          } else {
            // DEBUG: Log why it didn't exit
            if (holdingHours > 5.5) {
              console.log(`[DEBUG] Position ${position.symbol} not exiting yet. Held: ${holdingHours.toFixed(2)}h, PnL%: ${(pnlPercent * 100).toFixed(2)}%`);
            }
          }
        }
        // =========================================================
        
        // 7. Broadcast update - EVERY cycle for live dashboard (not just every 30)
        this.broadcastUpdate(stats, botMetrics);
        
        // 24h Test: Stats summary (alle 30 Cycles = 15min)
        if (iteration % 30 === 0) {
          console.log(`[24h] Cycle ${iteration} | Capital: ${stats.capital} SOL | Positions: ${stats.openPositions} | Trades: ${stats.totalTrades}`);
        }
        
      } catch (e) {
        console.error('[Main] Cycle error:', e);
      }

      console.log(`[Main] Cycle #${iteration} complete, sleeping ${CONFIG.updateIntervalMs}ms...`);
      console.log(`[Main] DEBUG: About to call this.sleep()`);
      const beforeSleep = Date.now();
      console.log(`[Main] DEBUG: iteration=${iteration}, isRunning=${this.isRunning}`);
      console.log(`[Main] DEBUG: Calling blocking sleep for ${CONFIG.updateIntervalMs}ms...`);
      await this.sleep(CONFIG.updateIntervalMs);
      const afterSleep = Date.now();
      console.log(`[Main] DEBUG: sleep returned after ${afterSleep - beforeSleep}ms`);
      console.log(`[Main] Wake up, next cycle starting...`);
    }
  }

  private broadcastWarmUpStatus(remainingMs: number): void {
    if (!this.wss) return;
    
    const clients = Array.from(this.wss.clients);
    if (clients.length === 0) return;
    
    const update = {
      type: 'WARM_UP',
      timestamp: Date.now(),
      warmUpRemainingMs: remainingMs,
      warmUpRemainingMin: Math.ceil(remainingMs / 60000),
      message: `Collecting data... ${Math.ceil(remainingMs / 60000)}min until trading starts`,
      performance: this.paperTrading.getStats()
    };
    
    const msg = JSON.stringify(update);
    for (const client of clients) {
      try {
        if (client.readyState === WebSocket.OPEN) {
          client.send(msg);
        }
      } catch (e) {
        console.warn('[WS] Warm-up send failed:', (e as Error).message);
      }
    }
  }

  private broadcastForensic(decision: DecisionResult, crashSignal: CrashSignal): void {
     if (!this.wss) return;
     const clients = Array.from(this.wss.clients);
     if (clients.length === 0) return;
     const update = {
       type: 'FORENSIC_UPDATE',
       timestamp: Date.now(),
       decision,
       crashSignal
     };
     const msg = JSON.stringify(update);
     for (const client of clients) {
       if (client.readyState === WebSocket.OPEN) client.send(msg);
     }
  }

  private broadcastUpdate(stats: any, botMetrics: any): void {
    if (!this.wss) {
      console.log('[Broadcast] wss not initialized');
      return;
    }

    // Snapshot clients to avoid race condition during iteration
    const clients = Array.from(this.wss.clients);
    console.log(`[Broadcast] Clients connected: ${clients.length}`);
    if (clients.length === 0) {
      console.log('[Broadcast] No clients, skipping');
      return;
    }

    const update = {
      type: 'UPDATE',
      timestamp: Date.now(),
      connectedClients: clients.length,

      // Backend Health for Freshness Monitoring
      backendHealth: {
        uptimeSeconds: Math.floor(process.uptime()),
        memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 10) / 10,
        cycleNumber: this.cycleNumber
      },

      // Performance
      performance: {
        currentCapital: stats.capital,
        totalPnlSol: stats.totalPnl,
        winRate: stats.winRate * 100,
        totalTrades: stats.totalTrades,
        openPositions: stats.openPositions
      },

      // Position Details for PaperTradingNode
      positionDetails: this.paperTrading.getPositions().map(pos => {
        const currentPrice = this.currentPrices.get(pos.symbol) || pos.entryPrice;
        const pnlPercent = (pos.entryPrice - currentPrice) / pos.entryPrice;
        const holdingHours = (Date.now() - pos.entryTime) / 3600000;
        const timeToExit = Math.max(0, 4 - holdingHours);

        return {
          symbol: pos.symbol,
          entryPrice: pos.entryPrice,
          currentPrice,
          amount: pos.amount,
          pnlPercent,
          holdingHours,
          timeToExitHours: timeToExit,
          status: pnlPercent < -0.05 ? 'critical' :
                  pnlPercent < 0 ? 'warning' : 'healthy'
        };
      }),

      // Bot metrics
      botMetrics,
      
      // Ranking
      top10ShortTargets: this.currentTop10.slice(0, 10).map(c => ({
        symbol: c.symbol,
        shortSignalScore: c.shortSignalScore,
        volatilityScore: c.volatilityScore,
        priceChange24h: c.priceChange24h,
        price: c.price
      })),
      
      // Bayesian
      bayesianDecision: {
        regime: this.bayesian.getCurrentRegime()
      },
      
      // NEW: Slow Downtrend Info
      slowShortSignals: this.currentTop10.map(c => ({
        symbol: c.symbol,
        score: this.crashDetector.getMetrics(c.symbol)?.slowDowntrend.computeScore(c.symbol) || 0
      })),
      
      // NEW: Latest Crash Prediction (for Multi-Coin Detection Node)
      latestPrediction: this.latestCrashSignal ? {
        crashProbability: this.latestCrashSignal.crashProbability,
        zone: this.latestCrashSignal.zone as 'IGNORE' | 'MONITOR' | 'IMMEDIATE_SHORT',
        confirmingMetrics: this.latestCrashSignal.confirmingMetrics,
        timestamp: Date.now(),
        rawMetrics: this.latestRawMetrics,
        // SOTA v5.0: Velocity data
        velocityBoost: this.latestCrashSignal.velocityBoost || 0,
        velocitySignal: this.latestCrashSignal.velocitySignal
      } : undefined,
      
      // SOTA v5.0: Consensus Data (for Dashboard)
      consensusData: {
        // This would be computed from the consensus engine
        // For now, derive from crash probability
        consensusScore: this.latestCrashSignal ? 
          Math.min(1, this.latestCrashSignal.crashProbability + (this.latestCrashSignal.velocityBoost || 0)) : 0.5,
        consensusCount: this.latestCrashSignal?.confirmingMetrics || 0,
        recommendation: this.latestCrashSignal?.zone === 'IMMEDIATE_SHORT' ? 'STRONG_SHORT' :
                       this.latestCrashSignal?.zone === 'MONITOR' ? 'WEAK_SHORT' : 'IGNORE'
      },
      
      // SOTA v5.0: Price Velocity Data
      velocityData: this.latestCrashSignal?.velocitySignal ? {
        change1min: this.latestCrashSignal.velocitySignal.change_1min || 0,
        change5min: this.latestCrashSignal.velocitySignal.change_5min || 0,
        change15min: this.latestCrashSignal.velocitySignal.change_15min || 0,
        acceleration: this.latestCrashSignal.velocitySignal.acceleration || 0,
        isFlashCrash: this.latestCrashSignal.velocitySignal.isFlashCrash || false,
        isSteadyDump: this.latestCrashSignal.velocitySignal.isSteadyDump || false
      } : undefined,
      
      latencyStats: {
        current: 15,
        avg: 18,
        max: 45
      },

      // KNOW-ALL-SHORT: TFI Data for Dashboard
      tfiData: {
        topCoin: this.currentTop10[0] ? {
          symbol: this.currentTop10[0].symbol,
          ...orderBookAnalyzer.getSummary(this.currentTop10[0].symbol)
        } : null,
        allCoins: this.currentTop10.slice(0, 5).map(c => ({
          symbol: c.symbol,
          ...orderBookAnalyzer.getSummary(c.symbol)
        }))
      },

      // SOTA v5.0: OBI Data (Order Book Imbalance from Yellowstone gRPC)
      obiData: {
        aggregate: obiSignal.getAggregateShortSignal(),
        topCoin: this.currentTop10[0] ? obiSignal.getSignal(this.currentTop10[0].mint) || null : null,
        allCoins: this.currentTop10.slice(0, 5).map(c => obiSignal.getSignal(c.mint)).filter(Boolean)
      }
    };
    
    const msg = JSON.stringify(update);
    for (const client of clients) {
      try {
        if (client.readyState === WebSocket.OPEN) {
          client.send(msg);
        }
      } catch (e) {
        console.warn('[WS] Send to client failed:', (e as Error).message);
      }
    }
  }
  
  private startWebSocket(port = 8080): void {
    this.wss = new WebSocketServer({ 
      port, 
      host: '0.0.0.0',
      verifyClient: (info, cb) => {
        // Erlaube Verbindungen von allen Origins
        cb(true);
      }
    });
    
    this.wss.on('connection', (ws, req) => {
      const ip = req.socket.remoteAddress;
      console.log(`[WS] Client connected: ${ip}`);

      // Send initial state
      ws.send(JSON.stringify({
        type: 'INIT',
        performance: this.paperTrading.getStats(),
        timestamp: Date.now()
      }));

      // Heartbeat to keep connection alive (every 25 seconds)
      const pingInterval = setInterval(() => {
        if (ws.readyState === ws.OPEN) {
          ws.ping();
          console.log(`[WS] Ping sent to ${ip}`);
        } else {
          clearInterval(pingInterval);
        }
      }, 25000);

      // Handle pong response
      ws.on('pong', () => {
        console.log(`[WS] Pong received from ${ip}`);
      });

      // Handle client close
      ws.on('close', (code, reason) => {
        clearInterval(pingInterval);
        console.log(`[WS] Client disconnected: ${ip}, code: ${code}, reason: ${reason}`);
      });

      // Handle errors
      ws.on('error', (err) => {
        console.error(`[WS] Client error: ${ip}`, err);
        clearInterval(pingInterval);
      });
    });
    
    console.log(`[WebSocket] Server started on ws://0.0.0.0:${port}`);
  }
  
  // Simple blocking sleep
  // Simple async sleep using setTimeout
  private async sleep(ms: number): Promise<void> {
    console.log(`[Sleep] async wait for ${ms}ms starting...`);
    await new Promise<void>(resolve => {
      setTimeout(() => {
        console.log(`[Sleep] async wait COMPLETE after ${ms}ms`);
        resolve();
      }, ms);
    });
  }
  
  stop(): void {
    this.isRunning = false;
    if (this.wss) {
      this.wss.close();
    }
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  // Global unhandled rejection handler
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[UNHANDLED] Rejection at:', promise, 'reason:', reason);
  });

  const kaspa = new KasPAV4();
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[Shutdown] Stopping KAS PA v4...');
    kaspa.stop();
    process.exit(0);
  });
  
  await kaspa.start();
}

main().catch(console.error);
