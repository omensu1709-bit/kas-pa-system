/**
 * Multi-Source Price Oracle
 * Kombiniert Preise von 3 unabhängigen Quellen
 * Berechnet Median für Manipulation-Resistenz
 */
export declare class MultiSourceOracle {
    private sources;
    private manipulationFlags;
    private maxDeviationPercent;
    constructor(sources: PriceSource[]);
    /**
     * Holt verifizierten Preis von allen Quellen
     * Berechnet Median und prüft auf Manipulation
     */
    getVerifiedPrice(tokenMint: string): Promise<VerifiedPrice>;
    /**
     * Berechnet Median - nicht manipulierbar durch einzelne Quelle
     */
    private calculateMedian;
    /**
     * Erstellt kryptographischen Hash der Preisdaten
     */
    private hashPriceData;
    /**
     * Markiert mögliche Manipulation
     */
    private flagManipulation;
    /**
     * Gibt Manipulation-Alerts für einen Token zurück
     */
    private getManipulationAlerts;
    /**
     * Fügt eine neue Preisquelle hinzu
     */
    addSource(source: PriceSource): void;
    /**
     * Setzt max erlaubte Abweichung
     */
    setMaxDeviation(percent: number): void;
}
export interface PriceSource {
    name: string;
    getPrice(tokenMint: string): Promise<{
        price: number;
        slot: number;
        timestamp: number;
    }>;
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
//# sourceMappingURL=multi-source-oracle.d.ts.map