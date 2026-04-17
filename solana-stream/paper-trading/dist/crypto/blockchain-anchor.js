import { Connection, Transaction, SystemProgram } from '@solana/web3.js';
/**
 * Blockchain Anchor - Verankert Hash-Chain an Solana
 * Jeder Trade-Hash wird als On-Chain Transaction gespeichert
 */
export class BlockchainAnchor {
    connection;
    keypair;
    recentAnchors = new Map();
    constructor(rpcEndpoint, payerKeypair) {
        this.connection = new Connection(rpcEndpoint, 'confirmed');
        this.keypair = payerKeypair;
    }
    /**
     * Verankert einen Hash an Solana
     * Speichert den Hash als Teil einer Transaction-Nachricht
     */
    async anchor(hash, metadata = {}) {
        const slot = await this.connection.getSlot();
        const signature = await this.createAnchorTransaction(hash, metadata);
        const record = {
            hash,
            slot,
            signature: signature.toString(),
            timestamp: Date.now(),
            metadata
        };
        this.recentAnchors.set(hash, record);
        return record;
    }
    /**
     * Erstellt eine Transaction die den Hash als Message enthält
     */
    async createAnchorTransaction(hash, metadata) {
        // Erstelle eine Nachricht die den Hash enthält
        // Die Nachricht ist permanent in der Blockchain
        const message = this.formatAnchorMessage(hash, metadata);
        // Erstelle eine einfache Transfer-Transaction
        // Der "ANCHAR" ist die Nachricht selbst, nicht der Transfer
        const transaction = new Transaction();
        // Füge eine Dummy-Instruction hinzu die die Nachricht "verankert"
        // Wir nutzen SystemProgram für eine minimale Transaktion
        transaction.add(SystemProgram.transfer({
            fromPubkey: this.keypair.publicKey,
            toPubkey: this.keypair.publicKey, // An sich selbst
            lamports: 1 // Minimale Menge
        }));
        // Setze die Nachricht (wird on-chain gespeichert)
        transaction.add({
            keys: [],
            programId: SystemProgram.programId,
            data: Buffer.from(message.substring(0, 500)) // Max ~500 bytes
        });
        // Unterzeichne und sende
        transaction.feePayer = this.keypair.publicKey;
        transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
        const signature = await this.connection.sendTransaction(transaction, [this.keypair]);
        // Warte auf Bestätigung
        await this.connection.confirmTransaction(signature, 'confirmed');
        return signature;
    }
    /**
     * Formatiert die Anchor-Nachricht
     */
    formatAnchorMessage(hash, metadata) {
        return JSON.stringify({
            type: 'PAPER_TRADE_ANCHOR',
            version: '1.0',
            hash,
            metadata,
            timestamp: Date.now()
        });
    }
    /**
     * Verifiziert einen geankerten Hash
     */
    async verify(hash) {
        // Prüfe lokale Records
        const localRecord = this.recentAnchors.get(hash);
        if (localRecord) {
            // Prüfe On-Chain
            try {
                const tx = await this.connection.getTransaction(localRecord.signature, {
                    maxSupportedTransactionVersion: 0
                });
                return tx !== null;
            }
            catch {
                return false;
            }
        }
        // Versuche den Hash in der Blockchain zu finden
        // Dies ist eine Vereinfachung - in Produktion würde man
        // einen dedicated Anchor-Program nutzen
        return false;
    }
    /**
     * Gibt den Anchor-Record für einen Hash zurück
     */
    getAnchorRecord(hash) {
        return this.recentAnchors.get(hash);
    }
    /**
     * Lädt alle Anchor-Records von der Blockchain
     */
    async loadAnchors(fromSlot, toSlot) {
        const anchors = [];
        // In Produktion: Subscribe zu Anchor-Program Events
        // oder parse vergangene Transactions
        return anchors;
    }
}
//# sourceMappingURL=blockchain-anchor.js.map