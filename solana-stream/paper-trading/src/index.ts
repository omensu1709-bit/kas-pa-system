/**
 * Paper Trading Module - Main Entry Point
 *
 * Usage:
 * import { PaperTradingEngine } from './src/index.js';
 */

export { PaperTradingEngine } from './engine/paper-trading-engine.js';
export { HashChain } from './crypto/hash-chain.js';
export { BlockchainAnchor } from './crypto/blockchain-anchor.js';
export { MultiSourceOracle } from './oracle/multi-source-oracle.js';
export { HeliusPriceSource, ChainstackPriceSource, JupiterPriceSource, MockPriceSource } from './oracle/price-sources.js';
export { AntiManipulationGuards } from './guards/anti-manipulation.js';
export { AuditLogger } from './audit/audit-logger.js';
export { InvestorAPI } from './api/investor-api.js';

// Crash Trading exports
export { CrashSignalAdapter } from './crash-signal-adapter.js';
export { CrashPaperTradingRunner } from './crash-paper-trading-runner.js';
export { PredictionLogger } from './crash-prediction-logger.js';
export type { CrashSignal, CrashTradingConfig, SignalZone, SignalProcessingResult } from './crash-signal-adapter.js';
export type { PredictionRecord, PredictionSummary, RawMetrics, ZScores } from './crash-prediction-logger.js';

// Re-exports types
export type {
  EngineConfig,
  Position,
  Trade,
  ClosedTrade,
  OpenPositionResult,
  ClosePositionResult,
  PerformanceStats,
  VerificationReport,
  ExportedData
} from './engine/paper-trading-engine.js';
