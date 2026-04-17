/**
 * KAS PA v4.0 - Central Configuration
 *
 * SINGLE SOURCE OF TRUTH for all system configuration.
 * All modules must import from here - NO hardcoded values elsewhere.
 *
 * Last Updated: 2026-04-16
 */

export const SYSTEM_CONFIG = {
  // =============================================================================
  // PAPER TRADING
  // =============================================================================
  startingCapital: 100,        // SOL - Initial capital
  maxPositions: 4,            // Max 4 simultaneous positions
  maxPositionPercent: 25,      // Max 25% of capital per position

  // =============================================================================
  // CRASH DETECTION THRESHOLDS
  // =============================================================================
  // Zone determination based on crash probability
  ignoreThreshold: 0.10,       // P < 10% = IGNORE (no action)
  monitorThreshold: 0.15,     // 10% <= P < 15% = MONITOR (watch only)
  immediateShortThreshold: 0.15, // P >= 15% = IMMEDIATE_SHORT (potential short)

  // =============================================================================
  // RISK MANAGEMENT - EXIT STRATEGY
  // =============================================================================
  // Take Profit: Close position when profit reaches this %
  takeProfitPercent: 0.15,     // +15% profit = take profit

  // Stop Loss: Close position when loss reaches this %
  stopLossPercent: 0.05,       // -5% loss = stop loss

  // Time Exit: Close position after this many hours
  maxHoldingHours: 4,         // 4 hours max holding time

  // =============================================================================
  // BAYESIAN DECISION ENGINE
  // =============================================================================
  baseConfidenceThreshold: 0.85, // 85% min confidence for decisions
  kellyFraction: 0.55,           // Kelly fraction for position sizing
  kellyMode: 'quarter',          // 'full' | 'half' | 'quarter'

  // =============================================================================
  // BACKEND TIMING
  // =============================================================================
  updateIntervalMs: 30000,       // Main loop interval: 30 seconds
  rankingIntervalMs: 1800000,    // Ranking update interval: 30 minutes

  // =============================================================================
  // WEBSOCKET
  // =============================================================================
  wsPort: 8080,
  wsHeartbeatInterval: 25000,   // Heartbeat every 25 seconds

  // =============================================================================
  // BOT DETECTION
  // =============================================================================
  botWarningThreshold: 0.95,    // 95% bot prob = warning
  botErrorThreshold: 0.99,      // 99% bot prob = error

  // =============================================================================
  // DATA FRESHNESS
  // =============================================================================
  dataStaleThresholdMs: 60000,  // 60 seconds = data is stale
} as const;

// Type for runtime config updates
export type SystemConfig = typeof SYSTEM_CONFIG;

// Convenience exports for common values
export const {
  startingCapital,
  maxPositions,
  maxPositionPercent,
  ignoreThreshold,
  monitorThreshold,
  immediateShortThreshold,
  takeProfitPercent,
  stopLossPercent,
  maxHoldingHours,
  updateIntervalMs,
  rankingIntervalMs,
  wsPort,
  wsHeartbeatInterval,
} = SYSTEM_CONFIG;
