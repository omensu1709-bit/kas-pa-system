import { GrpcClient } from '@triton-one/yellowstone-grpc';
export class ChainstackClient {
    redisWriter;
    deduplication;
    config;
    isConnected = false;
    lastSlot = 0;
    accountSubscriptions = [];
    client = null;
    stream = null;
    constructor(redisWriter, deduplication, config) {
        this.redisWriter = redisWriter;
        this.deduplication = deduplication;
        this.config = {
            zstdEnabled: true,
            adaptiveWindow: true,
            ...config,
        };
    }
    async start(tokenMints) {
        console.log(`[Chainstack] Starting with ${tokenMints.length} accounts (ZSTD: ${this.config.zstdEnabled}, Adaptive: ${this.config.adaptiveWindow})`);
        this.accountSubscriptions = tokenMints;
        try {
            // Create gRPC client with compression options
            this.client = new GrpcClient({
                url: `${this.config.endpoint}:443`,
                token: this.config.token,
            });
            // Build subscription request
            const request = {
                accounts: {
                    pumpfun: {
                        accountInclude: tokenMints.slice(0, 50), // MAX 50 for TIER 2
                        accountExclude: [],
                    },
                    token: {
                        accountInclude: ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'], // Token program
                    },
                },
                transactions: {
                    pumpfun: {
                        accountInclude: tokenMints.slice(0, 50),
                        vote: false,
                        failed: false,
                    },
                    raydium: {
                        accountInclude: tokenMints.slice(0, 50),
                        vote: false,
                        failed: false,
                    },
                    Jupiter: {
                        accountInclude: tokenMints.slice(0, 50),
                        vote: false,
                        failed: false,
                    },
                },
                commitment: 'confirmed',
                skipTransactionMetadata: false,
            };
            this.stream = await this.client.subscribe(request);
            this.stream.on('data', async (data) => {
                this.lastSlot = data.slot || 0;
                // Handle transaction data
                if (data.transaction) {
                    const signature = data.transaction.signature ||
                        data.transaction.transaction?.signatures?.[0] ||
                        '';
                    if (signature && !this.deduplication.isTransactionDuplicate(signature, data.slot)) {
                        await this.redisWriter.writeTransaction({
                            source: 'chainstack',
                            signature: signature,
                            slot: data.slot,
                            data: data.transaction,
                            timestamp: Date.now(),
                        });
                    }
                }
                // Handle account data
                if (data.account) {
                    const pubkey = data.account.pubkey || '';
                    if (pubkey && !this.deduplication.isAccountDuplicate(pubkey, data.slot, BigInt(data.account.writeVersion || 0))) {
                        await this.redisWriter.writeAccount({
                            source: 'chainstack',
                            slot: data.slot,
                            pubkey: pubkey,
                            data: data.account.data,
                            writeVersion: data.account.writeVersion,
                            timestamp: Date.now(),
                        });
                    }
                }
            });
            this.stream.on('end', () => {
                console.log('[Chainstack] Stream ended');
                this.isConnected = false;
            });
            this.stream.on('error', (error) => {
                console.error('[Chainstack] Stream error:', error?.message || error);
                if (error?.code === 'RESOURCE_EXHAUSTED') {
                    console.error('[Chainstack] Bandwidth limit reached! Reduce filters.');
                }
            });
            this.isConnected = true;
            console.log(`[Chainstack] Connected, monitoring ${tokenMints.length} accounts`);
        }
        catch (error) {
            console.error('[Chainstack] Failed to start:', error);
            throw error;
        }
    }
    async updateSubscriptions(tokenMints) {
        console.log(`[Chainstack] Updating subscriptions to ${tokenMints.length} accounts`);
        this.accountSubscriptions = tokenMints;
        await this.stop();
        await this.start(tokenMints);
    }
    getStatus() {
        return {
            connected: this.isConnected,
            lastSlot: this.lastSlot,
            accounts: this.accountSubscriptions.length,
        };
    }
    async stop() {
        console.log('[Chainstack] Stopping...');
        if (this.stream) {
            this.stream.destroy();
            this.stream = null;
        }
        if (this.client) {
            await this.client.close();
            this.client = null;
        }
        this.isConnected = false;
    }
}
//# sourceMappingURL=chainstack-client.js.map