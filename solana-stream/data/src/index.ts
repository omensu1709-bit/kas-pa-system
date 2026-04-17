/**
 * Solana Crash Detection - Data Infrastructure
 * 
 * Week 1-2: Historical dataset + Pipeline
 * 
 * Usage:
 *   import { loadHistoricalData, computeMetrics } from './src/index.js';
 */

export * from './metrics/index.js';
export * from './storage/arrow-storage.js';
export * from './storage/redis-metrics-store.js';
export * from './validation/loader.js';

/**
 * Main entry point for data pipeline
 */
export async function runDataPipeline() {
  console.log('[DataPipeline] Starting...');
  
  // TODO: Implement full pipeline:
  // 1. Connect to Helius/Chainstack for historical data
  // 2. Load validation events
  // 3. Compute metrics for each event
  // 4. Store in Arrow format
  // 5. Compute rolling statistics for z-score normalization
  
  console.log('[DataPipeline] Done.');
}
