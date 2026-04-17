import { DeduplicationLayer } from './deduplication.js';
import { RedisWriter } from './redis-writer.js';
export interface HeliusClientConfig {
    apiKey: string;
    endpoint: string;
    zstdEnabled?: boolean;
    adaptiveWindow?: boolean;
}
export declare class HeliusClient {
    private redisWriter;
    private deduplication;
    private config;
    private isConnected;
    private lastSlot;
    private accountSubscriptions;
    private subscriptionId;
    constructor(redisWriter: RedisWriter, deduplication: DeduplicationLayer, config: HeliusClientConfig);
    start(marketPubkeys: string[]): Promise<void>;
    updateSubscriptions(marketPubkeys: string[]): Promise<void>;
    getStatus(): {
        connected: boolean;
        lastSlot: number;
        accounts: number;
    };
    stop(): Promise<void>;
}
//# sourceMappingURL=helius-client.d.ts.map