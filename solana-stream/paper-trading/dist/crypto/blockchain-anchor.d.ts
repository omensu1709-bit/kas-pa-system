import { Keypair } from '@solana/web3.js';
/**
 * Blockchain Anchor - Verankert Hash-Chain an Solana
 * Jeder Trade-Hash wird als On-Chain Transaction gespeichert
 */
export declare class BlockchainAnchor {
    private connection;
    private keypair;
    private recentAnchors;
    constructor(rpcEndpoint: string, payerKeypair: Keypair);
    /**
     * Verankert einen Hash an Solana
     * Speichert den Hash als Teil einer Transaction-Nachricht
     */
    anchor(hash: string, metadata?: Record<string, any>): Promise<AnchorRecord>;
    /**
     * Erstellt eine Transaction die den Hash als Message enthält
     */
    private createAnchorTransaction;
    /**
     * Formatiert die Anchor-Nachricht
     */
    private formatAnchorMessage;
    /**
     * Verifiziert einen geankerten Hash
     */
    verify(hash: string): Promise<boolean>;
    /**
     * Gibt den Anchor-Record für einen Hash zurück
     */
    getAnchorRecord(hash: string): AnchorRecord | undefined;
    /**
     * Lädt alle Anchor-Records von der Blockchain
     */
    loadAnchors(fromSlot: number, toSlot: number): Promise<AnchorRecord[]>;
}
export interface AnchorRecord {
    hash: string;
    slot: number;
    signature: string;
    timestamp: number;
    metadata: Record<string, any>;
}
//# sourceMappingURL=blockchain-anchor.d.ts.map