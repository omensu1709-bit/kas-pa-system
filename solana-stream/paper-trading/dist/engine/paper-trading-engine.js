import { v4 as uuidv4 } from 'uuid';
import { HashChain } from '../crypto/hash-chain.js';
import { BlockchainAnchor } from '../crypto/blockchain-anchor.js';
import { MultiSourceOracle } from '../oracle/multi-source-oracle.js';
import { AntiManipulationGuards } from '../guards/anti-manipulation.js';
import { AuditLogger } from '../audit/audit-logger.js';
/**
 * Paper Trading Engine
 * Manipulationssichere Trading-Engine mit vollständigem Audit Trail
 */
export class PaperTradingEngine {
    // State
    positions = new Map();
    tradeHistory = [];
    totalPnlSol = 0;
    startingCapital;
    currentCapital;
    // Components
    hashChain;
    blockchainAnchor;
    oracle;
    guards;
    auditLogger;
    // Config
    operatorPubkey;
    constructor(config) {
        this.startingCapital = config.startingCapital;
        this.currentCapital = config.startingCapital;
        this.operatorPubkey = config.operatorPubkey;
        // Initialisiere Komponenten
        this.hashChain = new HashChain();
        this.blockchainAnchor = new BlockchainAnchor(config.rpcEndpoint, config.payerKeypair);
        this.oracle = new MultiSourceOracle(config.priceSources);
        this.guards = new AntiManipulationGuards();
        this.auditLogger = new AuditLogger();
        // Log System-Start
        this.auditLogger.log({
            action: 'SYSTEM_START',
            operator: this.operatorPubkey,
            data: {
                startingCapital: this.startingCapital,
                genesisHash: this.hashChain.getLastHash()
            }
        });
    }
    /**
     * Öffnet eine neue Position
     */
    async openPosition(tokenMint, amount, signalSource) {
        // 1. Hole verifizierten Preis
        const priceData = await this.oracle.getVerifiedPrice(tokenMint);
        // 2. Erstelle Trade Request für Guards
        const tradeRequest = {
            tokenMint,
            amount,
            price: priceData.price,
            direction: 'LONG',
            signalSource
        };
        // 3. Prüfe gegen Anti-Manipulation Guards
        const guardResult = this.guards.validateTrade(tradeRequest, this.getSystemState());
        if (!guardResult.approved) {
            this.auditLogger.log({
                action: 'TRADE_REJECTED',
                operator: this.operatorPubkey,
                data: {
                    tokenMint,
                    amount,
                    reason: guardResult.reason,
                    guardDetails: guardResult.details
                }
            });
            return {
                success: false,
                error: guardResult.reason,
                rejected: true,
                guardDetails: guardResult.details
            };
        }
        // 4. Erstelle Position
        const position = {
            id: uuidv4(),
            tokenMint,
            amount,
            entryPrice: priceData.price,
            entrySlot: priceData.sources[0]?.slot || 0,
            entryTime: Date.now(),
            signalSource,
            status: 'OPEN'
        };
        // 5. Erstelle Hash-Chain Entry
        const chainEntry = this.hashChain.createEntry({
            type: 'TRADE_ENTRY',
            position
        });
        // 6. Verankere an Blockchain
        const anchor = await this.blockchainAnchor.anchor(chainEntry.hash, {
            type: 'TRADE_ENTRY',
            positionId: position.id,
            tokenMint
        });
        // 7. Log für Audit
        this.auditLogger.log({
            action: 'TRADE_ENTRY',
            operator: this.operatorPubkey,
            data: {
                position,
                entryPrice: priceData,
                chainHash: chainEntry.hash,
                anchorSlot: anchor.slot,
                anchorSignature: anchor.signature
            }
        });
        // 8. Speichere Position
        this.positions.set(tokenMint, position);
        this.tradeHistory.push({
            ...position,
            type: 'ENTRY'
        });
        return {
            success: true,
            position,
            entryPrice: priceData,
            chainHash: chainEntry.hash,
            anchorSlot: anchor.slot
        };
    }
    /**
     * Schließt eine existierende Position
     */
    async closePosition(tokenMint, reason) {
        // 1. Prüfe ob Position existiert
        const position = this.positions.get(tokenMint);
        if (!position) {
            return {
                success: false,
                error: `No open position for ${tokenMint}`
            };
        }
        // 2. Hole verifizierten Exit-Preis
        const exitPriceData = await this.oracle.getVerifiedPrice(tokenMint);
        // 3. Berechne P&L
        const pnl = this.calculatePnl(position.entryPrice, exitPriceData.price, position.amount);
        // 4. Erstelle Trade Record
        const tradeRecord = {
            positionId: position.id,
            tokenMint,
            amount: position.amount,
            entryPrice: position.entryPrice,
            exitPrice: exitPriceData.price,
            pnlSol: pnl,
            entrySlot: position.entrySlot,
            exitSlot: exitPriceData.sources[0]?.slot || 0,
            holdingSlots: (exitPriceData.sources[0]?.slot || 0) - position.entrySlot,
            entryTime: position.entryTime,
            exitTime: Date.now(),
            closeReason: reason,
            pnlPercent: (pnl / (position.entryPrice * position.amount)) * 100
        };
        // 5. Erstelle Hash-Chain Entry
        const chainEntry = this.hashChain.createEntry({
            type: 'TRADE_EXIT',
            tradeRecord
        });
        // 6. Verankere an Blockchain
        const anchor = await this.blockchainAnchor.anchor(chainEntry.hash, {
            type: 'TRADE_EXIT',
            positionId: position.id,
            tokenMint,
            pnl
        });
        // 7. Log für Audit
        this.auditLogger.log({
            action: 'TRADE_EXIT',
            operator: this.operatorPubkey,
            data: {
                tradeRecord,
                exitPrice: exitPriceData,
                chainHash: chainEntry.hash,
                anchorSlot: anchor.slot,
                anchorSignature: anchor.signature
            }
        });
        // 8. Aktualisiere State
        this.totalPnlSol += pnl;
        this.currentCapital += pnl;
        position.status = 'CLOSED';
        position.exitPrice = exitPriceData.price;
        position.exitTime = Date.now();
        position.pnlSol = pnl;
        position.pnlPercent = tradeRecord.pnlPercent;
        this.positions.delete(tokenMint);
        // Ersetze offene Position mit geschlossener im History
        const historyIndex = this.tradeHistory.findIndex(t => t.id === position.id);
        if (historyIndex >= 0) {
            this.tradeHistory[historyIndex] = {
                ...position,
                type: 'EXIT'
            };
        }
        return {
            success: true,
            trade: tradeRecord,
            totalPnl: this.totalPnlSol,
            currentCapital: this.currentCapital,
            chainHash: chainEntry.hash,
            anchorSlot: anchor.slot
        };
    }
    /**
     * Berechnet P&L für einen Trade
     */
    calculatePnl(entryPrice, exitPrice, amount) {
        // P&L = (Exit - Entry) * Amount
        return (exitPrice - entryPrice) * amount;
    }
    /**
     * Gibt aktuellen System-State zurück
     */
    getSystemState() {
        const openPositions = Array.from(this.positions.values());
        const recentTrades = this.tradeHistory.slice(-10);
        return {
            totalValue: this.currentCapital,
            openPositionsCount: openPositions.length,
            totalPnl: this.totalPnlSol,
            lastTradeTime: recentTrades.length > 0 ? recentTrades[recentTrades.length - 1].entryTime : 0,
            recentTrades
        };
    }
    /**
     * Gibt Performance-Statistiken zurück
     */
    getPerformance() {
        const closedTrades = this.tradeHistory.filter(t => t.type === 'EXIT');
        const winningTrades = closedTrades.filter(t => t.pnlSol > 0);
        const losingTrades = closedTrades.filter(t => t.pnlSol < 0);
        return {
            startingCapital: this.startingCapital,
            currentCapital: this.currentCapital,
            totalPnlSol: this.totalPnlSol,
            totalPnlPercent: ((this.currentCapital - this.startingCapital) / this.startingCapital) * 100,
            totalTrades: closedTrades.length,
            winningTrades: winningTrades.length,
            losingTrades: losingTrades.length,
            winRate: closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0,
            averageTrade: closedTrades.length > 0 ?
                closedTrades.reduce((sum, t) => sum + t.pnlSol, 0) / closedTrades.length : 0,
            largestWin: winningTrades.length > 0 ?
                Math.max(...winningTrades.map(t => t.pnlSol)) : 0,
            largestLoss: losingTrades.length > 0 ?
                Math.min(...losingTrades.map(t => t.pnlSol)) : 0,
            openPositions: Array.from(this.positions.values()),
            recentTrades: closedTrades.slice(-10)
        };
    }
    /**
     * Verifiziert die gesamte Trade-Historie
     */
    verify() {
        const chainVerification = this.hashChain.verify();
        const auditVerification = this.auditLogger.verify();
        return {
            chainValid: chainVerification.isValid,
            chainErrors: chainVerification.errors,
            auditValid: auditVerification.isValid,
            auditErrors: auditVerification.errors,
            totalTrades: this.tradeHistory.length,
            totalPnl: this.totalPnlSol,
            verifiedAt: Date.now()
        };
    }
    /**
     * Exportiert alle Trade-Daten
     */
    export() {
        return {
            startingCapital: this.startingCapital,
            currentCapital: this.currentCapital,
            totalPnlSol: this.totalPnlSol,
            positions: Array.from(this.positions.values()),
            tradeHistory: this.tradeHistory,
            hashChain: this.hashChain.export(),
            auditLogs: this.auditLogger.export(),
            exportedAt: Date.now()
        };
    }
}
//# sourceMappingURL=paper-trading-engine.js.map