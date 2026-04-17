/**
 * gRPC Bridge - Helius LaserStream & Chainstack gRPC Integration
 * Verbindet Solana gRPC Streams mit Node.js für Echtzeit-SPL-Analyse
 */

import {
  Connection,
  PublicKey,
  TransactionResponse,
  ParsedTransactionWithMeta,
  ConfirmedSignatureInfo,
} from '@solana/web3.js';
import { TokenAmount } from '@solana/web3.js';
import {Duplex, PassThrough} from 'stream';
import EventEmitter from 'events';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface SPLTokenTransfer {
  signature: string;
  slot: number;
  timestamp: number;
  source: string;
  destination: string;
  mint: string;
  amount: bigint;
  decimals: number;
  uiAmount: number;
  walletAge: number;
  isWrappedSOL: boolean;
  programId: string;
}

export interface TokenMetadata {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  price?: number;
  volume24h?: number;
  marketCap?: number;
}

export interface WalletActivity {
  wallet: string;
  firstSeenSlot: number;
  transactionCount: number;
  totalVolume: number;
  avgTransactionSize: number;
  isContract: boolean;
  tags: string[];
}

export interface NetworkMetrics {
  slot: number;
  timestamp: number;
  tps: number;
  avgFee: number;
  activeWallets: number;
  tokenTransfers: number;
  uniqueMints: Set<string>;
}

export interface gRPCConfig {
  heliusApiKey?: string;
  chainstackRpcUrl: string;
  chainstackUsername?: string;
  chainstackPassword?: string;
  heliusLaserStreamUrl?: string;
  maxReconnectAttempts: number;
  reconnectIntervalMs: number;
  batchSize: number;
}

export interface BridgeEvents {
  'token.transfer': (transfer: SPLTokenTransfer) => void;
  'wallet.activity': (activity: WalletActivity) => void;
  'network.metrics': (metrics: NetworkMetrics) => void;
  'slot.update': (slot: number) => void;
  'error': (error: Error) => void;
  'reconnect': (attempt: number) => void;
  'connected': () => void;
  'disconnected': () => void;
}

// ============================================================================
// TOKEN DECODER
// ============================================================================

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const WRAPPED_SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');

class TokenDecoder {
  private knownMints: Map<string, TokenMetadata> = new Map();
  private walletFirstSeen: Map<string, number> = new Map();

  constructor() {
    this.initializeKnownTokens();
  }

  private initializeKnownTokens(): void {
    // Bekannte SPL-Tokens mit Metadaten
    const knownTokens: TokenMetadata[] = [
      { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDj1o', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
      { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
      { mint: 'So11111111111111111111111111111111111111112', symbol: 'SOL', name: 'Solana', decimals: 9 },
      { mint: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', symbol: 'JUP', name: 'Jupiter', decimals: 6 },
      { mint: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCP', symbol: 'JTO', name: 'Jito', decimals: 9 },
      { mint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', symbol: 'WIF', name: 'dogwifhat', decimals: 6 },
      { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', symbol: 'BONK', name: 'Bonk', decimals: 5 },
      { mint: 'PollA1b9h1m7Zn9a2v7rD8JKpzCFrkdP7cT3YBv4fXqL', symbol: 'POPCAT', name: 'Popcat', decimals: 9 },
      { mint: '3UVbB4r51eJZvGm6TmB9Lg4YfEJeNX3QXmnc7FftQdge', symbol: 'MOTHER', name: 'MOTHER IGGY', decimals: 6 },
      { mint: 'FLUXvmPxiVu8PSr4qR4WD1HWDW5hXmJ8vLcGgY5fRK9', symbol: 'FWOG', name: 'FWOG', decimals: 6 },
      { mint: 'SLERFjjwjQKKkJB4ePDKxWPGVAsyGcXaAPRXSVz3V5H', symbol: 'SLERF', name: 'Slerf', decimals: 9 },
      { mint: 'pKhQd9o6q7pL6eFaLPQA85Tai5keJh1VYJvkjLzhQbc', symbol: 'WEN', name: 'WEN', decimals: 6 },
      { mint: 'A8C3xuqscfmyLrte3VmTqrAq8kgMASius9AFNANwpump', symbol: 'LISTA', name: 'Lista', decimals: 6 },
      { mint: 'Ae7ngy6Z4zkkBX2JJuj5L8Z7hbV9xJ4y2HshH5u3L4Kf', symbol: 'AI16Z', name: 'ai16z', decimals: 6 },
      { mint: '2qEHjD3bu3q7TBhodMr党风廉政建设alUGR4DqAr5QzL5Rd4ZZ', symbol: 'BOME', name: 'BOOK OF MEME', decimals: 6 },
    ];

    knownTokens.forEach(token => this.knownMints.set(token.mint, token));
  }

  registerWallet(wallet: string, slot: number): void {
    if (!this.walletFirstSeen.has(wallet)) {
      this.walletFirstSeen.set(wallet, slot);
    }
  }

  getWalletAge(wallet: string, currentSlot: number): number {
    const firstSeen = this.walletFirstSeen.get(wallet) || currentSlot;
    return currentSlot - firstSeen;
  }

  decodeTokenTransfer(
    tx: ParsedTransactionWithMeta,
    instruction: any,
    currentSlot: number
  ): SPLTokenTransfer | null {
    try {
      const parsed = instruction.parsed;
      if (!parsed || parsed.type !== 'transfer') return null;

      const info = parsed.info;
      if (!info) return null;

      const mint = info.mint || WRAPPED_SOL_MINT.toBase58();
      const isWrappedSOL = mint === WRAPPED_SOL_MINT.toBase58();

      // Amount in smallest unit (lamports or tokens)
      const amountRaw = BigInt(info.tokenAmount?.amount || info.lamports || 0);
      const decimals = info.tokenAmount?.decimals || (isWrappedSOL ? 9 : 0);
      const uiAmount = Number(amountRaw) / Math.pow(10, decimals);

      // Register wallets for age calculation
      const source = info.source || info.from;
      const destination = info.destination || info.to;
      if (source) this.registerWallet(source, currentSlot);
      if (destination) this.registerWallet(destination, currentSlot);

      return {
        signature: tx.signature,
        slot: tx.slot,
        timestamp: (tx.blockTime || Date.now() / 1000) * 1000,
        source: source || '',
        destination: destination || '',
        mint,
        amount: amountRaw,
        decimals,
        uiAmount,
        walletAge: this.getWalletAge(source || destination || '', currentSlot),
        isWrappedSOL,
        programId: instruction.programId?.toString() || TOKEN_PROGRAM_ID.toBase58(),
      };
    } catch (error) {
      return null;
    }
  }

  isTokenProgram(programId: PublicKey): boolean {
    return programId.equals(TOKEN_PROGRAM_ID);
  }

  isSystemProgram(programId: PublicKey): boolean {
    return programId.equals(SYSTEM_PROGRAM_ID);
  }

  getKnownToken(mint: string): TokenMetadata | undefined {
    return this.knownMints.get(mint);
  }

  addKnownToken(metadata: TokenMetadata): void {
    this.knownMints.set(metadata.mint, metadata);
  }
}

// ============================================================================
// NETWORK METRICS COLLECTOR
// ============================================================================

class MetricsCollector {
  private samples: NetworkMetrics[] = [];
  private maxSamples = 1000;
  private tokenTransferCounts: Map<string, number> = new Map();
  private activeWallets: Set<string> = new Set();

  addSample(metrics: NetworkMetrics): void {
    this.samples.push(metrics);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  recordTokenTransfer(mint: string, wallet: string): void {
    this.tokenTransferCounts.set(mint, (this.tokenTransferCounts.get(mint) || 0) + 1);
    this.activeWallets.add(wallet);
  }

  getRecentMetrics(windowMs: number = 60000): NetworkMetrics[] {
    const cutoff = Date.now() - windowMs;
    return this.samples.filter(m => m.timestamp > cutoff);
  }

  getTokenVolume(mint: string): number {
    return this.tokenTransferCounts.get(mint) || 0;
  }

  getActiveWalletCount(): number {
    return this.activeWallets.size;
  }

  clearStaleData(maxAgeMs: number = 300000): void {
    const cutoff = Date.now() - maxAgeMs;
    this.samples = this.samples.filter(m => m.timestamp > cutoff);
    if (this.samples.length === 0) {
      this.activeWallets.clear();
    }
  }
}

// ============================================================================
// CHAINSTACK gRPC CLIENT
// ============================================================================

interface ChainstackAccount {
  pubkey: string;
  account: {
    data: string;
    executable: boolean;
    lamports: number;
    owner: string;
  };
}

interface ChainstackBlock {
  blockhash: string;
  previousBlockhash: string;
  slot: number;
  parentSlot: number;
  transactions: Array<{
    transaction: {
      message: {
        accountKeys: string[];
        instructions: any[];
      };
      signatures: string[];
    };
    meta: {
      fee: number;
      preBalances: number[];
      postBalances: number[];
      logMessages?: string[];
    };
  }>;
}

class ChainstackClient {
  private connection: Connection;
  private config: gRPCConfig;
  private currentSlot = 0;

  constructor(config: gRPCConfig) {
    this.config = config;
    this.connection = new Connection(config.chainstackRpcUrl, {
      commitment: 'processed',
      fetch: this.createAuthFetch(),
    });
  }

  private createAuthFetch(): typeof fetch {
    if (!this.config.chainstackUsername || !this.config.chainstackPassword) {
      return fetch;
    }

    const credentials = Buffer.from(
      `${this.config.chainstackUsername}:${this.config.chainstackPassword}`
    ).toString('base64');

    return (input: RequestInfo, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Basic ${credentials}`);
      return fetch(input, {...init, headers});
    };
  }

  async getCurrentSlot(): Promise<number> {
    this.currentSlot = await this.connection.getSlot();
    return this.currentSlot;
  }

  async getSignaturesForAddress(
    address: string,
    limit: number = 100
  ): Promise<ConfirmedSignatureInfo[]> {
    const pubkey = new PublicKey(address);
    return await this.connection.getSignaturesForAddress(pubkey, { limit });
  }

  async getTransaction(
    signature: string,
    encoding: 'jsonParsed' | 'json' | 'base64' = 'jsonParsed'
  ): Promise<ParsedTransactionWithMeta | null> {
    try {
      const tx = await this.connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        encoding,
      });
      return tx as ParsedTransactionWithMeta;
    } catch {
      return null;
    }
  }

  async getBlock(slot: number): Promise<ChainstackBlock | null> {
    try {
      const block = await this.connection.getBlock(slot, {
        maxSupportedTransactionVersion: 0,
        encoding: 'jsonParsed',
      });
      return block as unknown as ChainstackBlock;
    } catch {
      return null;
    }
  }

  async getRecentBlocks(count: number = 10): Promise<ChainstackBlock[]> {
    const currentSlot = await this.getCurrentSlot();
    const blocks: ChainstackBlock[] = [];

    for (let i = 0; i < count; i++) {
      const slot = currentSlot - i * 50; // Skip to avoid re-orgs
      const block = await this.getBlock(slot);
      if (block) blocks.push(block);
    }

    return blocks;
  }

  async subscribeToTransactions(
    addresses: string[],
    callback: (tx: ParsedTransactionWithMeta) => void
  ): Promise<() => void> {
    const subscriptions = addresses.map(address => {
      const pubkey = new PublicKey(address);
      return this.connection.onLogs(pubkey, (logs) => {
        if (logs.err === null) {
          this.getTransaction(logs.signature).then(tx => {
            if (tx) callback(tx);
          });
        }
      }, 'processed');
    });

    return () => {
      subscriptions.forEach(sub => {
        this.connection.removeSignatureListener(sub);
      });
    };
  }
}

// ============================================================================
// HELIUS LASERSTREAM CLIENT
// ============================================================================

interface HeliusWebhook {
  jsonrpc: string;
  id: number;
  method: string;
  params: {
    query: {
      accounts?: string[];
      slots?: number[];
      transactions?: string[];
      voteTransactions?: boolean;
    };
    options?: {
      timeoutMs?: number;
      commitment?: string;
    };
  };
}

interface HeliusResponse {
  jsonrpc: string;
  id: number;
  result?: {
    subscription: number;
  };
  error?: {
    code: number;
    message: string;
  };
}

class HeliusLaserStreamClient {
  private ws: WebSocket | null = null;
  private config: gRPCConfig;
  private subscriptionId: number | null = null;
  private reconnectAttempts = 0;
  private pendingMessages: HeliusWebhook[] = [];
  private eventEmitter: EventEmitter;
  private isConnecting = false;

  constructor(config: gRPCConfig, eventEmitter: EventEmitter) {
    this.config = config;
    this.eventEmitter = eventEmitter;
  }

  async connect(): Promise<void> {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      const url = this.config.heliusLaserStreamUrl ||
        `wss://api.helius.xyz/v0/websocket?api-key=${this.config.heliusApiKey}`;

      try {
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          console.log('[HeliusLaserStream] Connected');
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.eventEmitter.emit('connected');

          // Send pending messages
          this.pendingMessages.forEach(msg => this.sendRaw(msg));
          this.pendingMessages = [];

          resolve();
        };

        this.ws.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data);
            await this.handleMessage(data);
          } catch (e) {
            console.error('[HeliusLaserStream] Parse error:', e);
          }
        };

        this.ws.onerror = (error) => {
          console.error('[HeliusLaserStream] WebSocket error:', error);
          this.isConnecting = false;
          if (this.reconnectAttempts === 0) {
            reject(error);
          }
        };

        this.ws.onclose = () => {
          console.log('[HeliusLaserStream] Disconnected');
          this.isConnecting = false;
          this.eventEmitter.emit('disconnected');
          this.attemptReconnect();
        };
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  private async handleMessage(data: any): Promise<void> {
    if (data.method === 'subscriptionConfirm' && data.params?.subscription) {
      this.subscriptionId = data.params.subscription;
      console.log('[HeliusLaserStream] Subscription confirmed:', this.subscriptionId);
      return;
    }

    if (data.params?.result) {
      const result = data.params.result;
      if (result.transaction) {
        this.eventEmitter.emit('transaction', result.transaction);
      }
      if (result.value) {
        this.eventEmitter.emit('slotUpdate', result.value.slot);
      }
    }
  }

  private sendRaw(message: HeliusWebhook): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.pendingMessages.push(message);
    }
  }

  async subscribeToTransactions(addresses: string[]): Promise<void> {
    const message: HeliusWebhook = {
      jsonrpc: '2.0',
      id: 1,
      method: 'logsSubscribe',
      params: [
        {
          mentions: addresses,
        },
        {
          commitment: 'processed',
        },
      ],
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendRaw(message);
    } else {
      this.pendingMessages.push(message);
    }
  }

  async subscribeToAccountUpdates(accounts: string[]): Promise<void> {
    const message: HeliusWebhook = {
      jsonrpc: '2.0',
      id: 2,
      method: 'accountSubscribe',
      params: [
        { accounts },
        { commitment: 'processed' },
      ],
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendRaw(message);
    } else {
      this.pendingMessages.push(message);
    }
  }

  private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('[HeliusLaserStream] Max reconnect attempts reached');
      this.eventEmitter.emit('error', new Error('Max reconnect attempts reached'));
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.config.reconnectIntervalMs * Math.pow(2, this.reconnectAttempts - 1),
      60000
    );

    console.log(`[HeliusLaserStream] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.eventEmitter.emit('reconnect', this.reconnectAttempts);

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      await this.connect();
    } catch (e) {
      console.error('[HeliusLaserStream] Reconnect failed:', e);
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// ============================================================================
// MAIN BRIDGE CLASS
// ============================================================================

export class SolanaGRPCBridge extends EventEmitter {
  private chainstackClient: ChainstackClient;
  private heliusClient: HeliusLaserStreamClient;
  private tokenDecoder: TokenDecoder;
  private metricsCollector: MetricsCollector;
  private config: gRPCConfig;
  private isRunning = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;
  private trackedAddresses: Set<string> = new Set();
  private trackedMints: Set<string> = new Set();
  private pendingSignatures: Map<string, number> = new Map();
  private signatureProcessingQueue: string[] = [];

  constructor(config: Partial<gRPCConfig> = {}) {
    super();

    const fullConfig: gRPCConfig = {
      chainstackRpcUrl: config.chainstackRpcUrl || 'https://solana-mainnet.core.chainstack.com',
      maxReconnectAttempts: config.maxReconnectAttempts || 10,
      reconnectIntervalMs: config.reconnectIntervalMs || 1000,
      batchSize: config.batchSize || 100,
      ...config,
    };

    this.config = fullConfig;
    this.chainstackClient = new ChainstackClient(fullConfig);
    this.tokenDecoder = new TokenDecoder();
    this.metricsCollector = new MetricsCollector();

    this.heliusClient = new HeliusLaserStreamClient(fullConfig, this);

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.heliusClient.on('connected', () => {
      console.log('[Bridge] Helius LaserStream connected');
      this.emit('connected');
    });

    this.heliusClient.on('disconnected', () => {
      console.log('[Bridge] Helius LaserStream disconnected');
      this.emit('disconnected');
    });

    this.heliusClient.on('reconnect', (attempt: number) => {
      console.log(`[Bridge] Reconnecting (attempt ${attempt})`);
      this.emit('reconnect', attempt);
    });

    this.heliusClient.on('transaction', (tx: any) => {
      this.processTransaction(tx);
    });

    this.heliusClient.on('slotUpdate', (slot: number) => {
      this.emit('slot.update', slot);
    });

    this.on('error', (error: Error) => {
      console.error('[Bridge] Error:', error.message);
    });
  }

  async connect(): Promise<void> {
    if (this.isRunning) return;

    console.log('[Bridge] Connecting to Solana networks...');

    try {
      // Connect to Helius LaserStream
      await this.heliusClient.connect();

      // Subscribe to DEX addresses for token transfers
      const dexAddresses = [
        'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter
        '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUtSMP8', // Raydium
        'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctoyc', // Orca
        'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', // Marinade
      ];

      await this.heliusClient.subscribeToTransactions(dexAddresses);

      this.isRunning = true;
      console.log('[Bridge] Connected and subscribed to streams');

      // Start metrics collection
      this.startMetricsCollection();

    } catch (error) {
      console.error('[Bridge] Connection failed:', error);
      throw error;
    }
  }

  disconnect(): void {
    if (!this.isRunning) return;

    console.log('[Bridge] Disconnecting...');

    this.heliusClient.disconnect();

    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    this.isRunning = false;
    this.emit('disconnected');
  }

  private async processTransaction(tx: ParsedTransactionWithMeta): Promise<void> {
    if (!tx || !tx.transaction) return;

    const message = tx.transaction.message;
    if (!message.instructions) return;

    const currentSlot = tx.slot;

    // Process each instruction
    for (const instruction of message.instructions) {
      // Check if it's a token transfer
      if (instruction.programId?.toString() === TOKEN_PROGRAM_ID.toBase58()) {
        const transfer = this.tokenDecoder.decodeTokenTransfer(tx, instruction, currentSlot);
        if (transfer) {
          // Record metrics
          this.metricsCollector.recordTokenTransfer(transfer.mint, transfer.source);
          this.metricsCollector.recordTokenTransfer(transfer.mint, transfer.destination);

          // Emit event
          this.emit('token.transfer', transfer);

          // Track new mints
          if (!this.trackedMints.has(transfer.mint)) {
            this.trackedMints.add(transfer.mint);
            const metadata = this.tokenDecoder.getKnownToken(transfer.mint);
            if (metadata) {
              console.log(`[Bridge] New tracked mint: ${metadata.symbol} (${transfer.mint})`);
            }
          }
        }
      }
    }
  }

  private startMetricsCollection(): void {
    // Collect metrics every 10 seconds
    this.metricsInterval = setInterval(async () => {
      try {
        const slot = await this.chainstackClient.getCurrentSlot();

        const metrics: NetworkMetrics = {
          slot,
          timestamp: Date.now(),
          tps: 0, // Calculated from recent blocks
          avgFee: 0,
          activeWallets: this.metricsCollector.getActiveWalletCount(),
          tokenTransfers: 0,
          uniqueMints: this.trackedMints,
        };

        this.metricsCollector.addSample(metrics);
        this.emit('network.metrics', metrics);

        // Clean up stale data every minute
        if (Math.random() < 0.1) {
          this.metricsCollector.clearStaleData();
        }
      } catch (error) {
        console.error('[Bridge] Metrics collection error:', error);
      }
    }, 10000);

    // Process signature queue continuously
    this.processingInterval = setInterval(async () => {
      await this.processSignatureQueue();
    }, 100);
  }

  private async processSignatureQueue(): Promise<void> {
    if (this.signatureProcessingQueue.length === 0) return;

    const batch = this.signatureProcessingQueue.splice(0, this.config.batchSize);

    await Promise.all(
      batch.map(async (signature) => {
        try {
          const tx = await this.chainstackClient.getTransaction(signature);
          if (tx) {
            await this.processTransaction(tx);
          }
        } catch (error) {
          console.error(`[Bridge] Failed to process tx ${signature}:`, error);
        }
      })
    );
  }

  async queueTransactionSignatures(address: string, limit: number = 100): Promise<void> {
    try {
      const signatures = await this.chainstackClient.getSignaturesForAddress(address, limit);

      for (const sig of signatures) {
        const sigStr = typeof sig.signature === 'string' ? sig.signature : sig.signature.toString();
        if (!this.pendingSignatures.has(sigStr)) {
          this.pendingSignatures.set(sigStr, Date.now());
          this.signatureProcessingQueue.push(sigStr);
        }
      }
    } catch (error) {
      console.error('[Bridge] Failed to queue signatures:', error);
    }
  }

  trackAddress(address: string): void {
    this.trackedAddresses.add(address);
    this.queueTransactionSignatures(address).catch(console.error);
  }

  getTokenMetadata(mint: string): TokenMetadata | undefined {
    return this.tokenDecoder.getKnownToken(mint);
  }

  getMetricsCollector(): MetricsCollector {
    return this.metricsCollector;
  }

  isConnected(): boolean {
    return this.isRunning && this.heliusClient.isConnected();
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createBridge(config?: Partial<gRPCConfig>): SolanaGRPCBridge {
  return new SolanaGRPCBridge(config);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default SolanaGRPCBridge;
export { SolanaGRPCBridge };
