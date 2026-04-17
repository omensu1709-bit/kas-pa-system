import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Hash-Chain für unveränderliche Trade-Sequenz
 * Jede Änderung an einem früheren Trade bricht die gesamte Chain!
 */
export class HashChain {
  private chain: HashEntry[] = [];
  private genesisHash: string;

  constructor(genesisHash?: string) {
    this.genesisHash = genesisHash || this.createGenesisHash();
  }

  /**
   * Erstellt den Genesis-Hash (Anfang der Chain)
   */
  private createGenesisHash(): string {
    const timestamp = Date.now();
    const nonce = Math.random().toString(36);
    return CryptoJS.SHA256(`GENESIS:${timestamp}:${nonce}`).toString();
  }

  /**
   * Gibt den letzten Hash in der Chain zurück
   */
  getLastHash(): string {
    if (this.chain.length === 0) {
      return this.genesisHash;
    }
    return this.chain[this.chain.length - 1].hash;
  }

  /**
   * Erstellt einen neuen Hash-Eintrag
   */
  createEntry(data: Record<string, any>): HashEntry {
    const previousHash = this.getLastHash();
    const entryId = uuidv4();
    const timestamp = Date.now();

    // Erstelle den Content-Hash
    const contentHash = this.hashContent({
      id: entryId,
      ...data,
      timestamp,
      previousHash
    });

    // Erstelle den vollständigen Entry-Hash
    const entryHash = CryptoJS.SHA256(
      `${entryId}:${contentHash}:${previousHash}:${timestamp}`
    ).toString();

    const entry: HashEntry = {
      id: entryId,
      timestamp,
      previousHash,
      contentHash,
      hash: entryHash,
      data
    };

    this.chain.push(entry);
    return entry;
  }

  /**
   * Erstellt einen Hash für Content-Daten
   */
  private hashContent(data: Record<string, any>): string {
    // Sortiere Keys für konsistente Hashes
    const sortedData = this.sortObject(data);
    const jsonString = JSON.stringify(sortedData);
    return CryptoJS.SHA256(jsonString).toString();
  }

  /**
   * Sortiert ein Object rekursiv nach Keys
   */
  private sortObject(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObject(item));
    }

    const sortedKeys = Object.keys(obj).sort();
    const sorted: Record<string, any> = {};
    for (const key of sortedKeys) {
      sorted[key] = this.sortObject(obj[key]);
    }
    return sorted;
  }

  /**
   * Verifiziert die gesamte Chain
   */
  verify(): VerificationResult {
    const errors: string[] = [];

    // Prüfe Genesis
    if (this.chain.length > 0) {
      const firstEntry = this.chain[0];
      if (firstEntry.previousHash !== this.genesisHash) {
        errors.push(`Genesis Hash Mismatch: erwartet ${this.genesisHash}, erhalten ${firstEntry.previousHash}`);
      }
    }

    // Prüfe jede Entry-Verknüpfung
    for (let i = 0; i < this.chain.length; i++) {
      const entry = this.chain[i];

      // Verifiziere Content-Hash
      const expectedContentHash = this.hashContent({
        id: entry.id,
        ...entry.data,
        timestamp: entry.timestamp,
        previousHash: entry.previousHash
      });

      if (entry.contentHash !== expectedContentHash) {
        errors.push(`Content Hash Mismatch bei Entry ${i} (${entry.id})`);
      }

      // Verifiziere Entry-Hash
      const expectedEntryHash = CryptoJS.SHA256(
        `${entry.id}:${entry.contentHash}:${entry.previousHash}:${entry.timestamp}`
      ).toString();

      if (entry.hash !== expectedEntryHash) {
        errors.push(`Entry Hash Mismatch bei Entry ${i} (${entry.id})`);
      }

      // Prüfe Verknüpfung zur vorherigen Entry
      if (i > 0) {
        const previousEntry = this.chain[i - 1];
        if (entry.previousHash !== previousEntry.hash) {
          errors.push(`Chain Link Broken bei Entry ${i}: previousHash verweist nicht auf vorherige Entry`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      chainLength: this.chain.length,
      errors,
      verifiedAt: Date.now()
    };
  }

  /**
   * Fügt eine existierende Chain hinzu (für Loading)
   */
  loadChain(entries: HashEntry[]): void {
    this.chain = entries;
  }

  /**
   * Gibt die komplette Chain zurück
   */
  getChain(): HashEntry[] {
    return [...this.chain];
  }

  /**
   * Exportiert die Chain als JSON
   */
  export(): string {
    return JSON.stringify({
      genesisHash: this.genesisHash,
      chain: this.chain,
      exportedAt: Date.now()
    }, null, 2);
  }
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
