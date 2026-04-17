/**
 * HELIUS REST API SERVICE (Developer Plan Compatible)
 * 
 * Fetches memecoin signals via Helius Enhanced Transactions API:
 * - Buy/Sell Ratio from recent swap transactions
 * - Whale Sell Detection (>10 SOL swaps)
 * - Volume analysis
 * 
 * Note: This is a REST-based alternative to WebSockets that works
 * with the Developer plan. Data is fetched on-demand rather than
 * streamed in real-time.
 */

import axios from 'axios';

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=bdbceecb-7fca-4dcb-856d-a5e8c5cc38e9';
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
  recentSwaps: SwapData[];      // Last 20 swaps for analysis
}

interface SwapData {
  timestamp: number;
  isBuy: boolean;
  solAmount: number;
  isWhale: boolean;
}

export class HeliusRestService {
  private signals: Map<string, MemecoinSignal> = new Map();
  private recentSignatures: Map<string, string[]> = new Map(); // mint -> signature[]
  private readonly LOOKBACK_SLOTS = 10000; // ~1 minute of blocks
  private readonly WHALE_THRESHOLD_SOL = 10;
  
  constructor() {}
  
  /**
   * Fetch recent transactions for a list of mints and extract swap signals
   */
  async fetchSwapSignals(mints: string[]): Promise<Map<string, MemecoinSignal>> {
    const results = new Map<string, MemecoinSignal>();

    // Add timeout wrapper - resolve with empty results on timeout
    const timeoutMs = 20000; // 20 second timeout per mint batch
    return new Promise(async (resolve) => {
      // Timeout handler
      const timeoutHandle = setTimeout(() => {
        console.warn('[HeliusRest] fetchSwapSignals TIMEOUT, returning empty results');
        resolve(results);
      }, timeoutMs);

      try {
        // Fetch in parallel for all mints
        const promises = mints.map(mint => this.fetchSignalsForMint(mint));
        const signalArrays = await Promise.allSettled(promises);

        for (let i = 0; i < mints.length; i++) {
          const mint = mints[i];
          const result = signalArrays[i];

          if (result.status === 'fulfilled' && result.value) {
            results.set(mint, result.value);
            this.signals.set(mint, result.value);
          } else {
            // Return existing signal or empty signal
            results.set(mint, this.signals.get(mint) || this.createEmptySignal(mint));
          }
        }

        clearTimeout(timeoutHandle);
        resolve(results);
      } catch (err) {
        clearTimeout(timeoutHandle);
        console.error('[HeliusRest] fetchSwapSignals error:', err);
        resolve(results);
      }
    });
  }
  
  /**
   * Fetch signals for a single mint
   */
  private async fetchSignalsForMint(mint: string): Promise<MemecoinSignal | null> {
    try {
      // Get recent signatures involving this mint using Helius RPC
      const sigs = await this.getSignaturesForMint(mint);
      if (!sigs || sigs.length === 0) {
        return this.createEmptySignal(mint);
      }
      
      // Store for next cycle
      this.recentSignatures.set(mint, sigs);
      
      // Fetch first few transactions to analyze
      const txs = await this.getTransactions(sigs.slice(0, 20));
      
      return this.analyzeTransactions(mint, txs);
    } catch (e) {
      console.error(`[HeliusRest] Error fetching signals for ${mint}:`, e);
      return this.signals.get(mint) || this.createEmptySignal(mint);
    }
  }
  
  /**
   * Get signatures for a mint using Helius RPC
   */
  private async getSignaturesForMint(mint: string): Promise<string[]> {
    try {
      const response = await axios.post(HELIUS_RPC, {
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [mint, { limit: 50 }]
      }, { timeout: 10000 });
      
      const sigs = response.data.result || [];
      return sigs.map((s: any) => s.signature);
    } catch (e) {
      console.error('[HeliusRest] getSignaturesForMint error:', e);
      return [];
    }
  }
  
  /**
   * Parse transactions using Helius Enhanced API to get SWAP type
   */
  private async getTransactions(signatures: string[]): Promise<any[]> {
    if (signatures.length === 0) return [];

    try {
      // First try: Use Helius Enhanced Transactions API
      // This gives us the 'type' field which tells us if it's a SWAP
      const enhancedTxs = await this.getEnhancedTransactions(signatures.slice(0, 10));
      if (enhancedTxs.length > 0) {
        return enhancedTxs;
      }

      // Fallback: Use standard RPC and infer from tokenTransfers
      // Each transaction has 8 second timeout
      const txPromises = signatures.slice(0, 5).map(sig => {
        const timeoutPromise = new Promise<null>((_, reject) => {
          setTimeout(() => reject(new Error('TX timeout')), 8000);
        });
        const txPromise = axios.post(HELIUS_RPC, {
          jsonrpc: '2.0',
          id: 1,
          method: 'getTransaction',
          params: [sig, {
            encoding: 'jsonParsed',
            maxSupportedTransactionVersion: 0,
            transactionDetails: 'full'
          }]
        }, { timeout: 8000 }).then(r => r.data.result).catch(() => null);

        return Promise.race([txPromise, timeoutPromise]).catch(() => null);
      });

      const txs = await Promise.all(txPromises);

      // Add inferred type based on presence of tokenTransfers
      return txs
        .filter(Boolean)
        .map(tx => ({
          ...tx,
          // If it has tokenTransfers, treat as SWAP
          type: (tx.tokenTransfers && tx.tokenTransfers.length > 0) ? 'SWAP' : tx.type
        }));
    } catch (e) {
      console.error('[HeliusRest] getTransactions error:', e);
      return [];
    }
  }

  /**
   * Get enhanced transactions using Helius dedicated endpoint
   * This provides the 'type' field (SWAP, CREATE, etc.)
   */
  private async getEnhancedTransactions(signatures: string[]): Promise<any[]> {
    try {
      // Helius enhanced transactions endpoint - with proper timeout
      const response = await axios.post(
        `https://api.helius.xyz/v0/transactions?api-key=${HELIUS_KEY}`,
        {
          transactions: signatures
        },
        { timeout: 10000 }
      );

      return response.data?.transactions || [];
    } catch (e: any) {
      // Silent fail - fallback to standard RPC
      if (e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT' || e.code === 'ABORTED') {
        console.warn('[HeliusRest] Enhanced API timeout, using fallback RPC');
      }
      return [];
    }
  }
  
  /**
   * Analyze transactions to extract buy/sell signals
   * Enhanced to detect SWAPs even without type field
   */
  private analyzeTransactions(mint: string, txs: any[]): MemecoinSignal {
    const signal = this.createEmptySignal(mint);

    for (const tx of txs) {
      if (!tx) continue;

      // Skip if explicitly not a SWAP
      if (tx.type && tx.type !== 'SWAP') continue;

      // Analyze token transfers for this mint
      const tokenTransfers = tx.tokenTransfers || [];
      const nativeTransfers = tx.nativeTransfers || [];

      // Find transfers involving this mint
      const relevantTransfers = tokenTransfers.filter((t: any) => t.mint === mint);

      // If no relevant transfers but has tokenTransfers, this is likely a SWAP for a different mint
      // But we still process it if the transfer is for our mint
      if (relevantTransfers.length === 0) {
        // Check if any transfer mentions this mint anywhere
        const hasRelevantData = tokenTransfers.some((t: any) =>
          t.mint === mint ||
          t.tokenAccount === mint
        );
        if (!hasRelevantData && tokenTransfers.length > 0) continue;
      }

      // Calculate SOL flow direction using nativeTransfers
      let solIn = 0;
      let solOut = 0;

      for (const transfer of nativeTransfers) {
        const amount = Math.abs(transfer.amount || 0) / 1e9; // Convert to SOL
        const toAccount = transfer.toUserAccount || '';
        const fromAccount = transfer.fromUserAccount || '';

        // Check if going to/from a DEX pool
        // These are common DEX pool addresses on Solana
        const isToDex = toAccount.includes('Raydium') ||
                        toAccount.includes('Jupiter') ||
                        toAccount.includes('Orca') ||
                        toAccount.includes('Phoenix') ||
                        toAccount.includes('OpenBook') ||
                        toAccount.length === 44; // Most pool accounts are 44+ chars

        const isFromDex = fromAccount.includes('Raydium') ||
                          fromAccount.includes('Jupiter') ||
                          fromAccount.includes('Orca') ||
                          fromAccount.includes('Phoenix') ||
                          fromAccount.includes('OpenBook') ||
                          fromAccount.length === 44;

        if (isToDex) {
          solOut += amount; // SOL going out to DEX = user bought
        }
        if (isFromDex) {
          solIn += amount; // SOL coming in from DEX = user sold
        }
      }

      // If no nativeTransfers, try to infer from account keys
      if (nativeTransfers.length === 0 && tokenTransfers.length > 0) {
        // Use fee and compute to estimate - not ideal but better than nothing
        const fee = (tx.meta?.fee || 5000) / 1e9;
        if (fee > 0.001) {
          // Small transaction, might be a swap
          solIn = fee;
          solOut = fee;
        }
      }

      // Determine if buy or sell based on SOL flow
      // Buy: SOL flows TO DEX (user gives SOL, gets tokens)
      // Sell: SOL flows FROM DEX (user gives tokens, gets SOL)
      const isBuy = solOut > solIn;
      const volume = isBuy ? solOut : solIn;
      const isWhale = volume >= this.WHALE_THRESHOLD_SOL;

      if (volume > 0.001) { // Minimum 0.001 SOL threshold
        if (isBuy) {
          signal.buyVolume += solOut;
          signal.buyCount++;
        } else {
          signal.sellVolume += solIn;
          signal.sellCount++;
        }

        if (isWhale && !isBuy) {
          signal.whaleSellCount++;
          signal.whaleSellVolume += volume;
        }

        signal.recentSwaps.push({
          timestamp: (tx.timestamp || tx.blockTime || Date.now() / 1000) * 1000,
          isBuy,
          solAmount: volume,
          isWhale
        });

        // Keep only last 20 swaps
        if (signal.recentSwaps.length > 20) {
          signal.recentSwaps.shift();
        }
      }
    }

    // Calculate ratios
    signal.buySellRatio = signal.sellVolume > 0
      ? signal.buyVolume / signal.sellVolume
      : signal.buyCount > 0 ? 1.5 : 1.0;

    signal.lastUpdate = Date.now();

    // Smart money exit detection
    if (signal.whaleSellCount > 3 && signal.volumeSpike > 2.0) {
      signal.smartMoneyExit = true;
    }

    return signal;
  }
  
  private createEmptySignal(mint: string): MemecoinSignal {
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
  
  getSignal(mint: string): MemecoinSignal | null {
    return this.signals.get(mint) || null;
  }
  
  getAllSignals(): Map<string, MemecoinSignal> {
    return this.signals;
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
    
    // Alert if whales sold >50 SOL in recent swaps
    const recentWhaleSell = signal.recentSwaps
      .filter(s => !s.isBuy && s.isWhale)
      .reduce((sum, s) => sum + s.solAmount, 0);
    
    return recentWhaleSell > 50;
  }
  
  getTopBearishSignal(): { mint: string; score: number } | null {
    let worst: { mint: string; score: number } | null = null;
    
    for (const [mint, signal] of this.signals) {
      if (Date.now() - signal.lastUpdate > 5 * 60 * 1000) continue;
      
      const whaleScore = signal.whaleSellVolume / 100;
      const ratioScore = 1 - Math.min(1, signal.buySellRatio);
      
      const totalScore = ratioScore * 0.6 + whaleScore * 0.4;
      
      if (!worst || totalScore > worst.score) {
        worst = { mint, score: totalScore };
      }
    }
    
    return worst;
  }
}

// Singleton instance
export const heliusRestService = new HeliusRestService();