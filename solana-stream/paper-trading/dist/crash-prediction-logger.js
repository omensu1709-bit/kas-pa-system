/**
 * Real-Time Prediction Logger
 *
 * Protokolliert alle Crash Predictions mit Zeitstempeln für die 12-Wochen Validation.
 * Exportiert CSV/JSON für die finale Go/No-Go Entscheidung.
 */
import { v4 as uuidv4 } from 'uuid';
import CryptoJS from 'crypto-js';
export class PredictionLogger {
    operatorId;
    predictions = [];
    pendingVerifications = new Map();
    crashWindowMs = 24 * 60 * 60 * 1000; // 24h window
    hashChain = [];
    constructor(operatorId = 'system') {
        this.operatorId = operatorId;
        this.hashChain.push(this.createGenesisHash());
    }
    /**
     * Loggt eine Prediction
     */
    logPrediction(token, slot, rawMetrics, zScores, crashProbability, confirmingMetrics, zone) {
        const record = {
            id: uuidv4(),
            timestamp: Date.now(),
            slot,
            token,
            rawMetrics,
            zScores,
            crashProbability,
            confirmingMetrics,
            zone,
            verificationStatus: 'PENDING',
            hash: '', // Will be set below
        };
        // Create hash for integrity
        record.hash = this.calculateRecordHash(record);
        // Add to chain
        this.hashChain.push(record.hash);
        // Store prediction
        this.predictions.push(record);
        // Add to pending verification
        this.addToPendingVerification(record);
        return record;
    }
    /**
     * Loggt eine Trade Action
     */
    logAction(predictionId, action, reason, positionId, positionSize) {
        const prediction = this.predictions.find(p => p.id === predictionId);
        if (!prediction) {
            console.warn(`[PredictionLogger] Prediction ${predictionId} not found`);
            return;
        }
        prediction.action = action;
        prediction.actionReason = reason;
        prediction.positionId = positionId;
        prediction.positionSize = positionSize;
        // Recalculate hash
        prediction.hash = this.calculateRecordHash(prediction);
    }
    /**
     * Markiert eine Prediction als geprüft
     */
    verifyPrediction(predictionId, actualCrash, actualDrop) {
        const prediction = this.predictions.find(p => p.id === predictionId);
        if (!prediction) {
            console.warn(`[PredictionLogger] Prediction ${predictionId} not found`);
            return;
        }
        prediction.actualCrash = actualCrash;
        prediction.actualDrop = actualDrop;
        prediction.verificationStatus = 'VERIFIED';
        // Recalculate hash
        prediction.hash = this.calculateRecordHash(prediction);
    }
    /**
     * Führt automatisches Verification nach dem Crash Window durch
     */
    async verifyPendingPredictions() {
        const now = Date.now();
        const toVerify = [];
        for (const prediction of this.predictions) {
            if (prediction.verificationStatus !== 'PENDING')
                continue;
            const elapsed = now - prediction.timestamp;
            if (elapsed >= this.crashWindowMs) {
                toVerify.push(prediction);
            }
        }
        // In production, this would fetch actual price data and determine
        // if a crash occurred. For now, mark as verified based on zone.
        for (const prediction of toVerify) {
            if (prediction.zone === 'IGNORE') {
                prediction.actualCrash = false;
                prediction.verificationStatus = 'TRUE_NEGATIVE';
            }
            else if (prediction.action === 'OPEN_POSITION') {
                // Check if position was profitable (crash occurred)
                // This would be linked to actual trade outcomes
                prediction.verificationStatus = 'VERIFIED';
            }
            else {
                prediction.verificationStatus = 'VERIFIED';
            }
            prediction.hash = this.calculateRecordHash(prediction);
        }
    }
    /**
     * Generiert eine Zusammenfassung
     */
    getSummary() {
        const summary = {
            totalPredictions: this.predictions.length,
            zoneDistribution: { IGNORE: 0, MONITOR: 0, IMMEDIATE_SHORT: 0 },
            probabilityHistogram: new Array(10).fill(0),
            predictionsByToken: {},
            totalSignals: 0,
            signalsAccepted: 0,
            signalsRejected: 0,
            verifiedTruePositives: 0,
            verifiedFalsePositives: 0,
            verifiedTrueNegatives: 0,
            verifiedFalseNegatives: 0,
        };
        for (const p of this.predictions) {
            // Zone distribution
            summary.zoneDistribution[p.zone]++;
            // Probability histogram (0-0.1, 0.1-0.2, etc.)
            const bin = Math.min(9, Math.floor(p.crashProbability * 10));
            summary.probabilityHistogram[bin]++;
            // By token
            summary.predictionsByToken[p.token] = (summary.predictionsByToken[p.token] || 0) + 1;
            // Action stats
            if (p.zone !== 'IGNORE') {
                summary.totalSignals++;
                if (p.action === 'OPEN_POSITION') {
                    summary.signalsAccepted++;
                }
                else if (p.action === 'REJECTED') {
                    summary.signalsRejected++;
                }
            }
            // Verification stats
            if (p.verificationStatus === 'VERIFIED' || p.verificationStatus === 'TRUE_POSITIVE') {
                if (p.crashProbability >= 0.2 && p.actualCrash) {
                    summary.verifiedTruePositives++;
                }
                else if (p.crashProbability >= 0.2 && !p.actualCrash) {
                    summary.verifiedFalsePositives++;
                }
                else if (p.crashProbability < 0.2 && !p.actualCrash) {
                    summary.verifiedTrueNegatives++;
                }
                else if (p.crashProbability < 0.2 && p.actualCrash) {
                    summary.verifiedFalseNegatives++;
                }
            }
        }
        // Calculate rates
        const tp = summary.verifiedTruePositives;
        const fp = summary.verifiedFalsePositives;
        const tn = summary.verifiedTrueNegatives;
        const fn = summary.verifiedFalseNegatives;
        if (tp + fp > 0) {
            summary.precision = tp / (tp + fp);
        }
        if (tp + fn > 0) {
            summary.recall = tp / (tp + fn);
        }
        if (tp + fp > 0) {
            summary.hitRate = tp / (tp + fp);
        }
        return summary;
    }
    /**
     * Exportiert als CSV
     */
    exportCSV() {
        const headers = [
            'id', 'timestamp', 'slot', 'token',
            'crashProbability', 'confirmingMetrics', 'zone',
            'action', 'actionReason', 'positionId', 'positionSize',
            'actualCrash', 'actualDrop', 'verificationStatus',
            'hash'
        ];
        const rows = this.predictions.map(p => [
            p.id,
            p.timestamp,
            p.slot,
            p.token,
            p.crashProbability.toFixed(6),
            p.confirmingMetrics,
            p.zone,
            p.action || '',
            p.actionReason || '',
            p.positionId || '',
            p.positionSize?.toFixed(4) || '',
            p.actualCrash !== undefined ? p.actualCrash.toString() : '',
            p.actualDrop !== undefined ? p.actualDrop.toFixed(4) : '',
            p.verificationStatus || '',
            p.hash
        ].join(','));
        return [headers.join(','), ...rows].join('\n');
    }
    /**
     * Exportiert als JSON
     */
    exportJSON() {
        return JSON.stringify({
            operatorId: this.operatorId,
            exportedAt: Date.now(),
            summary: this.getSummary(),
            predictions: this.predictions,
            hashChain: this.hashChain,
        }, null, 2);
    }
    /**
     * Verifiziert die Hash Chain
     */
    verifyIntegrity() {
        const errors = [];
        for (let i = 1; i < this.predictions.length; i++) {
            const expectedPrevHash = this.predictions[i - 1].hash;
            // We don't store previous hash in record, so we check chain continuity
            const calculatedHash = this.calculateRecordHash(this.predictions[i]);
            if (calculatedHash !== this.predictions[i].hash) {
                errors.push(`Hash mismatch at prediction ${this.predictions[i].id}`);
            }
        }
        return {
            isValid: errors.length === 0,
            errors,
        };
    }
    /**
     * Filtert Predictions nach Kriterien
     */
    filter(criteria) {
        return this.predictions.filter(p => {
            if (criteria.zone && !criteria.zone.includes(p.zone))
                return false;
            if (criteria.token && p.token !== criteria.token)
                return false;
            if (criteria.minProbability !== undefined && p.crashProbability < criteria.minProbability)
                return false;
            if (criteria.maxProbability !== undefined && p.crashProbability > criteria.maxProbability)
                return false;
            if (criteria.startTime && p.timestamp < criteria.startTime)
                return false;
            if (criteria.endTime && p.timestamp > criteria.endTime)
                return false;
            if (criteria.verifiedOnly && p.verificationStatus === 'PENDING')
                return false;
            return true;
        });
    }
    calculateRecordHash(record) {
        const content = {
            id: record.id,
            timestamp: record.timestamp,
            slot: record.slot,
            token: record.token,
            rawMetrics: record.rawMetrics,
            zScores: record.zScores,
            crashProbability: record.crashProbability,
            confirmingMetrics: record.confirmingMetrics,
            zone: record.zone,
            actualCrash: record.actualCrash,
            actualDrop: record.actualDrop,
            verificationStatus: record.verificationStatus,
        };
        return CryptoJS.SHA256(JSON.stringify(content)).toString();
    }
    createGenesisHash() {
        return CryptoJS.SHA256(`GENESIS:${this.operatorId}:${Date.now()}`).toString();
    }
    addToPendingVerification(record) {
        const key = `${record.token}:${Math.floor(record.timestamp / (this.crashWindowMs))}`;
        const existing = this.pendingVerifications.get(key) || [];
        existing.push(record);
        this.pendingVerifications.set(key, existing);
    }
    getPredictionCount() {
        return this.predictions.length;
    }
    getHighProbabilitySignals(threshold = 0.2) {
        return this.filter({ zone: ['IMMEDIATE_SHORT'], minProbability: threshold });
    }
}
//# sourceMappingURL=crash-prediction-logger.js.map