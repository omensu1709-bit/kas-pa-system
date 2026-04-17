/**
 * KAS PA - Core Module Exports
 * SPL Krypto-Analysetool Kernkomponenten
 */

// Bridge - gRPC & WebSocket Integration
export { SolanaGRPCBridge, createBridge } from './bridge';
export type {
  SPLTokenTransfer,
  TokenMetadata,
  WalletActivity,
  NetworkMetrics,
  gRPCConfig,
  BridgeEvents,
} from './bridge';

// Paper Trading - State Management
export { PaperTradingEngine, createPaperTradingHook } from './usePaperTrading';
export type {
  Position,
  Trade,
  Order,
  PaperTradingState,
  TradingMetrics,
  TradingSettings,
  CrashSignal,
  PriceUpdate,
  PaperTradingEvents,
} from './usePaperTrading';

// Ranking Engine - Token-Ranking
export { RankingEngine, createRankingHook, LEVERAGE_TOKENS } from './ranking-engine';
export type {
  TokenRanking,
  TokenMarketData,
  RankingWeights,
  RankingConfig,
} from './ranking-engine';
