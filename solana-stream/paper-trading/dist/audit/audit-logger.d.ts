/**
 * Audit Logger
 * Vollständige, unveränderliche Protokollierung aller Aktionen
 */
export declare class AuditLogger {
    private logs;
    private genesisTimestamp;
    private operatorPubkey;
    constructor();
    /**
     * Erstellt einen Audit-Log-Eintrag
     */
    log(entry: AuditLogInput): AuditLogEntry;
    /**
     * Berechnet Hash für einen Log-Eintrag
     */
    private calculateHash;
    /**
     * Erstellt Genesis-Hash
     */
    private createGenesisHash;
    /**
     * Verifiziert die gesamte Log-Chain
     */
    verify(): AuditVerification;
    /**
     * Findet Logs nach Aktionstyp
     */
    findByAction(action: string): AuditLogEntry[];
    /**
     * Findet Logs nach Zeitraum
     */
    findByTimeRange(startTime: number, endTime: number): AuditLogEntry[];
    /**
     * Findet Logs nach Operator
     */
    findByOperator(operator: string): AuditLogEntry[];
    /**
     * Gibt alle Logs zurück
     */
    getLogs(): AuditLogEntry[];
    /**
     * Exportiert Logs als JSON
     */
    export(): string;
    /**
     * Lädt Logs von JSON
     */
    load(jsonData: string): void;
    /**
     * Sortiert Object rekursiv nach Keys
     */
    private sortObject;
    /**
     * Setzt Operator Public Key
     */
    setOperator(pubkey: string): void;
}
export interface AuditLogInput {
    action: AuditAction;
    operator?: string;
    data: Record<string, any>;
}
export type AuditAction = 'SYSTEM_START' | 'TRADE_ENTRY' | 'TRADE_EXIT' | 'TRADE_REJECTED' | 'PARAMETER_CHANGE' | 'THRESHOLD_UPDATE' | 'ALERT_GENERATED' | 'ORACLE_FLAG' | 'MANUAL_OVERRIDE' | 'GUARD_TRIGGERED' | 'VERIFICATION_PERFORMED';
export interface AuditLogEntry {
    id: string;
    timestamp: number;
    slot: number;
    action: AuditAction;
    operator: string;
    data: Record<string, any>;
    previousHash: string;
    hash: string;
}
export interface AuditVerification {
    isValid: boolean;
    totalLogs: number;
    errors: string[];
    verifiedAt: number;
}
//# sourceMappingURL=audit-logger.d.ts.map