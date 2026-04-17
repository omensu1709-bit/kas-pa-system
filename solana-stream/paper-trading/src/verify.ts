/**
 * Verification Script
 * Verifiziert die gesamte Trade-Historie gegen die Blockchain
 *
 * Usage: npm run verify
 */

import { readFileSync } from 'fs';
import { HashChain } from './crypto/hash-chain.js';
import { AuditLogger } from './audit/audit-logger.js';

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║          PAPER TRADING VERIFICATION TOOL                      ║
║          Manipulationssichere Verifikation                   ║
╚═══════════════════════════════════════════════════════════════╝
`);

// Load exported data
const exportPath = process.argv[2] || './paper-trading-export.json';

console.log(`Lade Daten von: ${exportPath}`);

try {
  const data = JSON.parse(readFileSync(exportPath, 'utf-8'));

  console.log(`
┌─────────────────────────────────────────────────────────────────┐
│  GELADENE DATEN                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Starting Capital:    ${data.startingCapital.toFixed(4)} SOL                        │
│  Current Capital:     ${data.currentCapital.toFixed(4)} SOL                        │
│  Total P&L:          ${data.totalPnlSol >= 0 ? '+' : ''}${data.totalPnlSol.toFixed(4)} SOL                        │
│  Total Trades:       ${data.tradeHistory.length}                                           │
│  Export Timestamp:    ${new Date(data.exportedAt).toISOString()}         │
└─────────────────────────────────────────────────────────────────┘
`);

  // Verify Hash Chain
  console.log('Verifiziere Hash-Chain...');
  const chainData = JSON.parse(data.hashChain);
  const hashChain = new HashChain(chainData.genesisHash);
  hashChain.loadChain(chainData.chain);
  const chainResult = hashChain.verify();

  if (chainResult.isValid) {
    console.log('  ✓ Hash-Chain: VERIFIED');
  } else {
    console.log('  ✗ Hash-Chain: FAILED');
    console.log('  Errors:');
    chainResult.errors.forEach(e => console.log(`    - ${e}`));
  }

  // Verify Audit Logs
  console.log('Verifiziere Audit-Logs...');
  const auditData = JSON.parse(data.auditLogs);
  const auditLogger = new AuditLogger();
  auditLogger.load(data.auditLogs);
  const auditResult = auditLogger.verify();

  if (auditResult.isValid) {
    console.log('  ✓ Audit-Logs: VERIFIED');
  } else {
    console.log('  ✗ Audit-Logs: FAILED');
    console.log('  Errors:');
    auditResult.errors.forEach(e => console.log(`    - ${e}`));
  }

  // Overall Result
  console.log(`
┌─────────────────────────────────────────────────────────────────┐
│  VERIFICATION RESULT                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Chain Integrity:    ${chainResult.isValid ? '✓ VERIFIED' : '✗ FAILED'}                              │
│  Audit Integrity:   ${auditResult.isValid ? '✓ VERIFIED' : '✗ FAILED'}                              │
│  Total Entries:     ${chainResult.chainLength}                                            │
│                                                                  │
│  ${chainResult.isValid && auditResult.isValid ?
    '  ★ SYSTEM IS MANIPULATION-FREE ★' :
    '  ✗ ISSUES DETECTED - REVIEW REQUIRED'}
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
`);

  // Print recent trades
  console.log('Letzte 5 Trades:');
  console.log('─────────────────────────────────────────');
  const recentTrades = data.tradeHistory.slice(-5);
  recentTrades.forEach((trade: any, i: number) => {
    const pnl = trade.pnlSol !== undefined ? `${trade.pnlSol >= 0 ? '+' : ''}${trade.pnlSol.toFixed(4)}` : 'OPEN';
    const status = trade.status === 'CLOSED' ? (trade.pnlSol > 0 ? 'WIN' : 'LOSS') : 'OPEN';
    console.log(`  ${i + 1}. ${trade.tokenMint.substring(0, 8)}... | ${pnl} SOL | ${status}`);
  });

} catch (error: any) {
  console.error('Error:', error.message);
  console.log(`
┌─────────────────────────────────────────────────────────────────┐
│  ✗ VERIFICATION FAILED                                          │
│                                                                  │
│  Bitte prüfen Sie:                                              │
│  1. Export-Datei existiert                                     │
│  2. Datei ist valides JSON                                     │
│  3. Datei enthält alle erforderlichen Felder                     │
└─────────────────────────────────────────────────────────────────┘
`);
}
