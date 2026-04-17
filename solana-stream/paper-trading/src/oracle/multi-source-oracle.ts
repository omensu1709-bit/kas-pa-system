import CryptoJS from 'crypto-js';

/**
 * Multi-Source Price Oracle
 * Kombiniert Preise von 3 unabhängigen Quellen
 * Berechnet Median für Manipulation-Resistenz
 */
export class MultiSourceOracle {
  private sources: PriceSource[] = [];
  private manipulationFlags: Map<string, ManipulationAlert> = new Map();
  private maxDeviationPercent = 2; // 2% max Abweichung vom Median

  constructor(sources: PriceSource[]) {
    this.sources = sources;
  }

  /**
   * Holt verifizierten Preis von allen Quellen
   * Berechnet Median und prüft auf Manipulation
   */
  async getVerifiedPrice(tokenMint: string): Promise<VerifiedPrice> {
    const prices: PriceData[] = [];
    const errors: string[] = [];

    // Hole Preise von allen Quellen parallel
    const results = await Promise.allSettled(
      this.sources.map(source => source.getPrice(tokenMint))
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const source = this.sources[i];

      if (result.status === 'fulfilled') {
        prices.push({
          source: source.name,
          price: result.value.price,
          slot: result.value.slot,
          timestamp: result.value.timestamp
        });
      } else {
        errors.push(`${source.name}: ${result.reason}`);
      }
    }

    if (prices.length === 0) {
      throw new Error(`Keine Preisquellen verfügbar: ${errors.join(', ')}`);
    }

    // Berechne Median
    const medianPrice = this.calculateMedian(prices.map(p => p.price));

    // Prüfe auf Manipulation
    for (const priceData of prices) {
      const deviation = Math.abs(priceData.price - medianPrice) / medianPrice * 100;
      if (deviation > this.maxDeviationPercent) {
        this.flagManipulation(priceData.source, tokenMint, priceData.price, medianPrice, deviation);
      }
    }

    // Berechne Hash für Integrität
    const priceHash = this.hashPriceData(tokenMint, medianPrice, prices);

    return {
      token: tokenMint,
      price: medianPrice,
      sources: prices,
      sourceCount: prices.length,
      verifiedAt: Date.now(),
      hash: priceHash,
      manipulationAlerts: this.getManipulationAlerts(tokenMint)
    };
  }

  /**
   * Berechnet Median - nicht manipulierbar durch einzelne Quelle
   */
  private calculateMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;

    if (n % 2 === 0) {
      return (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
    }
    return sorted[Math.floor(n / 2)];
  }

  /**
   * Erstellt kryptographischen Hash der Preisdaten
   */
  private hashPriceData(token: string, price: number, sources: PriceData[]): string {
    const data = {
      token,
      price,
      sources: sources.map(s => ({ n: s.source, p: s.price })),
      timestamp: Date.now()
    };
    return CryptoJS.SHA256(JSON.stringify(data)).toString();
  }

  /**
   * Markiert mögliche Manipulation
   */
  private flagManipulation(
    source: string,
    token: string,
    reportedPrice: number,
    medianPrice: number,
    deviationPercent: number
  ): void {
    const alert: ManipulationAlert = {
      id: CryptoJS.SHA256(`${source}:${token}:${Date.now()}`).toString().substring(0, 16),
      source,
      token,
      reportedPrice,
      medianPrice,
      deviationPercent,
      timestamp: Date.now()
    };

    const key = `${source}:${token}`;
    this.manipulationFlags.set(key, alert);

    console.warn(
      `[MANIPULATION ALERT] ${source} für ${token}: ` +
      `${reportedPrice} (Median: ${medianPrice}, Abweichung: ${deviationPercent.toFixed(2)}%)`
    );
  }

  /**
   * Gibt Manipulation-Alerts für einen Token zurück
   */
  private getManipulationAlerts(token: string): ManipulationAlert[] {
    const alerts: ManipulationAlert[] = [];
    for (const [key, alert] of this.manipulationFlags.entries()) {
      if (key.endsWith(`:${token}`) && alert.timestamp > Date.now() - 3600000) {
        alerts.push(alert);
      }
    }
    return alerts;
  }

  /**
   * Fügt eine neue Preisquelle hinzu
   */
  addSource(source: PriceSource): void {
    this.sources.push(source);
  }

  /**
   * Setzt max erlaubte Abweichung
   */
  setMaxDeviation(percent: number): void {
    this.maxDeviationPercent = percent;
  }
}

export interface PriceSource {
  name: string;
  getPrice(tokenMint: string): Promise<{ price: number; slot: number; timestamp: number }>;
}

export interface PriceData {
  source: string;
  price: number;
  slot: number;
  timestamp: number;
}

export interface VerifiedPrice {
  token: string;
  price: number;
  sources: PriceData[];
  sourceCount: number;
  verifiedAt: number;
  hash: string;
  manipulationAlerts: ManipulationAlert[];
}

export interface ManipulationAlert {
  id: string;
  source: string;
  token: string;
  reportedPrice: number;
  medianPrice: number;
  deviationPercent: number;
  timestamp: number;
}
