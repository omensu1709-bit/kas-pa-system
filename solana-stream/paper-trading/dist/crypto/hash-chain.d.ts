/**
 * Hash-Chain für unveränderliche Trade-Sequenz
 * Jede Änderung an einem früheren Trade bricht die gesamte Chain!
 */
export declare class HashChain {
    private chain;
    private genesisHash;
    constructor(genesisHash?: string);
    /**
     * Erstellt den Genesis-Hash (Anfang der Chain)
     */
    private createGenesisHash;
    /**
     * Gibt den letzten Hash in der Chain zurück
     */
    getLastHash(): string;
    /**
     * Erstellt einen neuen Hash-Eintrag
     */
    createEntry(data: Record<string, any>): HashEntry;
    /**
     * Erstellt einen Hash für Content-Daten
     */
    private hashContent;
    /**
     * Sortiert ein Object rekursiv nach Keys
     */
    private sortObject;
    /**
     * Verifiziert die gesamte Chain
     */
    verify(): VerificationResult;
    /**
     * Fügt eine existierende Chain hinzu (für Loading)
     */
    loadChain(entries: HashEntry[]): void;
    /**
     * Gibt die komplette Chain zurück
     */
    getChain(): HashEntry[];
    /**
     * Exportiert die Chain als JSON
     */
    export(): string;
}
export interface HashEntry {
    id: string;
    timestamp: number;
    previousHash: string;
    contentHash: string;
    hash: string;
    data: Record<string, any>;
}
export interface VerificationResult {
    isValid: boolean;
    chainLength: number;
    errors: string[];
    verifiedAt: number;
}
//# sourceMappingURL=hash-chain.d.ts.map