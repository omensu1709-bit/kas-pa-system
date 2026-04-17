/**
 * Consensus Engine - Triple Validation for Short Predictions
 *
 * Combines 3 independent layers:
 * - Market Layer (DexScreener)
 * - OnChain Layer (Helius)
 * - Network Layer (Chainstack)
 *
 * Requires 2 of 3 layers to agree for a SHORT signal.
 * Provides confidence-weighted consensus score.
 */
import type { MarketLayer } from './layer1-market.js';
import type { OnChainLayer } from './layer2-onchain.js';
import type { NetworkLayer } from './layer3-network.js';
export interface SignalLayer {
    layer: 'Market' | 'OnChain' | 'Network';
    score: number;
    confidence: number;
}
export interface Prediction {
    action: 'IGNORE' | 'MONITOR' | 'SHORT';
    confidence: number;
    consensus: number;
    expectedDrop: number;
    timeframe: number;
    positionSize: number;
    layersAgreeing: number;
    reasons: string[];
}
export interface ConsensusResult {
    consensus: number;
    layers: SignalLayer[];
    layersAgreeing: number;
    highSignalLayers: string[];
}
/**
 * Calculates consensus score from 3 layers.
 * Requires minimum 2 layers agreeing (score > 0.6).
 *
 * @returns ConsensusResult with detailed breakdown
 */
export declare function calculateConsensus(marketLayer: MarketLayer, onChainLayer: OnChainLayer, networkLayer: NetworkLayer): ConsensusResult;
/**
 * Makes trading decision based on consensus and signal strengths.
 *
 * @returns Prediction with action, sizing, and reasoning
 */
export declare function makeDecision(marketLayer: MarketLayer, onChainLayer: OnChainLayer, networkLayer: NetworkLayer, symbol: string, currentPrice: number): Prediction;
/**
 * Assesses the severity of a potential dump.
 */
export declare function assessSeverity(marketLayer: MarketLayer, onChainLayer: OnChainLayer): {
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    score: number;
};
export interface PredictionRecord {
    timestamp: number;
    mint: string;
    symbol: string;
    prediction: Prediction;
    marketLayerScore: number;
    onChainLayerScore: number;
    networkLayerScore: number;
    consensus: number;
    currentPrice: number;
}
/**
 * Logs prediction for later accuracy analysis.
 */
export declare function logPrediction(prediction: Prediction, mint: string, symbol: string, marketLayer: MarketLayer, onChainLayer: OnChainLayer, networkLayer: NetworkLayer, currentPrice: number): PredictionRecord;
