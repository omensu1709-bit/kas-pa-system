/**
 * Real-Time Prediction Logger
 *
 * Protokolliert alle Crash Predictions mit Zeitstempeln für die 12-Wochen Validation.
 * Exportiert CSV/JSON für die finale Go/No-Go Entscheidung.
 */
export interface PredictionRecord {
    id: string;
    timestamp: number;
    slot: number;
    token: string;
    rawMetrics: RawMetrics;
    zScores: ZScores;
    crashProbability: number;
    confirmingMetrics: number;
    zone: 'IGNORE' | 'MONITOR' | 'IMMEDIATE_SHORT';
    action?: 'OPEN_POSITION' | 'CLOSE_POSITION' | 'REJECTED' | 'HALTED';
    actionReason?: string;
    positionId?: string;
    positionSize?: number;
    actualCrash?: boolean;
    actualDrop?: number;
    verificationStatus?: 'PENDING' | 'VERIFIED' | 'FALSE_POSITIVE' | 'TRUE_POSITIVE';
    hash: string;
}
export interface RawMetrics {
    n: number;
    PE: number;
    kappa: number;
    fragmentation: number;
    rt: number;
    bValue: number;
    CTE: number;
    SSI: number;
    LFI: number;
}
export interface ZScores {
    z_n: number;
    z_PE: number;
    z_kappa: number;
    z_fragmentation: number;
    z_rt: number;
    z_bValue: number;
    z_CTE: number;
    z_SSI: number;
    z_LFI: number;
}
export interface PredictionSummary {
    totalPredictions: number;
    zoneDistribution: Record<string, number>;
    probabilityHistogram: number[];
    predictionsByToken: Record<string, number>;
    totalSignals: number;
    signalsAccepted: number;
    signalsRejected: number;
    verifiedTruePositives: number;
    verifiedFalsePositives: number;
    verifiedTrueNegatives: number;
    verifiedFalseNegatives: number;
    precision?: number;
    recall?: number;
    hitRate?: number;
}
export declare class PredictionLogger {
    private operatorId;
    private predictions;
    private pendingVerifications;
    private crashWindowMs;
    private hashChain;
    constructor(operatorId?: string);
    /**
     * Loggt eine Prediction
     */
    logPrediction(token: string, slot: number, rawMetrics: RawMetrics, zScores: ZScores, crashProbability: number, confirmingMetrics: number, zone: 'IGNORE' | 'MONITOR' | 'IMMEDIATE_SHORT'): PredictionRecord;
    /**
     * Loggt eine Trade Action
     */
    logAction(predictionId: string, action: PredictionRecord['action'], reason?: string, positionId?: string, positionSize?: number): void;
    /**
     * Markiert eine Prediction als geprüft
     */
    verifyPrediction(predictionId: string, actualCrash: boolean, actualDrop: number): void;
    /**
     * Führt automatisches Verification nach dem Crash Window durch
     */
    verifyPendingPredictions(): Promise<void>;
    /**
     * Generiert eine Zusammenfassung
     */
    getSummary(): PredictionSummary;
    /**
     * Exportiert als CSV
     */
    exportCSV(): string;
    /**
     * Exportiert als JSON
     */
    exportJSON(): string;
    /**
     * Verifiziert die Hash Chain
     */
    verifyIntegrity(): {
        isValid: boolean;
        errors: string[];
    };
    /**
     * Filtert Predictions nach Kriterien
     */
    filter(criteria: {
        zone?: string[];
        token?: string;
        minProbability?: number;
        maxProbability?: number;
        startTime?: number;
        endTime?: number;
        verifiedOnly?: boolean;
    }): PredictionRecord[];
    private calculateRecordHash;
    private createGenesisHash;
    private addToPendingVerification;
    getPredictionCount(): number;
    getHighProbabilitySignals(threshold?: number): PredictionRecord[];
}
//# sourceMappingURL=crash-prediction-logger.d.ts.map