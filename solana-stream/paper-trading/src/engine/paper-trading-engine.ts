import { v4 as uuidv4 } from 'uuid';
import { HashChain } from '../crypto/hash-chain.js';
import { BlockchainAnchor, AnchorRecord } from '../crypto/blockchain-anchor.js';
import { MultiSourceOracle, VerifiedPrice } from '../oracle/multi-source-oracle.js';
import { AntiManipulationGuards, TradeRequest } from '../guards/anti-manipulation.js';
import { AuditLogger } from '../audit/audit-logger.js';
import { SYSTEM_CONFIG } from '../config.js';

/**
 * Paper Trading Engine
 * Manipulationssichere Trading-Engine mit vollständigem Audit Trail
 */
export class PaperTradingEngine {
  // State
  private positions: Map<string, Position> = new Map();
  private tradeHistory: Trade[] = [];
  private totalPnlSol: number = 0;
  private startingCapital: number;
  private currentCapital: number;

  // Components
  private hashChain: HashChain;
  private blockchainAnchor: BlockchainAnchor;
  private oracle: MultiSourceOracle;
  private guards: AntiManipulationGuards;
  private auditLogger: AuditLogger;

  // Config
  private operatorPubkey: string;

  constructor(config: EngineConfig) {
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
  async openPosition(
    tokenMint: string,
    amount: number,
    signalSource: string
  ): Promise<OpenPositionResult> {
    // 0. Check: Already have position for this symbol?
    if (this.positions.has(tokenMint)) {
      const error = `Duplicate symbol rejected: ${tokenMint} already has open position`;
      console.log(`[PaperTrading] ${error}`);
      return {
        success: false,
        error,
        rejected: true
      };
    }

    // 1. Check: Position exceeds 25% of capital?
    const maxAllowed = this.currentCapital * (SYSTEM_CONFIG.maxPositionPercent / 100);
    if (amount > maxAllowed) {
      const error = `Position too large: ${amount.toFixed(2)} > ${maxAllowed.toFixed(2)} SOL (25% limit)`;
      console.log(`[PaperTrading] ${error}`);
      return {
        success: false,
        error,
        rejected: true
      };
    }

    // 2. Hole verifizierten Preis
    const priceData = await this.oracle.getVerifiedPrice(tokenMint);

    // 2. Erstelle Trade Request für Guards
    const tradeRequest: TradeRequest = {
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
    const position: Position = {
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
  async closePosition(
    tokenMint: string,
    reason: CloseReason
  ): Promise<ClosePositionResult> {
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
    const tradeRecord: ClosedTrade = {
      id: position.id,
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
      pnlPercent: (pnl / (position.entryPrice * position.amount)) * 100,
      signalSource: position.signalSource,
      status: 'CLOSED',
      type: 'EXIT' as const
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
  private calculatePnl(entryPrice: number, exitPrice: number, amount: number): number {
    // P&L = (Exit - Entry) * Amount
    return (exitPrice - entryPrice) * amount;
  }

  /**
   * Gibt aktuellen System-State zurück
   */
  private getSystemState(): SystemState {
    const openPositions = Array.from(this.positions.values());
    const recentTrades = this.tradeHistory.slice(-10);
    const lastTrade = recentTrades.length > 0 ? recentTrades[recentTrades.length - 1].entryTime : 0;

    return {
      totalValue: this.currentCapital,
      openPositionsCount: openPositions.length,
      totalPnl: this.totalPnlSol,
      lastTradeTime: lastTrade,
      timeSinceLastTrade: lastTrade > 0 ? (Date.now() - lastTrade) / 1000 : 999999,
      recentTrades
    };
  }

  /**
   * Gibt Performance-Statistiken zurück
   */
  getPerformance(): PerformanceStats {
    const closedTrades = this.tradeHistory.filter(t => t.type === 'EXIT') as ClosedTrade[];
    const winningTrades = closedTrades.filter(t => (t.pnlSol || 0) > 0);
    const losingTrades = closedTrades.filter(t => (t.pnlSol || 0) < 0);

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
        closedTrades.reduce((sum, t) => sum + (t.pnlSol || 0), 0) / closedTrades.length : 0,
      largestWin: winningTrades.length > 0 ?
        Math.max(...winningTrades.map(t => t.pnlSol || 0)) : 0,
      largestLoss: losingTrades.length > 0 ?
        Math.min(...losingTrades.map(t => t.pnlSol || 0)) : 0,
      openPositions: Array.from(this.positions.values()),
      recentTrades: closedTrades.slice(-10)
    };
  }

  /**
   * Verifiziert die gesamte Trade-Historie
   */
  verify(): VerificationReport {
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
  export(): ExportedData {
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

export interface EngineConfig {
  startingCapital: number;
  operatorPubkey: string;
  rpcEndpoint: string;
  payerKeypair: any; // Keypair von Solana
  priceSources: any[]; // PriceSource[]
}

export interface Position {
  id: string;
  tokenMint: string;
  amount: number;
  entryPrice: number;
  entrySlot: number;
  entryTime: number;
  signalSource: string;
  status: 'OPEN' | 'CLOSED';
  exitPrice?: number;
  exitTime?: number;
  pnlSol?: number;
  pnlPercent?: number;
}

export interface Trade extends Position {
  type: 'ENTRY' | 'EXIT';
}

export interface ClosedTrade extends Trade {
  exitSlot: number;
  holdingSlots: number;
  closeReason: CloseReason;
}

export type CloseReason =
  | 'TAKE_PROFIT'
  | 'STOP_LOSS'
  | 'MANUAL'
  | 'SIGNAL_EXIT'
  | 'LIQUIDATION';

export interface SystemState {
  totalValue: number;
  openPositionsCount: number;
  totalPnl: number;
  lastTradeTime: number;
  timeSinceLastTrade: number;
  recentTrades: Trade[];
}

export interface OpenPositionResult {
  success: boolean;
  error?: string;
  rejected?: boolean;
  position?: Position;
  entryPrice?: VerifiedPrice;
  chainHash?: string;
  anchorSlot?: number;
  guardDetails?: any;
}

export interface ClosePositionResult {
  success: boolean;
  error?: string;
  trade?: ClosedTrade;
  totalPnl?: number;
  currentCapital?: number;
  chainHash?: string;
  anchorSlot?: number;
}

export interface PerformanceStats {
  startingCapital: number;
  currentCapital: number;
  totalPnlSol: number;
  totalPnlPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  averageTrade: number;
  largestWin: number;
  largestLoss: number;
  openPositions: Position[];
  recentTrades: ClosedTrade[];
}

export interface VerificationReport {
  chainValid: boolean;
  chainErrors: string[];
  auditValid: boolean;
  auditErrors: string[];
  totalTrades: number;
  totalPnl: number;
  verifiedAt: number;
}

export interface ExportedData {
  startingCapital: number;
  currentCapital: number;
  totalPnlSol: number;
  positions: Position[];
  tradeHistory: Trade[];
  hashChain: string;
  auditLogs: string;
  exportedAt: number;
}
