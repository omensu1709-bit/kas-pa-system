export declare class DeduplicationLayer {
    private txnMap;
    private accountMap;
    private readonly TTL_MS;
    private readonly MAX_ENTRIES;
    private cleanup;
    isTransactionDuplicate(signature: string, slot: number): boolean;
    isAccountDuplicate(pubkey: string, slot: number, writeVersion: bigint): boolean;
    getTxnCacheSize(): number;
    getAccountCacheSize(): number;
    clear(): void;
}
//# sourceMappingURL=deduplication.d.ts.map