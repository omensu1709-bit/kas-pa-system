export interface ConsensusSignal {
  symbol: string;
  signals: {
    crashProb: boolean;
    priceVelocity: boolean;
    orderBook: boolean;
    botActivity: boolean;
    sentiment: boolean;
  };
  consensusCount: number;
  consensusScore: number;
  recommendation: 'STRONG_SHORT' | 'WEAK_SHORT' | 'IGNORE';
}

class MultiSignalConsensus {
  evaluate(
    symbol: string,
    crashProb: number,
    botProbability: number,
    velocityBoost: number,
    orderBookBoost: number
  ): ConsensusSignal {
    const signals = {
      crashProb: crashProb > 0.15,
      priceVelocity: velocityBoost > 0.1,
      orderBook: orderBookBoost > 0.1,
      botActivity: botProbability < 0.95,
      sentiment: false // Placeholder
    };

    const count = Object.values(signals).filter(Boolean).length;
    const weights = { crashProb: 0.3, priceVelocity: 0.25, orderBook: 0.2, botActivity: 0.15, sentiment: 0.1 };
    const score = Object.entries(signals).reduce((sum, [key, val]) => sum + (val ? weights[key as keyof typeof weights] : 0), 0);

    let recommendation: 'STRONG_SHORT' | 'WEAK_SHORT' | 'IGNORE';
    if (count >= 3) recommendation = 'STRONG_SHORT';
    else if (count >= 2) recommendation = 'WEAK_SHORT';
    else recommendation = 'IGNORE';

    return { symbol, signals, consensusCount: count, consensusScore: score, recommendation };
  }
}

export function logConsensus(consensus: ConsensusSignal) {
  console.log(`[Consensus] ${consensus.symbol} | Count: ${consensus.consensusCount} | Rec: ${consensus.recommendation}`);
}

export const consensusEngine = new MultiSignalConsensus();
