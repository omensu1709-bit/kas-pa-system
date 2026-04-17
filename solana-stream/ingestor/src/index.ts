import { Redis } from 'ioredis';
import { HeliusClient } from './helius-client.js';
import { ChainstackClient } from './chainstack-client.js';
import { DeduplicationLayer } from './deduplication.js';
import { RedisWriter } from './redis-writer.js';
import { EventEmitter } from 'events';

const logger = {
  info: (msg: string, ...args: any[]) => console.log(`[${new Date().toISOString()}] INFO:`, msg, ...args),
  error: (msg: string, ...args: any[]) => console.error(`[${new Date().toISOString()}] ERROR:`, msg, ...args),
  warn: (msg: string, ...args: any[]) => console.warn(`[${new Date().toISOString()}] WARN:`, msg, ...args),
};

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  helius: { connected: boolean; lastSlot: number };
  chainstack: { connected: boolean; lastSlot: number };
  redis: boolean;
  uptime: number;
  startTime: number;
}

class SolanaStreamIngestor {
  private redis: Redis;
  private redisWriter: RedisWriter;
  private deduplication: DeduplicationLayer;
  private heliusClient: HeliusClient | null = null;
  private chainstackClient: ChainstackClient | null = null;
  private events: EventEmitter;
  private startTime: number;
  private isShuttingDown: boolean = false;

  constructor() {
    this.startTime = Date.now();
    this.events = new EventEmitter();
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      retryStrategy: (times) => {
        const delay = Math.min(times * 100, 3000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });
    this.redisWriter = new RedisWriter(this.redis);
    this.deduplication = new DeduplicationLayer();
    this.setupRedisHandlers();
  }

  private setupRedisHandlers(): void {
    this.redis.on('connect', () => {
      logger.info('Redis connected');
    });

    this.redis.on('error', (err) => {
      logger.error('Redis error:', err.message);
    });

    this.redis.on('close', () => {
      logger.warn('Redis connection closed');
    });
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Solana Stream Ingestor...');
    logger.info('ZSTD Enabled:', process.env.ZSTD_ENABLED === 'true');
    logger.info('Adaptive Window:', process.env.ADAPTIVE_WINDOW === 'true');

    // Test Redis connection
    try {
      await this.redis.ping();
      logger.info('Redis connection verified');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }

    // Load TIER assignments from Redis
    const tier1 = await this.redis.get('tiers:tier1');
    const tier2 = await this.redis.get('tiers:tier2');

    if (tier1) {
      logger.info('Loaded TIER1 assignments:', JSON.parse(tier1).length, 'accounts');
    }
    if (tier2) {
      logger.info('Loaded TIER2 assignments:', JSON.parse(tier2).length, 'accounts');
    }

    // Subscribe to tier updates
    this.redis.subscribe('tier_updates', (err) => {
      if (err) logger.error('Failed to subscribe to tier_updates:', err);
    });

    this.redis.on('message', (channel, message) => {
      if (channel === 'tier_updates') {
        this.handleTierUpdate(JSON.parse(message));
      }
    });

    logger.info('Initialization complete');
  }

  async startHelius(): Promise<void> {
    if (!process.env.HELIUS_API_KEY) {
      logger.warn('HELIUS_API_KEY not set, skipping Helius client');
      return;
    }

    try {
      const tier1Accounts = await this.getTier1Accounts();
      if (tier1Accounts.length === 0) {
        logger.warn('No TIER1 accounts configured, skipping Helius');
        return;
      }

      this.heliusClient = new HeliusClient(
        this.redisWriter,
        this.deduplication,
        {
          apiKey: process.env.HELIUS_API_KEY!,
          endpoint: 'https://laserstream-mainnet-ewr.helius-rpc.com',
          zstdEnabled: process.env.ZSTD_ENABLED === 'true',
          adaptiveWindow: process.env.ADAPTIVE_WINDOW === 'true',
        }
      );

      await this.heliusClient.start(tier1Accounts);
      logger.info('Helius client started');
    } catch (error) {
      logger.error('Failed to start Helius client:', error);
    }
  }

  async startChainstack(): Promise<void> {
    if (!process.env.CHAINSTACK_ENDPOINT || !process.env.CHAINSTACK_TOKEN) {
      logger.warn('ChainStack credentials not set, skipping Chainstack client');
      return;
    }

    try {
      const tier2Accounts = await this.getTier2Accounts();
      if (tier2Accounts.length === 0) {
        logger.warn('No TIER2 accounts configured, skipping Chainstack');
        return;
      }

      this.chainstackClient = new ChainstackClient(
        this.redisWriter,
        this.deduplication,
        {
          endpoint: process.env.CHAINSTACK_ENDPOINT!,
          token: process.env.CHAINSTACK_TOKEN!,
          zstdEnabled: process.env.ZSTD_ENABLED === 'true',
          adaptiveWindow: process.env.ADAPTIVE_WINDOW === 'true',
        }
      );

      await this.chainstackClient.start(tier2Accounts);
      logger.info('Chainstack client started');
    } catch (error) {
      logger.error('Failed to start Chainstack client:', error);
    }
  }

  private async getTier1Accounts(): Promise<string[]> {
    const tier1 = await this.redis.get('tiers:tier1');
    if (!tier1) {
      // Default accounts for testing
      return [
        'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter
      ];
    }
    return JSON.parse(tier1);
  }

  private async getTier2Accounts(): Promise<string[]> {
    const tier2 = await this.redis.get('tiers:tier2');
    if (!tier2) {
      return [
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token Program
      ];
    }
    return JSON.parse(tier2);
  }

  private async handleTierUpdate(data: { tier1: string[]; tier2: string[] }): void {
    logger.info('Received tier update:', {
      tier1: data.tier1.length,
      tier2: data.tier2.length,
    });

    // Restart clients with new tier assignments
    if (this.heliusClient && data.tier1.length > 0) {
      await this.heliusClient.updateSubscriptions(data.tier1);
    }
    if (this.chainstackClient && data.tier2.length > 0) {
      await this.chainstackClient.updateSubscriptions(data.tier2);
    }
  }

  async start(): Promise<void> {
    await this.initialize();

    // Start both clients
    await Promise.all([
      this.startHelius(),
      this.startChainstack(),
    ]);

    // Start health check server
    this.startHealthServer();

    logger.info('All clients started, streaming active...');
  }

  private startHealthServer(): void {
    const http = require('http');

    const server = http.createServer(async (req: any, res: any) => {
      if (req.url === '/health') {
        const status = this.getHealthStatus();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status));
      } else if (req.url === '/metrics') {
        const metrics = this.getMetrics();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(metrics));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    server.listen(8080, () => {
      logger.info('Health server listening on port 8080');
    });
  }

  private getHealthStatus(): HealthStatus {
    const heliusStatus = this.heliusClient?.getStatus() || { connected: false, lastSlot: 0 };
    const chainstackStatus = this.chainstackClient?.getStatus() || { connected: false, lastSlot: 0 };

    let status: 'healthy' | 'degraded' | 'down' = 'healthy';
    if (!heliusStatus.connected && !chainstackStatus.connected) {
      status = 'down';
    } else if (!heliusStatus.connected || !chainstackStatus.connected) {
      status = 'degraded';
    }

    return {
      status,
      helius: heliusStatus,
      chainstack: chainstackStatus,
      redis: this.redis.status === 'ready',
      uptime: Date.now() - this.startTime,
      startTime: this.startTime,
    };
  }

  private getMetrics(): any {
    return {
      ...this.getHealthStatus(),
      deduplication: {
        txnCacheSize: this.deduplication.getTxnCacheSize(),
        accountCacheSize: this.deduplication.getAccountCacheSize(),
      },
      redis: {
        connected: this.redis.status === 'ready',
      },
    };
  }

  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    logger.info('Shutting down...');

    await this.heliusClient?.stop();
    await this.chainstackClient?.stop();
    await this.redis.quit();

    process.exit(0);
  }
}

// Main entry point
const ingestor = new SolanaStreamIngestor();

process.on('SIGINT', () => ingestor.shutdown());
process.on('SIGTERM', () => ingestor.shutdown());

ingestor.start().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
