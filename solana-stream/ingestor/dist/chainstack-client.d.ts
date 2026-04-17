import { DeduplicationLayer } from './deduplication.js';
import { RedisWriter } from './redis-writer.js';
export interface ChainstackClientConfig {
    endpoint: string;
    token: string;
    zstdEnabled?: boolean;
    adaptiveWindow?: boolean;
}
export declare class ChainstackClient {
    private redisWriter;
    private deduplication;
    private config;
    private isConnected;
    private lastSlot;
    private accountSubscriptions;
    private client;
    private stream;
    constructor(redisWriter: RedisWriter, deduplication: DeduplicationLayer, config: ChainstackClientConfig);
    start(tokenMints: string[]): Promise<void>;
    updateSubscriptions(tokenMints: string[]): Promise<void>;
    getStatus(): {
        connected: boolean;
        lastSlot: number;
        accounts: number;
    };
    stop(): Promise<void>;
}
//# sourceMappingURL=chainstack-client.d.ts.map