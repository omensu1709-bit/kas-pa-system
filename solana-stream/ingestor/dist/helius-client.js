import { subscribe, CommitmentLevel } from 'helius-laserstream';
export class HeliusClient {
    redisWriter;
    deduplication;
    config;
    isConnected = false;
    lastSlot = 0;
    accountSubscriptions = [];
    subscriptionId = null;
    constructor(redisWriter, deduplication, config) {
        this.redisWriter = redisWriter;
        this.deduplication = deduplication;
        this.config = {
            zstdEnabled: true,
            adaptiveWindow: true,
            ...config,
        };
    }
    async start(marketPubkeys) {
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
        const laserstreamConfig = {
            apiKey: this.config.apiKey,
            endpoint: this.config.endpoint,
        };
        try {
            await subscribe(laserstreamConfig, request, async (data) => {
                this.lastSlot = data.slot || 0;
                // Handle account updates
                if (data.account && data.account.pubkey) {
                    if (!this.deduplication.isAccountDuplicate(data.account.pubkey, data.slot, BigInt(data.account.writeVersion || 0))) {
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
            }, async (error) => {
                console.error('[Helius] Error:', error?.message || error);
                if (error?.code === 'RESOURCE_EXHAUSTED') {
                    console.error('[Helius] Bandwidth limit reached! Reduce filters.');
                }
            });
            this.isConnected = true;
            console.log(`[Helius] Connected, monitoring ${marketPubkeys.length} accounts`);
        }
        catch (error) {
            console.error('[Helius] Failed to start:', error);
            throw error;
        }
    }
    async updateSubscriptions(marketPubkeys) {
        console.log(`[Helius] Updating subscriptions to ${marketPubkeys.length} accounts`);
        this.accountSubscriptions = marketPubkeys;
        // For now, we need to restart the client
        // In production, you'd implement dynamic subscription updates
        await this.stop();
        await this.start(marketPubkeys);
    }
    getStatus() {
        return {
            connected: this.isConnected,
            lastSlot: this.lastSlot,
            accounts: this.accountSubscriptions.length,
        };
    }
    async stop() {
        console.log('[Helius] Stopping...');
        this.isConnected = false;
        this.subscriptionId = null;
    }
}
//# sourceMappingURL=helius-client.js.map