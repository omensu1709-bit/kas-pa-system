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
export declare class RedisWriter {
    private redis;
    private pipeline;
    private pendingWrites;
    private readonly BATCH_SIZE;
    private readonly FLUSH_INTERVAL_MS;
    constructor(redis: Redis);
    private startFlushTimer;
    private flush;
    writeAccount(data: AccountUpdate): Promise<void>;
    writeTransaction(data: TransactionUpdate): Promise<void>;
    writeSlotData(slot: number, data: any): Promise<void>;
    getRecentAccounts(limit?: number): Promise<string[]>;
    getRecentTransactions(limit?: number): Promise<string[]>;
    getAccountData(pubkey: string, slot: number): Promise<any | null>;
    getTransactionData(signature: string): Promise<any | null>;
    getStats(): Promise<any>;
}
//# sourceMappingURL=redis-writer.d.ts.map