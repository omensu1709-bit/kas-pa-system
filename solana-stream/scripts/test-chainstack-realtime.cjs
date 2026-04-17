/**
 * Test Chainstack Connection with Real Solana Data
 * 
 * Uses CommonJS require for compatibility.
 */

const grpc = require('@triton-one/yellowstone-grpc');

// Chainstack credentials
const CHAINSTACK_ENDPOINT = 'yellowstone-solana-mainnet.core.chainstack.com:443';
const CHAINSTACK_TOKEN = 'ac8087135c7768aba464e0d8a24bfba9';

class RealTimeCrashDetector {
  constructor() {
    this.txCount = 0;
    this.fees = [];
    this.accountUpdates = 0;
    this.slots = [];
    this.startTime = Date.now();
    this.snapshots = [];
    this.stream = null;
    this.client = null;
  }

  async connect() {
    console.log('='.repeat(60));
    console.log('CHAINSTACK REAL-TIME CONNECTION TEST');
    console.log('='.repeat(60));
    console.log(`Endpoint: ${CHAINSTACK_ENDPOINT}`);
    console.log(`Token: ${CHAINSTACK_TOKEN.substring(0, 10)}...`);
    console.log('');

    // Create client - positional arguments!
    this.client = new grpc.default(
      CHAINSTACK_ENDPOINT,  // endpoint with port
      CHAINSTACK_TOKEN      // x-token
    );

    console.log('Connecting to Solana mainnet...');

    // Connect first
    await this.client.connect();
    console.log('Connected. Subscribing to transactions...');

    // Build subscription - all transactions
    const request = {
      transactions: {
        all: {
          vote: false,
          failed: false,
        },
      },
      commitment: 'confirmed',
    };

    this.stream = await this.client.subscribe(request);

    this.stream.on('data', (data) => {
      const slot = data.slot || 0;
      const timestamp = Date.now();

      this.txCount++;
      this.slots.push(slot);

      // Extract fee
      if (data.transaction && data.transaction.meta && data.transaction.meta.fee) {
        this.fees.push(data.transaction.meta.fee);
      }

      // Count account updates
      if (data.account) {
        this.accountUpdates++;
      }

      // Record snapshot every 50 transactions
      if (this.txCount % 50 === 0) {
        this.recordSnapshot(slot, timestamp);
      }
    });

    this.stream.on('end', () => {
      console.log('[Stream] Connection ended');
    });

    this.stream.on('error', (error) => {
      console.error('[Stream] Error:', error?.message || error);
    });

    console.log('[Connected] Streaming real Solana data...');
    console.log('');
  }

  recordSnapshot(slot, timestamp) {
    const recentFees = this.fees.slice(-50);
    const avgFee = recentFees.length > 0
      ? recentFees.reduce((a, b) => a + b, 0) / recentFees.length
      : 0;

    const elapsed = (timestamp - this.startTime) / 1000;
    const txPerSecond = this.txCount / elapsed;

    console.log(`[${new Date(timestamp).toISOString()}]`);
    console.log(`  Slot: ${slot}`);
    console.log(`  Total TXs: ${this.txCount}`);
    console.log(`  TX/s: ${txPerSecond.toFixed(2)}`);
    console.log(`  Avg Fee: ${(avgFee / 1e9).toFixed(6)} SOL`);
    console.log(`  Account Updates: ${this.accountUpdates}`);
    console.log('');
  }

  getStats() {
    const elapsed = (Date.now() - this.startTime) / 1000;
    return {
      totalTransactions: this.txCount,
      totalAccountUpdates: this.accountUpdates,
      elapsedSeconds: elapsed,
      txPerSecond: this.txCount / elapsed,
      avgFeeLamports: this.fees.length > 0
        ? this.fees.reduce((a, b) => a + b, 0) / this.fees.length
        : 0,
    };
  }

  async stop() {
    if (this.stream) {
      try { this.stream.destroy(); } catch (e) {}
    }
    if (this.client) {
      try { await this.client.close(); } catch (e) {}
    }
  }
}

async function main() {
  const detector = new RealTimeCrashDetector();

  try {
    await detector.connect();

    // Run for 30 seconds
    await new Promise(resolve => setTimeout(resolve, 30000));

    console.log('='.repeat(60));
    console.log('CONNECTION TEST COMPLETE');
    console.log('='.repeat(60));

    const stats = detector.getStats();
    console.log('\nSummary:');
    console.log(`  Total Transactions: ${stats.totalTransactions}`);
    console.log(`  TX/Second: ${stats.txPerSecond.toFixed(2)}`);
    console.log(`  Avg Fee: ${(stats.avgFeeLamports / 1e9).toFixed(6)} SOL`);
    console.log(`  Account Updates: ${stats.totalAccountUpdates}`);
    console.log('');

    if (stats.totalTransactions > 0) {
      console.log('✓ SUCCESS: Received real Solana data from Chainstack');
      console.log('  The system can now be calibrated with real network activity.');
    } else {
      console.log('✗ FAILED: No data received');
    }

  } catch (error) {
    console.error('Connection failed:', error.message || error);
    console.log('');
    console.log('Possible issues:');
    console.log('  1. Invalid API token');
    console.log('  2. Network connectivity');
    console.log('  3. gRPC port blocked');
  } finally {
    await detector.stop();
  }

  process.exit(0);
}

main();
