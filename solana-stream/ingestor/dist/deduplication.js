export class DeduplicationLayer {
    txnMap = new Map();
    accountMap = new Map();
    TTL_MS = 30000; // 30 seconds
    MAX_ENTRIES = 100000;
    cleanup() {
        const now = Date.now();
        // Clean expired transaction entries
        for (const [key, entry] of this.txnMap.entries()) {
            if (now - entry.timestamp > this.TTL_MS) {
                this.txnMap.delete(key);
            }
        }
        // Clean expired account entries
        for (const [key, entry] of this.accountMap.entries()) {
            if (now - entry.timestamp > this.TTL_MS) {
                this.accountMap.delete(key);
            }
        }
        // Emergency cleanup if too many entries
        if (this.txnMap.size > this.MAX_ENTRIES) {
            const toDelete = Math.floor(this.MAX_ENTRIES * 0.1);
            const keys = Array.from(this.txnMap.keys()).slice(0, toDelete);
            keys.forEach(k => this.txnMap.delete(k));
        }
        if (this.accountMap.size > this.MAX_ENTRIES) {
            const toDelete = Math.floor(this.MAX_ENTRIES * 0.1);
            const keys = Array.from(this.accountMap.keys()).slice(0, toDelete);
            keys.forEach(k => this.accountMap.delete(k));
        }
    }
    isTransactionDuplicate(signature, slot) {
        if (!signature)
            return false;
        const key = `${signature}`;
        const existing = this.txnMap.get(key);
        if (existing && existing.slot === slot) {
            return true;
        }
        this.txnMap.set(key, { signature, slot, timestamp: Date.now() });
        this.cleanup();
        return false;
    }
    isAccountDuplicate(pubkey, slot, writeVersion) {
        if (!pubkey)
            return false;
        const key = `${pubkey}:${slot}:${writeVersion}`;
        if (this.accountMap.has(key)) {
            return true;
        }
        this.accountMap.set(key, { signature: key, slot, timestamp: Date.now() });
        this.cleanup();
        return false;
    }
    getTxnCacheSize() {
        return this.txnMap.size;
    }
    getAccountCacheSize() {
        return this.accountMap.size;
    }
    clear() {
        this.txnMap.clear();
        this.accountMap.clear();
    }
}
//# sourceMappingURL=deduplication.js.map