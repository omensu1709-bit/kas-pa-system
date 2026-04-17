/**
 * HELIUS ENHANCED WEBSOCKET SERVICE
 * 
 * Extracts real-time memecoin signals from Helius Enhanced WebSockets:
 * - Buy/Sell Ratio for Top-10 coins
 * - Whale Sell Detection (>10 SOL swaps)
 * - Volume Spike Detection
 * - Smart Money Flow tracking
 */

import { WebSocket } from 'ws';

const HELIUS_WSS = 'wss://mainnet.helius-rpc.com/?api-key=';
const HELIUS_KEY = 'bdbceecb-7fca-4dcb-856d-a5e8c5cc38e9';

export interface MemecoinSignal {
  mint: string;
  buyVolume: number;           // Total SOL volume buying this coin
  sellVolume: number;           // Total SOL volume selling this coin
  buyCount: number;             // Number of buy transactions
  sellCount: number;           // Number of sell transactions
  buySellRatio: number;        // >1.0 = more buys (bullish), <1.0 = more sells (bearish)
  whaleSellCount: number;      // Number of whale sells (>10 SOL)
  whaleSellVolume: number;     // Total whale sell volume
  volumeSpike: number;         // Ratio vs 24h average
  smartMoneyExit: boolean;     // Whales selling into volume spike
  lastUpdate: number;
  recentSwaps: SwapData[];      // Last 20 swaps for latency analysis
}

interface SwapData {
  timestamp: number;
  isBuy: boolean;
  solAmount: number;
  isWhale: boolean;
}

// DEX program addresses for filtering
const DEX_PROGRAMS = [
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',    // Jupiter
  'RaydiumGxxx43M63Yr7XAAPKbu3vZ3r3dZ7m9KrGq8x',     // Raydium (placeholder)
  'whirLbMiicVdio4qvUfM5tAgXSfY9CYRp9T7k2kH7Qd',     // Orca (placeholder)
];

export class HeliusWebSocketService {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private signals: Map<string, MemecoinSignal> = new Map();
  private subscribedMints: Set<string> = new Set();
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT = 5;
  private readonly RECONNECT_DELAY = 5000;
  
  constructor() {
    // Initialize default signals for SOL
    this.initSignal('Solana');
  }
  
  private initSignal(mint: string): MemecoinSignal {
    return {
      mint,
      buyVolume: 0,
      sellVolume: 0,
      buyCount: 0,
      sellCount: 0,
      buySellRatio: 1.0,
      whaleSellCount: 0,
      whaleSellVolume: 0,
      volumeSpike: 1.0,
      smartMoneyExit: false,
      lastUpdate: Date.now(),
      recentSwaps: []
    };
  }
  
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[HeliusWS] Already connected');
      return;
    }
    
    const url = HELIUS_WSS + HELIUS_KEY;
    console.log('[HeliusWS] Connecting to Enhanced WebSocket...');
    
    this.ws = new WebSocket(url);
    
    this.ws.on('open', () => {
      console.log('[HeliusWS] Connected to Helius Enhanced WebSocket');
      this.reconnectAttempts = 0;
      this.startPing();
      this.subscribeToMints();
    });
    
    this.ws.on('message', (data) => this.handleMessage(data));
    
    this.ws.on('close', () => {
      console.log('[HeliusWS] Disconnected, scheduling reconnect...');
      this.stopPing();
      this.scheduleReconnect();
    });
    
    this.ws.on('error', (err) => {
      console.error('[HeliusWS] Error:', err.message);
    });
  }
  
  private startPing(): void {
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000);
  }
  
  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
  
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.MAX_RECONNECT) {
      console.error('[HeliusWS] Max reconnect attempts reached');
      return;
    }
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      console.log(`[HeliusWS] Reconnect attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT}`);
      this.connect();
    }, this.RECONNECT_DELAY);
  }
  
  subscribeToMints(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[HeliusWS] Cannot subscribe - not connected');
      return;
    }
    
    // Subscribe to Jupiter swaps (we can filter by token transfers later)
    // This catches ALL Jupiter swaps, we filter for our target mints
    const subscribeMsg = {
      jsonrpc: '2.0',
      id: 1,
      method: 'transactionSubscribe',
      params: [{
        vote: false,
        failed: false,
        accountInclude: ['JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4']
      }]
    };
    
    this.ws.send(JSON.stringify(subscribeMsg));
    console.log('[HeliusWS] Subscribed to Jupiter swaps');
  }
  
  private handleMessage(data: any): void {
    try {
      const msg = JSON.parse(data.toString());
      
      if (msg.method === 'transactionNotification') {
        const tx = msg.params.result;
        this.processSwapTransaction(tx);
      }
    } catch (e) {
      // Ignore parse errors for non-JSON messages
    }
  }
  
  private processSwapTransaction(tx: any): void {
    if (!tx || tx.type !== 'SWAP') return;
    
    const tokenTransfers = tx.tokenTransfers || [];
    const nativeTransfers = tx.nativeTransfers || [];
    
    // Extract SOL amounts from native transfers
    let totalSolIn = 0;
    let totalSolOut = 0;
    
    for (const transfer of nativeTransfers) {
      const amount = Math.abs(transfer.amount || 0) / 1e9; // Convert to SOL
      if (transfer.toUserAccount.includes('Pool') || transfer.toUserAccount.includes('Raydium')) {
        totalSolOut += amount;
      } else if (transfer.fromUserAccount.includes('Pool') || transfer.fromUserAccount.includes('Raydium')) {
        totalSolIn += amount;
      }
    }
    
    // Find which memecoin mints are involved
    const involvedMints: string[] = [];
    for (const transfer of tokenTransfers) {
      const mint = transfer.mint;
      // Skip SOL and USDC/USDT
      if (!mint || mint === 'So11111111111111111111111111111111111111112') continue;
      if (mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') continue;
      if (mint === 'Es9vMFrzaCERmZfrTsinGc2SXfkgK9yZBuK3c9T8BQxB') continue;
      
      involvedMints.push(mint);
    }
    
    // If we have subscribed mints that are involved, update their signals
    for (const mint of involvedMints) {
      if (!this.subscribedMints.has(mint) && this.subscribedMints.size > 0) {
        // Only track if we have subscribed mints; otherwise track all
        if (this.subscribedMints.size > 0) continue;
      }
      
      let signal = this.signals.get(mint);
      if (!signal) {
        signal = this.initSignal(mint);
        this.signals.set(mint, signal);
      }
      
      const isBuy = totalSolIn > totalSolOut;
      const solVolume = isBuy ? totalSolIn : totalSolOut;
      const isWhale = solVolume >= 10; // >10 SOL
      
      // Update volumes
      if (isBuy) {
        signal.buyVolume += totalSolIn;
        signal.buyCount++;
      } else {
        signal.sellVolume += totalSolOut;
        signal.sellCount++;
      }
      
      // Update whale metrics
      if (isWhale && !isBuy) {
        signal.whaleSellCount++;
        signal.whaleSellVolume += solVolume;
      }
      
      // Add to recent swaps for latency analysis
      signal.recentSwaps.push({
        timestamp: tx.timestamp * 1000,
        isBuy,
        solAmount: solVolume,
        isWhale
      });
      
      // Keep only last 20 swaps
      if (signal.recentSwaps.length > 20) {
        signal.recentSwaps.shift();
      }
      
      // Recalculate ratio
      signal.buySellRatio = signal.sellVolume > 0 
        ? signal.buyVolume / signal.sellVolume 
        : 1.0;
      
      // Smart money exit: whales selling during volume spike
      if (isWhale && !isBuy && signal.volumeSpike > 2.0) {
        signal.smartMoneyExit = true;
      }
      
      signal.lastUpdate = Date.now();
    }
  }
  
  setSubscribedMints(mints: string[]): void {
    this.subscribedMints.clear();
    for (const mint of mints) {
      this.subscribedMints.add(mint);
      if (!this.signals.has(mint)) {
        this.signals.set(mint, this.initSignal(mint));
      }
    }
    console.log(`[HeliusWS] Tracking ${mints.length} mints`);
  }
  
  getSignal(mint: string): MemecoinSignal | null {
    return this.signals.get(mint) || null;
  }
  
  getAllSignals(): Map<string, MemecoinSignal> {
    return this.signals;
  }
  
  computeVolumeSpike(mint: string, avg24hVolume: number): number {
    const signal = this.signals.get(mint);
    if (!signal || avg24hVolume <= 0) return 1.0;
    
    // Calculate recent volume (last 5 minutes)
    const now = Date.now();
    const recentVolume = signal.recentSwaps
      .filter(s => now - s.timestamp < 5 * 60 * 1000)
      .reduce((sum, s) => sum + s.solAmount, 0);
    
    // Annualize to 24h equivalent
    const projected24h = recentVolume * (24 * 60 / 5);
    return projected24h / avg24hVolume;
  }
  
  getBuyPressure(mint: string): number {
    const signal = this.signals.get(mint);
    if (!signal) return 0.5;
    
    const total = signal.buyVolume + signal.sellVolume;
    if (total === 0) return 0.5;
    
    return signal.buyVolume / total;
  }
  
  isWhaleAlert(mint: string): boolean {
    const signal = this.signals.get(mint);
    if (!signal) return false;
    
    // Alert if whales sold >50 SOL in last hour
    const now = Date.now();
    const recentWhaleSell = signal.recentSwaps
      .filter(s => now - s.timestamp < 60 * 60 * 1000 && !s.isBuy && s.isWhale)
      .reduce((sum, s) => sum + s.solAmount, 0);
    
    return recentWhaleSell > 50;
  }
  
  getTopBearishSignal(): { mint: string; score: number } | null {
    let worst: { mint: string; score: number } | null = null;
    
    for (const [mint, signal] of this.signals) {
      // Skip if no recent activity
      if (Date.now() - signal.lastUpdate > 5 * 60 * 1000) continue;
      
      // Calculate bearish score: low buy ratio + whale activity
      const whaleScore = signal.whaleSellVolume / 100; // Normalized
      const ratioScore = 1 - Math.min(1, signal.buySellRatio); // 0 = bullish, 1 = bearish
      
      const totalScore = ratioScore * 0.6 + whaleScore * 0.4;
      
      if (!worst || totalScore > worst.score) {
        worst = { mint, score: totalScore };
      }
    }
    
    return worst;
  }
  
  disconnect(): void {
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscribedMints.clear();
    console.log('[HeliusWS] Disconnected');
  }
  
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
export const heliusWsService = new HeliusWebSocketService();