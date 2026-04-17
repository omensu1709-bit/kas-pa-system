import { subscribe, CommitmentLevel, LaserstreamConfig } from 'helius-laserstream';
import { DeduplicationLayer } from './deduplication.js';
import { RedisWriter } from './redis-writer.js';

export interface HeliusClientConfig {
  apiKey: string;
  endpoint: string;
  zstdEnabled?: boolean;
  adaptiveWindow?: boolean;
}

export class HeliusClient {
  private redisWriter: RedisWriter;
  private deduplication: DeduplicationLayer;
  private config: HeliusClientConfig;
  private isConnected: boolean = false;
  private lastSlot: number = 0;
  private accountSubscriptions: string[] = [];
  private subscriptionId: string | null = null;

  constructor(
    redisWriter: RedisWriter,
    deduplication: DeduplicationLayer,
    config: HeliusClientConfig
  ) {
    this.redisWriter = redisWriter;
    this.deduplication = deduplication;
    this.config = {
      zstdEnabled: true,
      adaptiveWindow: true,
      ...config,
    };
  }

  async start(marketPubkeys: string[]): Promise<void> {
    console.log(`[Helius] Starting with ${marketPubkeys.length} accounts (ZSTD: ${this.config.zstdEnabled}, Adaptive: ${this.config.adaptiveWindow})`);

    this.accountSubscriptions = marketPubkeys;

    // Build subscription request with strict filters
    const request = {
      accounts: {
        // OpenBook markets - use accountInclude for specific market accounts
        openbook_v2: {
          accountInclude: marketPubkeys.slice(0, 10), // MAX 10 for TIER 1
          accountExclude: [],
          accountRequired: [],
        },
      },
      transactions: {
        pumpfun: {
          accountInclude: marketPubkeys.slice(0, 10),
          vote: false,
          failed: false,
        },
        raydium: {
          accountInclude: marketPubkeys.slice(0, 10),
          vote: false,
          failed: false,
        },
      },
      commitment: CommitmentLevel.CONFIRMED,
      vote: false,
      failed: false,
    };

    const laserstreamConfig: LaserstreamConfig = {
      apiKey: this.config.apiKey,
      endpoint: this.config.endpoint,
    };

    try {
      await subscribe(
        laserstreamConfig,
        request,
        async (data: any) => {
          this.lastSlot = data.slot || 0;

          // Handle account updates
          if (data.account && data.account.pubkey) {
            if (!this.deduplication.isAccountDuplicate(
              data.account.pubkey,
              data.slot,
              BigInt(data.account.writeVersion || 0)
            )) {
              await this.redisWriter.writeAccount({
                source: 'helius',
                slot: data.slot,
                pubkey: data.account.pubkey,
                data: data.account.data,
                writeVersion: data.account.writeVersion,
                timestamp: Date.now(),
              });
            }
          }

          // Handle transaction updates
          if (data.transaction && data.signature) {
            if (!this.deduplication.isTransactionDuplicate(data.signature, data.slot)) {
              await this.redisWriter.writeTransaction({
                source: 'helius',
                signature: data.signature,
                slot: data.slot,
                data: data.transaction,
                timestamp: Date.now(),
              });
            }
          }
        },
        async (error: any) => {
          console.error('[Helius] Error:', error?.message || error);
          if (error?.code === 'RESOURCE_EXHAUSTED') {
            console.error('[Helius] Bandwidth limit reached! Reduce filters.');
          }
        }
      );

      this.isConnected = true;
      console.log(`[Helius] Connected, monitoring ${marketPubkeys.length} accounts`);
    } catch (error) {
      console.error('[Helius] Failed to start:', error);
      throw error;
    }
  }

  async updateSubscriptions(marketPubkeys: string[]): Promise<void> {
    console.log(`[Helius] Updating subscriptions to ${marketPubkeys.length} accounts`);
    this.accountSubscriptions = marketPubkeys;
    // For now, we need to restart the client
    // In production, you'd implement dynamic subscription updates
    await this.stop();
    await this.start(marketPubkeys);
  }

  getStatus(): { connected: boolean; lastSlot: number; accounts: number } {
    return {
      connected: this.isConnected,
      lastSlot: this.lastSlot,
      accounts: this.accountSubscriptions.length,
    };
  }

  async stop(): Promise<void> {
    console.log('[Helius] Stopping...');
    this.isConnected = false;
    this.subscriptionId = null;
  }
}
