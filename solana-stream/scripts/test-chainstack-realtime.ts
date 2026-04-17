/**
 * Test Chainstack Connection with Real Solana Data
 * 
 * This script connects to Chainstack and verifies real-time data.
 * Then integrates with the crash detection metrics.
 */

import { GrpcClient, SubscribeRequest } from '@triton-one/yellowstone-grpc';

// Chainstack credentials from Zugangsdatenchainstack.txt
const CHAINSTACK_ENDPOINT = 'yellowstone-solana-mainnet.core.chainstack.com';
const CHAINSTACK_TOKEN = 'ac8087135c7768aba464e0d8a24bfba9';

interface MetricSnapshot {
  slot: number;
  timestamp: number;
  txCount: number;
  avgFee: number;
  accountUpdates: number;
}

class RealTimeCrashDetector {
  private txCount = 0;
  private fees: number[] = [];
  private accountUpdates = 0;
  private slots: number[] = [];
  private startTime = Date.now();
  private snapshots: MetricSnapshot[] = [];

  async connect(): Promise<void> {
    console.log('='.repeat(60));
    console.log('CHAINSTACK REAL-TIME CONNECTION TEST');
    console.log('='.repeat(60));
    console.log(`Endpoint: ${CHAINSTACK_ENDPOINT}`);
    console.log(`Token: ${CHAINSTACK_TOKEN.substring(0, 10)}...`);
    console.log('');

    const client = new GrpcClient({
      url: `${CHAINSTACK_ENDPOINT}:443`,
      token: CHAINSTACK_TOKEN,
    });

    // Subscribe to all transactions (simplified filter)
    const request: SubscribeRequest = {
      transactions: {
        all: {
          vote: false,
          failed: false,
        },
      },
      commitment: 'confirmed',
    };

    console.log('Connecting to Solana mainnet...');

    const stream = await client.subscribe(request);

    stream.on('data', (data: any) => {
      const slot = data.slot || 0;
      const timestamp = Date.now();

      this.txCount++;
      this.slots.push(slot);

      // Extract fee from transaction
      if (data.transaction?.meta?.fee) {
        this.fees.push(data.transaction.meta.fee);
      }

      // Count account updates
      if (data.account) {
        this.accountUpdates++;
      }

      // Record snapshot every 100 transactions
      if (this.txCount % 100 === 0) {
        this.recordSnapshot(slot, timestamp);
      }
    });

    stream.on('end', () => {
      console.log('[Stream] Connection ended');
    });

    stream.on('error', (error: any) => {
      console.error('[Stream] Error:', error?.message || error);
    });

    // Keep connection alive
    console.log('[Connected] Streaming real Solana data...');
    console.log('');
  }

  private recordSnapshot(slot: number, timestamp: number): void {
    const recentFees = this.fees.slice(-100);
    const avgFee = recentFees.length > 0
      ? recentFees.reduce((a, b) => a + b, 0) / recentFees.length
      : 0;

    const snapshot: MetricSnapshot = {
      slot,
      timestamp,
      txCount: this.txCount,
      avgFee,
      accountUpdates: this.accountUpdates,
    };

    this.snapshots.push(snapshot);

    // Calculate some basic metrics
    const elapsed = (timestamp - this.startTime) / 1000;
    const txPerSecond = this.txCount / elapsed;

    console.log(`[${new Date(timestamp).toISOString()}]`);
    console.log(`  Slot: ${slot}`);
    console.log(`  Total TXs: ${this.txCount}`);
    console.log(`  TX/s: ${txPerSecond.toFixed(2)}`);
    console.log(`  Avg Fee: ${(avgFee / 1e9).toFixed(4)} SOL`);
    console.log(`  Account Updates: ${this.accountUpdates}`);
    console.log('');
  }

  getMetrics(): MetricSnapshot[] {
    return this.snapshots;
  }

  getStats(): any {
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
}

// Run for a limited time to test
async function main() {
  const detector = new RealTimeCrashDetector();

  try {
    await detector.connect();

    // Run for 30 seconds then summarize
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
    console.error('Connection failed:', error);
    console.log('');
    console.log('Possible issues:');
    console.log('  1. Invalid API token');
    console.log('  2. Network connectivity');
    console.log('  3. gRPC port blocked');
  }

  process.exit(0);
}

main();
