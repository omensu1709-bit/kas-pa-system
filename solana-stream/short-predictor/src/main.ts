/**
 * Short Predictor Main - Entry Point
 * 
 * Orchestrates all components:
 * - Data collection from DexScreener, Helius, Chainstack
 * - Signal calculation across 3 layers
 * - Consensus decision making
 * - Paper trading execution
 * - Dashboard updates via WebSocket
 */

import { WebSocketServer, WebSocket } from 'ws';
import * as fs from 'fs';
import * as path from 'path';

import { dexScreenerCollector } from './collectors/dexscreener-collector.js';
import { calculateMarketLayer, type MarketLayer } from './signals/layer1-market.js';
import { calculateOnChainLayer, fetchHeliusTransactions, type EnhancedTransaction } from './signals/layer2-onchain.js';
import { calculateNetworkLayer } from './signals/layer3-network.js';
import { makeDecision, logPrediction, type Prediction } from './signals/consensus-engine.js';
import { paperTradingEngine, type ShortTarget } from './signals/paper-trading-engine.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const PORT = 8080;
const UPDATE_INTERVAL_MS = 30000;  // 30 seconds
const RANKING_INTERVAL_MS = 1800000; // 30 minutes
const TOP_COINS_COUNT = 50;  // Maximum short candidates to track

// ============================================================================
// TYPES
// ============================================================================

interface CoinState {
  symbol: string;
  mint: string;
  price: number;
  priceChange24h: number;
  marketLayer?: MarketLayer;
  onChainTxs?: EnhancedTransaction[];
}

// ============================================================================
// STATE
// ============================================================================

let currentTopCoins: CoinState[] = [];
let wss: WebSocketServer | null = null;
let isRunning = false;

// Logs
const logDir = '/data/trinity_apex/solana-stream/short-predictor/logs';
const predictionsLogPath = path.join(logDir, 'predictions.jsonl');

// ============================================================================
// DATA COLLECTION
// ============================================================================

/**
 * Fetches and ranks top short candidates from DexScreener.
 */
async function fetchTopCoins(): Promise<CoinState[]> {
  console.log(`\n[${new Date().toISOString()}] Fetching top coins from DexScreener...`);
  
  try {
    // Get top short candidates from DexScreener
    const candidates = await dexScreenerCollector.getTopShortCandidates(TOP_COINS_COUNT);
    
    console.log(`[Ranking] Found ${candidates.length} candidates`);
    
    const coins: CoinState[] = candidates.map(token => ({
      symbol: token.symbol,
      mint: token.address,
      price: token.price,
      priceChange24h: token.priceChange24h
    }));
    
    // Log top 5
    coins.slice(0, 5).forEach((coin, i) => {
      console.log(`  ${i + 1}. ${coin.symbol}: $${coin.price.toFixed(6)} | 24h: ${coin.priceChange24h.toFixed(1)}%`);
    });
    
    return coins;
  } catch (error) {
    console.error('[Ranking] Error:', error);
    return [];
  }
}

/**
 * Updates DexScreener data for all tracked coins.
 */
async function updateDexScreenerData(coins: CoinState[]): Promise<void> {
  const mints = coins.map(c => c.mint);
  
  try {
    const data = await dexScreenerCollector.getTokenData(mints);
    
    // Update coin data
    for (const token of data) {
      const coin = coins.find(c => c.mint.toLowerCase() === token.address.toLowerCase());
      if (coin) {
        coin.price = token.price;
        coin.priceChange24h = token.priceChange24h;
      }
    }
  } catch (error) {
    console.error('[DexScreener] Update error:', error);
  }
}

// ============================================================================
// SIGNAL PROCESSING
// ============================================================================

/**
 * Processes all signals for a single coin.
 */
async function processCoinSignals(coin: CoinState): Promise<{
  marketLayer: MarketLayer;
  prediction: Prediction;
}> {
  // Get DexScreener pair data for market signals
  const dexData = {
    txns: {
      m5: { buys: 0, sells: 0 },  // Would be filled from actual DexScreener data
      h1: { buys: 0, sells: 0 }
    },
    volume: { m5: 0, h1: 0 },
    priceChange: { m5: coin.priceChange24h },
    liquidity: { usd: 10000 }  // Default
  };
  
  // Try to get enriched data from DexScreener
  try {
    const enriched = await dexScreenerCollector.getTokenData([coin.mint]);
    if (enriched.length > 0) {
      const token = enriched[0];
      // Parse txns from the token data if available
      // DexScreener doesn't give us real-time txn counts in this endpoint
    }
  } catch (e) {
    // Continue with default data
  }
  
  // Calculate Market Layer (Layer 1)
  const marketLayer = await calculateMarketLayer(dexData, coin.mint);
  
  // Get Helius transactions for on-chain analysis (Layer 2)
  const onChainTxs = await fetchHeliusTransactions(coin.mint, 20);
  
  // Calculate OnChain Layer
  const onChainLayer = await calculateOnChainLayer(coin.mint, onChainTxs);
  
  // Calculate Network Layer (Layer 3)
  const networkLayer = await calculateNetworkLayer(coin.mint);
  
  // Make decision
  const prediction = makeDecision(marketLayer, onChainLayer, networkLayer, coin.symbol, coin.price);
  
  // Store onChainTxs for later
  coin.onChainTxs = onChainTxs;
  
  // Log prediction
  logPrediction(prediction, coin.mint, coin.symbol, marketLayer, onChainLayer, networkLayer, coin.price);
  
  // Log to file
  const record = {
    timestamp: Date.now(),
    symbol: coin.symbol,
    mint: coin.mint,
    price: coin.price,
    action: prediction.action,
    confidence: prediction.confidence,
    consensus: prediction.consensus,
    expectedDrop: prediction.expectedDrop,
    timeframe: prediction.timeframe,
    layersAgreeing: prediction.layersAgreeing,
    reasons: prediction.reasons,
    marketScore: marketLayer.score,
    onChainScore: onChainLayer.score,
    networkScore: networkLayer.score
  };
  
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.appendFileSync(predictionsLogPath, JSON.stringify(record) + '\n');
  } catch (e) {
    // Silent fail for logging
  }
  
  return { marketLayer, prediction };
}

// ============================================================================
// PAPER TRADING
// ============================================================================

/**
 * Processes trading decisions.
 */
async function processTrading(coin: CoinState, prediction: Prediction): Promise<void> {
  if (prediction.action === 'SHORT' && prediction.positionSize > 0) {
    const target: ShortTarget = {
      symbol: coin.symbol,
      mint: coin.mint,
      price: coin.price,
      priceChange24h: coin.priceChange24h
    };
    
    await paperTradingEngine.openPosition(prediction, target);
  }
}

// ============================================================================
// WEBSOCKET SERVER
// ============================================================================

function startWebSocket(): void {
  wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });
  
  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`[WS] Client connected: ${ip}`);
    
    // Send initial state
    ws.send(JSON.stringify({
      type: 'INIT',
      timestamp: Date.now(),
      capital: paperTradingEngine.getStats().capital,
      openPositions: paperTradingEngine.getOpenPositions().length
    }));
  });
  
  console.log(`[WebSocket] Server started on ws://0.0.0.0:${PORT}`);
}

function broadcastUpdate(): void {
  if (!wss) return;
  
  const clients = Array.from(wss.clients);
  if (clients.length === 0) return;
  
  const stats = paperTradingEngine.getStats();
  const positions = paperTradingEngine.getOpenPositions();
  
  const topCoin = currentTopCoins[0];
  
  const update = {
    type: 'UPDATE',
    timestamp: Date.now(),
    
    // System health
    system: {
      uptime: process.uptime(),
      cycleCount: 0
    },
    
    // Top coin analysis
    topCoin: topCoin ? {
      symbol: topCoin.symbol,
      price: topCoin.price,
      marketLayer: topCoin.marketLayer ? {
        score: topCoin.marketLayer.score,
        signals: topCoin.marketLayer.signals
      } : null
    } : null,
    
    // Paper trading
    trading: {
      capital: stats.capital,
      openPositions: positions.length,
      totalTrades: stats.totalTrades,
      winRate: stats.winRate,
      positions: positions.map(p => ({
        symbol: p.symbol,
        entryPrice: p.entryPrice,
        currentPrice: p.currentPrice,
        pnlPercent: p.unrealizedPnLPercent,
        stopLoss: p.stopLoss,
        takeProfit: p.takeProfit
      }))
    }
  };
  
  const msg = JSON.stringify(update);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

// ============================================================================
// MAIN LOOPS
// ============================================================================

async function runMainLoop(): Promise<void> {
  let cycle = 0;
  
  while (isRunning) {
    cycle++;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${new Date().toISOString()}] CYCLE #${cycle}`);
    console.log('='.repeat(60));
    
    try {
      // 1. Update DexScreener data
      await updateDexScreenerData(currentTopCoins);
      
      // 2. Process signals for each coin
      for (const coin of currentTopCoins) {
        const { marketLayer, prediction } = await processCoinSignals(coin);
        coin.marketLayer = marketLayer;
        
        // 3. Execute trading
        await processTrading(coin, prediction);
      }
      
      // 4. Update positions with current prices
      const prices = new Map<string, number>();
      for (const coin of currentTopCoins) {
        prices.set(coin.mint, coin.price);
      }
      await paperTradingEngine.updatePositions(prices);
      
      // 5. Broadcast to dashboard
      broadcastUpdate();
      
      // 6. Print stats every 10 cycles
      if (cycle % 10 === 0) {
        console.log(paperTradingEngine.generateReport());
      }
      
    } catch (error) {
      console.error('[MainLoop] Error:', error);
    }
    
    await sleep(UPDATE_INTERVAL_MS);
  }
}

async function runRankingCycle(): Promise<void> {
  console.log(`\n[${new Date().toISOString()}] Running ranking cycle...`);
  
  try {
    const coins = await fetchTopCoins();
    currentTopCoins = coins;
    
    console.log(`[Ranking] Tracking ${coins.length} coins`);
  } catch (error) {
    console.error('[Ranking] Error:', error);
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('ULTIMATE SPL SHORT PREDICTION & PAPER TRADING SYSTEM');
  console.log('='.repeat(60));
  console.log(`Starting at ${new Date().toISOString()}`);
  console.log(`Update interval: ${UPDATE_INTERVAL_MS / 1000}s`);
  console.log(`Ranking interval: ${RANKING_INTERVAL_MS / 60000}min`);
  console.log('');
  
  // Initialize logs directory
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  // Start WebSocket server
  startWebSocket();
  
  // Initial ranking
  await runRankingCycle();
  
  // Start main loop
  isRunning = true;
  runMainLoop();
  
  // Ranking updates
  setInterval(() => {
    if (!isRunning) return;
    runRankingCycle();
  }, RANKING_INTERVAL_MS);
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[Shutdown] Stopping...');
    isRunning = false;
    
    if (wss) {
      wss.close();
    }
    
    // Final report
    console.log(paperTradingEngine.generateReport());
    
    process.exit(0);
  });
}

main().catch(console.error);