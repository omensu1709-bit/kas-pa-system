import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';
/**
 * Audit Logger
 * Vollständige, unveränderliche Protokollierung aller Aktionen
 */
export class AuditLogger {
    logs = [];
    genesisTimestamp;
    operatorPubkey;
    constructor() {
        this.genesisTimestamp = Date.now();
    }
    /**
     * Erstellt einen Audit-Log-Eintrag
     */
    log(entry) {
        const logEntry = {
            id: uuidv4(),
            timestamp: Date.now(),
            slot: 0, // Wird von Blockchain-Ankerung gefüllt
            action: entry.action,
            operator: entry.operator || this.operatorPubkey,
            data: entry.data,
            previousHash: this.logs.length > 0 ? this.logs[this.logs.length - 1].hash : this.createGenesisHash(),
            hash: '' // Wird unten berechnet
        };
        // Berechne Hash
        logEntry.hash = this.calculateHash(logEntry);
        logEntry.id = CryptoJS.SHA256(`${logEntry.id}${logEntry.timestamp}${JSON.stringify(entry.data)}`).toString().substring(0, 16);
        this.logs.push(logEntry);
        return logEntry;
    }
    /**
     * Berechnet Hash für einen Log-Eintrag
     */
    calculateHash(entry) {
        const content = {
            id: entry.id,
            timestamp: entry.timestamp,
            action: entry.action,
            operator: entry.operator,
            data: entry.data,
            previousHash: entry.previousHash
        };
        // Sortiere für konsistente Hashes
        const sortedContent = this.sortObject(content);
        return CryptoJS.SHA256(JSON.stringify(sortedContent)).toString();
    }
    /**
     * Erstellt Genesis-Hash
     */
    createGenesisHash() {
        return CryptoJS.SHA256(`GENESIS:${this.genesisTimestamp}`).toString();
    }
    /**
     * Verifiziert die gesamte Log-Chain
     */
    verify() {
        const errors = [];
        // Prüfe Genesis
        if (this.logs.length > 0) {
            const firstEntry = this.logs[0];
            const expectedGenesis = this.createGenesisHash();
            if (firstEntry.previousHash !== expectedGenesis) {
                errors.push(`Genesis Hash Mismatch: erwartet ${expectedGenesis}`);
            }
        }
        // Prüfe jede Entry
        for (let i = 0; i < this.logs.length; i++) {
            const entry = this.logs[i];
            // Verifiziere Hash
            const expectedHash = this.calculateHash({
                ...entry,
                hash: '' // Hash wird neu berechnet
            });
            if (entry.hash !== expectedHash) {
                errors.push(`Hash Mismatch bei Entry ${i}: Entry wurde modifiziert`);
            }
            // Verifiziere Verknüpfung
            if (i > 0) {
                const previousEntry = this.logs[i - 1];
                if (entry.previousHash !== previousEntry.hash) {
                    errors.push(`Chain Link Broken bei Entry ${i}: Previous Hash stimmt nicht`);
                }
            }
            // Prüfe zeitliche Reihenfolge
            if (i > 0) {
                const previousEntry = this.logs[i - 1];
                if (entry.timestamp < previousEntry.timestamp) {
                    errors.push(`Timestamp Mismatch bei Entry ${i}: Zeit geht zurück`);
                }
            }
        }
        return {
            isValid: errors.length === 0,
            totalLogs: this.logs.length,
            errors,
            verifiedAt: Date.now()
        };
    }
    /**
     * Findet Logs nach Aktionstyp
     */
    findByAction(action) {
        return this.logs.filter(log => log.action === action);
    }
    /**
     * Findet Logs nach Zeitraum
     */
    findByTimeRange(startTime, endTime) {
        return this.logs.filter(log => log.timestamp >= startTime && log.timestamp <= endTime);
    }
    /**
     * Findet Logs nach Operator
     */
    findByOperator(operator) {
        return this.logs.filter(log => log.operator === operator);
    }
    /**
     * Gibt alle Logs zurück
     */
    getLogs() {
        return [...this.logs];
    }
    /**
     * Exportiert Logs als JSON
     */
    export() {
        return JSON.stringify({
            genesisTimestamp: this.genesisTimestamp,
            totalLogs: this.logs.length,
            logs: this.logs,
            exportedAt: Date.now()
        }, null, 2);
    }
    /**
     * Lädt Logs von JSON
     */
    load(jsonData) {
        const data = JSON.parse(jsonData);
        this.genesisTimestamp = data.genesisTimestamp;
        this.logs = data.logs;
    }
    /**
     * Sortiert Object rekursiv nach Keys
     */
    sortObject(obj) {
        if (typeof obj !== 'object' || obj === null) {
            return obj;
        }
        if (Array.isArray(obj)) {
            return obj.map(item => this.sortObject(item));
        }
        const sortedKeys = Object.keys(obj).sort();
        const sorted = {};
        for (const key of sortedKeys) {
            sorted[key] = this.sortObject(obj[key]);
        }
        return sorted;
    }
    /**
     * Setzt Operator Public Key
     */
    setOperator(pubkey) {
        this.operatorPubkey = pubkey;
    }
}
//# sourceMappingURL=audit-logger.js.map