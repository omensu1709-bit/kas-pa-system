/**
 * KAS PA v4.3 - Baseline Models B1-B5
 *
 * Einfache Baseline-Signalmodelle für Vergleich mit dem Hauptsystem.
 * Jede Baseline nutzt dieselben Eingabedaten und produziert vergleichbare Signale.
 */

import { GroundTruthRecord } from '../labels/schema.js';

// ============================================================================
// FEATURE INPUT TYPES (vereinfacht für alle Baselines)
// ============================================================================

export interface PriceData {
  price: number;
  priceChange1h: number;    // Prozent, z.B. -0.10 = -10%
  priceChange4h: number;
  priceChange24h: number;
  sma5: number;
  sma15: number;
  volume24h: number;
  avgVolume7d: number;
}

export interface BotData {
  botProbability: number;   // 0-1
  jitoBundleCount: number;
  sandwichCount: number;
  liquidationCount: number;
}

export interface OrderFlowData {
  tfi: number;             // -1 bis 1
  buyVolume: number;
  sellVolume: number;
  volumeRatio: number;      // 0 bis 1
}

export interface MarketData {
  prices: Map<string, PriceData>;
  bots: Map<string, BotData>;
  orderFlows: Map<string, OrderFlowData>;
  timestamp: number;
}

// ============================================================================
// SIGNAL OUTPUT TYPE (einheitlich für alle Baselines)
// ============================================================================

export interface BaselineSignal {
  symbol: string;
  baseline: 'B1' | 'B2' | 'B3' | 'B4' | 'B5';
  timestamp: number;
  score: number;           // 0-1, Signalstärke
  decision: 'SHORT' | 'IGNORE' | 'MONITOR';
  confidence: number;      // 0-1
  reason: string;           // Kurze Begründung
  features: Record<string, number>; // Snapshot der verwendeten Features
}

export interface BaselineResult {
  baseline: string;
  signals: BaselineSignal[];
  stats: {
    totalSignals: number;
    shortSignals: number;
    monitorSignals: number;
    ignoreSignals: number;
  };
}

// ============================================================================
// BASELINE B1: RANDOM CLASSIFIER
// ============================================================================

export class RandomBaseline {
  name = 'B1_Random';
  description = 'Zufällige Entscheidung (Benchmark Untergrenze)';

  generateSignals(tokens: string[], _marketData: MarketData): BaselineSignal[] {
    return tokens.map(token => {
      const randomScore = Math.random();
      const decision = randomScore > 0.5 ? 'SHORT' : 'IGNORE';

      return {
        symbol: token,
        baseline: 'B1',
        timestamp: Date.now(),
        score: randomScore,
        decision,
        confidence: 0.5, // Random hat 50% Confidence
        reason: 'Random decision (baseline B1)',
        features: { random: randomScore },
      };
    });
  }
}

// ============================================================================
// BASELINE B2: PRICE MOMENTUM / SMA CROSS
// ============================================================================

export class PriceMomentumBaseline {
  name = 'B2_PriceMomentum';
  description = 'SMA-Crossdown + Preisverlust (Technische Analyse)';

  generateSignals(tokens: string[], marketData: MarketData): BaselineSignal[] {
    return tokens.map(token => {
      const priceData = marketData.prices.get(token);
      if (!priceData) {
        return this.noSignal(token, 'No price data');
      }

      const smaCross = priceData.sma5 < priceData.sma15 ? 1 : 0; // 1 = bearish
      const priceMomentum = priceData.priceChange1h < -0.05 ? 1 : 0;

      // Score = Kombination aus SMA Cross und Preisverlust
      const score = (smaCross * 0.6 + priceMomentum * 0.4) / 1;

      // Entscheidung
      let decision: 'SHORT' | 'IGNORE' | 'MONITOR' = 'IGNORE';
      if (smaCross === 1 && priceData.priceChange1h < -0.10) {
        decision = 'SHORT';
      } else if (smaCross === 1 || priceData.priceChange1h < -0.05) {
        decision = 'MONITOR';
      }

      return {
        symbol: token,
        baseline: 'B2',
        timestamp: marketData.timestamp,
        score,
        decision,
        confidence: score,
        reason: smaCross === 1
          ? 'SMA Crossdown bearish'
          : 'Price momentum insufficient',
        features: {
          smaCross,
          priceMomentum,
          priceChange1h: priceData.priceChange1h,
          sma5: priceData.sma5,
          sma15: priceData.sma15,
        },
      };
    });
  }

  private noSignal(token: string, reason: string): BaselineSignal {
    return {
      symbol: token,
      baseline: 'B2',
      timestamp: Date.now(),
      score: 0,
      decision: 'IGNORE',
      confidence: 0,
      reason,
      features: {},
    };
  }
}

// ============================================================================
// BASELINE B3: VOLUME SPIKE
// ============================================================================

export class VolumeSpikeBaseline {
  name = 'B3_VolumeSpike';
  description = 'Volume > 3x Mean + Preisverlust';

  private readonly volumeThreshold = 3.0;    // 3x durchschnittliches Volume
  private readonly priceDropThreshold = -0.10; // -10% Preisverlust

  generateSignals(tokens: string[], marketData: MarketData): BaselineSignal[] {
    return tokens.map(token => {
      const priceData = marketData.prices.get(token);
      if (!priceData) {
        return this.noSignal(token, 'No price data');
      }

      const volumeSpike = priceData.volume24h / priceData.avgVolume7d;
      const hasVolumeSpike = volumeSpike >= this.volumeThreshold;
      const hasPriceDrop = priceData.priceChange24h <= this.priceDropThreshold;

      // Score = Kombination
      const score = Math.min(1, (volumeSpike / this.volumeThreshold) * 0.5 +
        (hasPriceDrop ? 0.5 : 0));

      // Entscheidung
      let decision: 'SHORT' | 'IGNORE' | 'MONITOR' = 'IGNORE';
      if (hasVolumeSpike && hasPriceDrop) {
        decision = 'SHORT';
      } else if (hasVolumeSpike || hasPriceDrop) {
        decision = 'MONITOR';
      }

      return {
        symbol: token,
        baseline: 'B3',
        timestamp: marketData.timestamp,
        score,
        decision,
        confidence: hasVolumeSpike && hasPriceDrop ? 0.8 : score * 0.5,
        reason: hasVolumeSpike && hasPriceDrop
          ? 'Volume spike + price drop'
          : hasVolumeSpike
            ? 'Volume spike only'
            : 'Insufficient volume spike',
        features: {
          volumeSpike,
          volume24h: priceData.volume24h,
          avgVolume7d: priceData.avgVolume7d,
          priceChange24h: priceData.priceChange24h,
        },
      };
    });
  }

  private noSignal(token: string, reason: string): BaselineSignal {
    return {
      symbol: token,
      baseline: 'B3',
      timestamp: Date.now(),
      score: 0,
      decision: 'IGNORE',
      confidence: 0,
      reason,
      features: {},
    };
  }
}

// ============================================================================
// BASELINE B4: BOT-ONLY
// ============================================================================

export class BotOnlyBaseline {
  name = 'B4_BotOnly';
  description = 'Bot-Aktivität hoch + Preisverlust';

  private readonly botThreshold = 0.70;      // 70% Bot Probability
  private readonly priceDropThreshold = -0.15; // -15% in 4h

  generateSignals(tokens: string[], marketData: MarketData): BaselineSignal[] {
    return tokens.map(token => {
      const priceData = marketData.prices.get(token);
      const botData = marketData.bots.get(token);

      if (!priceData || !botData) {
        return this.noSignal(token, 'Missing data');
      }

      const highBotActivity = botData.botProbability >= this.botThreshold;
      const hasPriceDrop = priceData.priceChange4h <= this.priceDropThreshold;

      // Score = Bot Probability Gewichtung
      const score = botData.botProbability *
        (highBotActivity && hasPriceDrop ? 1.0 : 0.6);

      // Entscheidung
      let decision: 'SHORT' | 'IGNORE' | 'MONITOR' = 'IGNORE';
      if (highBotActivity && hasPriceDrop) {
        decision = 'SHORT';
      } else if (highBotActivity) {
        decision = 'MONITOR';
      }

      return {
        symbol: token,
        baseline: 'B4',
        timestamp: marketData.timestamp,
        score,
        decision,
        confidence: highBotActivity ? 0.7 : 0.4,
        reason: highBotActivity
          ? 'High bot activity detected'
          : 'Bot activity below threshold',
        features: {
          botProbability: botData.botProbability,
          jitoBundleCount: botData.jitoBundleCount,
          sandwichCount: botData.sandwichCount,
          liquidationCount: botData.liquidationCount,
          priceChange4h: priceData.priceChange4h,
        },
      };
    });
  }

  private noSignal(token: string, reason: string): BaselineSignal {
    return {
      symbol: token,
      baseline: 'B4',
      timestamp: Date.now(),
      score: 0,
      decision: 'IGNORE',
      confidence: 0,
      reason,
      features: {},
    };
  }
}

// ============================================================================
// BASELINE B5: HEURISTIC 3/5
// ============================================================================

export class Heuristic35Baseline {
  name = 'B5_Heuristic35';
  description = '3 von 5 einfachen Bedingungen erfüllt';

  private readonly conditions = {
    priceChange1h: -0.05,
    volumeSpike: 2.0,
    botProbability: 0.60,
    priceChange4h: -0.10,
    liquidityDrop: 0.30,
  };

  generateSignals(tokens: string[], marketData: MarketData): BaselineSignal[] {
    return tokens.map(token => {
      const priceData = marketData.prices.get(token);
      const botData = marketData.bots.get(token);
      const orderFlowData = marketData.orderFlows.get(token);

      if (!priceData) {
        return this.noSignal(token, 'No price data');
      }

      // Prüfe 5 Bedingungen
      const checks = {
        c1: priceData.priceChange1h <= this.conditions.priceChange1h,
        c2: priceData.volume24h / priceData.avgVolume7d >= this.conditions.volumeSpike,
        c3: botData ? botData.botProbability >= this.conditions.botProbability : false,
        c4: priceData.priceChange4h <= this.conditions.priceChange4h,
        c5: orderFlowData ? orderFlowData.tfi < -this.conditions.liquidityDrop : false,
      };

      const count = Object.values(checks).filter(Boolean).length;
      const score = count / 5;

      // Entscheidung: 3/5 = SHORT, 2/5 = MONITOR, <2 = IGNORE
      let decision: 'SHORT' | 'IGNORE' | 'MONITOR' = 'IGNORE';
      if (count >= 3) {
        decision = 'SHORT';
      } else if (count >= 2) {
        decision = 'MONITOR';
      }

      return {
        symbol: token,
        baseline: 'B5',
        timestamp: marketData.timestamp,
        score,
        decision,
        confidence: count >= 3 ? 0.8 : count >= 2 ? 0.5 : 0.3,
        reason: `Conditions met: ${count}/5 (c1=${checks.c1}, c2=${checks.c2}, c3=${checks.c3}, c4=${checks.c4}, c5=${checks.c5})`,
        features: {
          priceChange1h: priceData.priceChange1h,
          volumeSpike: priceData.volume24h / priceData.avgVolume7d,
          botProbability: botData?.botProbability || 0,
          priceChange4h: priceData.priceChange4h,
          tfi: orderFlowData?.tfi || 0,
          count,
        },
      };
    });
  }

  private noSignal(token: string, reason: string): BaselineSignal {
    return {
      symbol: token,
      baseline: 'B5',
      timestamp: Date.now(),
      score: 0,
      decision: 'IGNORE',
      confidence: 0,
      reason,
      features: {},
    };
  }
}

// ============================================================================
// BASELINE RUNNER (aggregiert alle Baselines)
// ============================================================================

export class BaselineRunner {
  private baselines: Map<string, any> = new Map();

  constructor() {
    this.baselines.set('B1', new RandomBaseline());
    this.baselines.set('B2', new PriceMomentumBaseline());
    this.baselines.set('B3', new VolumeSpikeBaseline());
    this.baselines.set('B4', new BotOnlyBaseline());
    this.baselines.set('B5', new Heuristic35Baseline());
  }

  runAll(tokens: string[], marketData: MarketData): Map<string, BaselineSignal[]> {
    const results = new Map<string, BaselineSignal[]>();

    for (const [name, baseline] of this.baselines) {
      try {
        const signals = baseline.generateSignals(tokens, marketData);
        results.set(name, signals);
      } catch (error) {
        console.error(`Error running ${name}:`, error);
        results.set(name, []);
      }
    }

    return results;
  }

  runSingle(baselineName: 'B1' | 'B2' | 'B3' | 'B4' | 'B5',
            tokens: string[], marketData: MarketData): BaselineSignal[] {
    const baseline = this.baselines.get(baselineName);
    if (!baseline) {
      throw new Error(`Unknown baseline: ${baselineName}`);
    }
    return baseline.generateSignals(tokens, marketData);
  }

  listBaselines(): { name: string; description: string }[] {
    return Array.from(this.baselines.values()).map(b => ({
      name: b.name,
      description: b.description,
    }));
  }
}

// Export singleton
export const baselineRunner = new BaselineRunner();