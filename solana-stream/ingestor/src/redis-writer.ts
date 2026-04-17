import { Redis } from 'ioredis';

export interface AccountUpdate {
  source: string;
  slot: number;
  pubkey: string;
  data?: any;
  writeVersion?: number;
  timestamp: number;
}

export interface TransactionUpdate {
  source: string;
  signature: string;
  slot: number;
  data?: any;
  timestamp: number;
}

export class RedisWriter {
  private redis: Redis;
  private pipeline: any;
  private pendingWrites: number = 0;
  private readonly BATCH_SIZE = 100;
  private readonly FLUSH_INTERVAL_MS = 100;

  constructor(redis: Redis) {
    this.redis = redis;
    this.startFlushTimer();
  }

  private startFlushTimer(): void {
    setInterval(() => {
      this.flush();
    }, this.FLUSH_INTERVAL_MS);
  }

  private async flush(): Promise<void> {
    if (this.pendingWrites === 0) return;

    try {
      await this.redis.batch().exec();
      this.pendingWrites = 0;
    } catch (error) {
      console.error('[RedisWriter] Flush error:', error);
    }
  }

  async writeAccount(data: AccountUpdate): Promise<void> {
    const key = `account:${data.pubkey}:${data.slot}`;
    const score = data.slot;

    const batch = this.redis.batch();

    // Store account data
    batch.hset(key, {
      source: data.source,
      slot: data.slot.toString(),
      pubkey: data.pubkey,
      data: JSON.stringify(data.data),
      writeVersion: (data.writeVersion || 0).toString(),
      timestamp: data.timestamp.toString(),
    });

    // Set TTL (1 hour for account data)
    batch.expire(key, 3600);

    // Add to sorted set for time-based queries
    batch.zadd('accounts:by_slot', score, key);

    // Track by source
    batch.sadd(`accounts:source:${data.source}`, key);

    // Increment counter
    batch.incr('stats:accounts:total');
    batch.incr(`stats:accounts:${data.source}`);

    // Add to market-specific set if applicable
    if (data.pubkey) {
      batch.sadd('accounts:recent', key);
      batch.expire('accounts:recent', 300); // 5 min TTL
    }

    await batch.exec();
    this.pendingWrites++;
  }

  async writeTransaction(data: TransactionUpdate): Promise<void> {
    if (!data.signature) return;

    const key = `txn:${data.signature}`;
    const score = data.slot;

    const batch = this.redis.batch();

    // Store transaction data
    batch.hset(key, {
      source: data.source,
      signature: data.signature,
      slot: data.slot.toString(),
      data: JSON.stringify(data.data),
      timestamp: data.timestamp.toString(),
    });

    // Set TTL (30 minutes for transaction data)
    batch.expire(key, 1800);

    // Add to sorted set for time-based queries
    batch.zadd('txns:by_slot', score, key);

    // Track by source
    batch.sadd(`txns:source:${data.source}`, key);

    // Increment counter
    batch.incr('stats:txns:total');
    batch.incr(`stats:txns:${data.source}`);

    // Add to recent transactions set
    batch.sadd('txns:recent', key);
    batch.expire('txns:recent', 300);

    await batch.exec();
    this.pendingWrites++;
  }

  async writeSlotData(slot: number, data: any): Promise<void> {
    const key = `slot:${slot}`;

    const batch = this.redis.batch();

    batch.set(key, JSON.stringify(data));
    batch.expire(key, 3600);
    batch.zadd('slots:by_number', slot, slot);

    await batch.exec();
    this.pendingWrites++;
  }

  async getRecentAccounts(limit: number = 100): Promise<string[]> {
    const keys = await this.redis.zrevrange('accounts:recent', 0, limit - 1);
    return keys;
  }

  async getRecentTransactions(limit: number = 100): Promise<string[]> {
    const keys = await this.redis.zrevrange('txns:recent', 0, limit - 1);
    return keys;
  }

  async getAccountData(pubkey: string, slot: number): Promise<any | null> {
    const key = `account:${pubkey}:${slot}`;
    const data = await this.redis.hgetall(key);
    if (!data || Object.keys(data).length === 0) return null;
    return {
      ...data,
      slot: parseInt(data.slot),
      writeVersion: parseInt(data.writeVersion),
      timestamp: parseInt(data.timestamp),
      data: JSON.parse(data.data),
    };
  }

  async getTransactionData(signature: string): Promise<any | null> {
    const key = `txn:${signature}`;
    const data = await this.redis.hgetall(key);
    if (!data || Object.keys(data).length === 0) return null;
    return {
      ...data,
      slot: parseInt(data.slot),
      timestamp: parseInt(data.timestamp),
      data: JSON.parse(data.data),
    };
  }

  async getStats(): Promise<any> {
    const pipeline = this.redis.pipeline();
    pipeline.get('stats:accounts:total');
    pipeline.get('stats:txns:total');
    pipeline.get('stats:accounts:helius');
    pipeline.get('stats:txns:helius');
    pipeline.get('stats:accounts:chainstack');
    pipeline.get('stats:txns:chainstack');

    const results = await pipeline.exec();
    if (!results) {
      return {
        accounts: { total: 0, helius: 0, chainstack: 0 },
        transactions: { total: 0, helius: 0, chainstack: 0 },
      };
    }
    return {
      accounts: {
        total: parseInt(String(results[0]?.[1] || '0')),
        helius: parseInt(String(results[2]?.[1] || '0')),
        chainstack: parseInt(String(results[4]?.[1] || '0')),
      },
      transactions: {
        total: parseInt(String(results[1]?.[1] || '0')),
        helius: parseInt(String(results[3]?.[1] || '0')),
        chainstack: parseInt(String(results[5]?.[1] || '0')),
      },
    };
  }
}
