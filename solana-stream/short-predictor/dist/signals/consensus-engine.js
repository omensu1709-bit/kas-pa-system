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
// ============================================================================
// CONSENSUS CALCULATOR
// ============================================================================
/**
 * Calculates consensus score from 3 layers.
 * Requires minimum 2 layers agreeing (score > 0.6).
 *
 * @returns ConsensusResult with detailed breakdown
 */
export function calculateConsensus(marketLayer, onChainLayer, networkLayer) {
    const layers = [
        { layer: 'Market', score: marketLayer.score, confidence: marketLayer.confidence },
        { layer: 'OnChain', score: onChainLayer.score, confidence: onChainLayer.confidence },
        { layer: 'Network', score: networkLayer.score, confidence: networkLayer.confidence }
    ];
    // Count layers with high signals (score > 0.6)
    const highScoreLayers = layers.filter(l => l.score > 0.6);
    const layersAgreeing = highScoreLayers.length;
    // List high signal layers for reporting
    const highSignalLayers = highScoreLayers.map(l => l.layer);
    // No consensus if less than 2 layers agree
    if (layersAgreeing < 2) {
        return {
            consensus: 0,
            layers,
            layersAgreeing,
            highSignalLayers
        };
    }
    // Weighted average by confidence
    let weightedSum = 0;
    let totalWeight = 0;
    for (const layer of layers) {
        weightedSum += layer.score * layer.confidence;
        totalWeight += layer.confidence;
    }
    let consensus = totalWeight > 0 ? weightedSum / totalWeight : 0;
    // Bonus for 3-layer agreement (manipulation resistance)
    if (layersAgreeing === 3) {
        consensus = Math.min(0.99, consensus + 0.15);
    }
    return {
        consensus: Math.min(0.99, consensus),
        layers,
        layersAgreeing,
        highSignalLayers
    };
}
// ============================================================================
// DECISION MATRIX
// ============================================================================
/**
 * Makes trading decision based on consensus and signal strengths.
 *
 * @returns Prediction with action, sizing, and reasoning
 */
export function makeDecision(marketLayer, onChainLayer, networkLayer, symbol, currentPrice) {
    const result = calculateConsensus(marketLayer, onChainLayer, networkLayer);
    // Extract signal strengths for decision
    const sellAccel = marketLayer.signals.sellAcceleration;
    const whalePressure = onChainLayer.signals.whaleSellPressure;
    const volumeDiv = marketLayer.signals.volumePriceDivergence;
    // Build reasons
    const reasons = [];
    if (marketLayer.signals.sellAcceleration > 0.6)
        reasons.push(`Sell acceleration ${(marketLayer.signals.sellAcceleration * 100).toFixed(0)}%`);
    if (marketLayer.signals.buySellImbalance > 0.6)
        reasons.push(`${(marketLayer.signals.buySellImbalance * 100).toFixed(0)}% sells`);
    if (volumeDiv > 0.5)
        reasons.push(`Volume-price divergence`);
    if (whalePressure > 0.3)
        reasons.push(`Whale sell pressure ${(whalePressure * 100).toFixed(0)}%`);
    if (onChainLayer.signals.uniqueSellerSurge > 0.5)
        reasons.push(`Mass seller exodus`);
    // HIGH CONFIDENCE SHORT (3 layers agree OR 2 layers + strong signals)
    if ((result.consensus > 0.80 && sellAccel > 0.75 && whalePressure > 0.40) ||
        (result.consensus > 0.75 && result.layersAgreeing >= 3)) {
        return {
            action: 'SHORT',
            confidence: result.consensus,
            consensus: result.consensus,
            expectedDrop: 0.055, // 5.5%
            timeframe: 5,
            positionSize: 15, // Aggressive for high confidence
            layersAgreeing: result.layersAgreeing,
            reasons
        };
    }
    // MEDIUM CONFIDENCE SHORT (2 layers agree, moderate signals)
    if (result.consensus > 0.65 && sellAccel > 0.60) {
        return {
            action: 'SHORT',
            confidence: result.consensus,
            consensus: result.consensus,
            expectedDrop: 0.035, // 3.5%
            timeframe: 15,
            positionSize: 8, // Conservative
            layersAgreeing: result.layersAgreeing,
            reasons
        };
    }
    // LOW CONFIDENCE SHORT (consensus > 0.5 but weak signals)
    if (result.consensus > 0.50) {
        return {
            action: 'MONITOR',
            confidence: result.consensus,
            consensus: result.consensus,
            expectedDrop: 0.025, // 2.5% (may not hit)
            timeframe: 30,
            positionSize: 0,
            layersAgreeing: result.layersAgreeing,
            reasons
        };
    }
    // NO ACTION
    return {
        action: 'IGNORE',
        confidence: result.consensus,
        consensus: result.consensus,
        expectedDrop: 0,
        timeframe: 0,
        positionSize: 0,
        layersAgreeing: result.layersAgreeing,
        reasons: result.layersAgreeing > 0 ? [`${result.layersAgreeing} layer(s) showing signals`] : ['No strong signals']
    };
}
// ============================================================================
// SEVERITY ASSESSMENT
// ============================================================================
/**
 * Assesses the severity of a potential dump.
 */
export function assessSeverity(marketLayer, onChainLayer) {
    let score = 0;
    // Market signals
    if (marketLayer.signals.sellAcceleration > 0.8)
        score += 0.25;
    else if (marketLayer.signals.sellAcceleration > 0.6)
        score += 0.15;
    if (marketLayer.signals.volumePriceDivergence > 0.8)
        score += 0.25;
    else if (marketLayer.signals.volumePriceDivergence > 0.5)
        score += 0.10;
    if (marketLayer.signals.buySellImbalance > 0.70)
        score += 0.15;
    if (marketLayer.signals.liquidityDrainage > 0.6)
        score += 0.20; // Rug pull risk
    // OnChain signals
    if (onChainLayer.signals.whaleSellPressure > 0.5)
        score += 0.20;
    if (onChainLayer.signals.uniqueSellerSurge > 0.7)
        score += 0.15;
    // Classify severity
    let severity;
    if (score >= 0.75)
        severity = 'CRITICAL';
    else if (score >= 0.55)
        severity = 'HIGH';
    else if (score >= 0.35)
        severity = 'MEDIUM';
    else
        severity = 'LOW';
    return { severity, score };
}
/**
 * Logs prediction for later accuracy analysis.
 */
export function logPrediction(prediction, mint, symbol, marketLayer, onChainLayer, networkLayer, currentPrice) {
    const record = {
        timestamp: Date.now(),
        mint,
        symbol,
        prediction,
        marketLayerScore: marketLayer.score,
        onChainLayerScore: onChainLayer.score,
        networkLayerScore: networkLayer.score,
        consensus: prediction.consensus,
        currentPrice
    };
    console.log(`[Consensus] ${symbol}: ${prediction.action} | Confidence: ${(prediction.confidence * 100).toFixed(0)}% | Layers: ${prediction.layersAgreeing}/3`);
    if (prediction.reasons.length > 0) {
        console.log(`  Reasons: ${prediction.reasons.join(', ')}`);
    }
    return record;
}
