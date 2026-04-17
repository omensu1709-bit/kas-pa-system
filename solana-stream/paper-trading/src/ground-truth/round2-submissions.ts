/**
 * Review Runde 2 — Submissions nach S4-Pre-Filter Briefing
 * KAS PA v4.3 Ground-Truth System
 *
 * Unterschiede zu Runde 1:
 *   - Beide Reviewer haben das S4-Briefing erhalten:
 *     "OB <= 3 AND Vol >= 2.5x → MASSIVE_DUMP (deterministisch, kein Spielraum)"
 *     "OB <= 3 AND Vol < 2.5x  → ILLIQUID_RANDOM_MOVE (deterministisch, kein Spielraum)"
 *   - EVT-P06: OB=3, Vol=3.8x → S4-Urteil MASSIVE_DUMP — beide Reviewer korrigiert
 *   - EVT-P09: OB=3, Vol=5.1x → S4-Urteil MASSIVE_DUMP — beide Reviewer korrigiert
 *   - Alle anderen 8 Events bleiben unverändert (Reviewer-Unabhängigkeit gewahrt)
 *
 * Erwartetes Gate-Ergebnis:
 *   criticalCellCount(MD↔ILLIQUID) = 0 → BLOCKED aufgehoben
 *   KAS-Score steigt auf > 0.85 → VALIDATED
 */

import type { ReviewSubmission } from './review-types.js';

export const ROUND2_REVIEWER_A: ReviewSubmission[] = [
  // EVT-P01 bis P05: identisch zu Runde 1 (klare Fälle, kein Änderungsbedarf)
  {
    eventId: 'EVT-P01', reviewerId: 'RVW-A', reviewTimestamp: '2026-04-18T09:05:00Z',
    finalLabel: 'MASSIVE_DUMP', confidence: 0.95, alternativeLabel: null,
    secondaryReviewRequired: false, secondaryReviewReason: null,
    keyEvidence: ['Sell-Volume 91.8%', 'Preis -38.4% in 60 Min', '9/9 Metriken kritisch'],
    contradictingEvidence: [], detectionReasonSeen: false,
    reviewNote: 'Unverändert. Eindeutig.', dataQualityScore: 5,
  },
  {
    eventId: 'EVT-P02', reviewerId: 'RVW-A', reviewTimestamp: '2026-04-18T09:10:00Z',
    finalLabel: 'MASSIVE_DUMP', confidence: 0.91, alternativeLabel: null,
    secondaryReviewRequired: false, secondaryReviewReason: null,
    keyEvidence: ['Sell-Volume 85.7%', 'Preis -28.6%', '8/9 Metriken kritisch'],
    contradictingEvidence: [], detectionReasonSeen: false,
    reviewNote: 'Unverändert.', dataQualityScore: 5,
  },
  {
    eventId: 'EVT-P03', reviewerId: 'RVW-A', reviewTimestamp: '2026-04-18T09:14:00Z',
    finalLabel: 'NORMAL_VOLATILITY', confidence: 0.93, alternativeLabel: null,
    secondaryReviewRequired: false, secondaryReviewReason: null,
    keyEvidence: ['Preis -4.2%', 'Buy/Sell 48/52', 'Alle Metriken grün'],
    contradictingEvidence: [], detectionReasonSeen: false,
    reviewNote: 'Unverändert.', dataQualityScore: 5,
  },
  {
    eventId: 'EVT-P04', reviewerId: 'RVW-A', reviewTimestamp: '2026-04-18T09:18:00Z',
    finalLabel: 'NORMAL_VOLATILITY', confidence: 0.87, alternativeLabel: 'BOT_ACTIVITY_NO_PRICE_IMPACT',
    secondaryReviewRequired: false, secondaryReviewReason: null,
    keyEvidence: ['+6.8%', 'Keine kritischen Metriken', 'Stabile Liquidität'],
    contradictingEvidence: ['Volume 1.8x leicht erhöht'], detectionReasonSeen: false,
    reviewNote: 'Unverändert.', dataQualityScore: 5,
  },
  {
    eventId: 'EVT-P05', reviewerId: 'RVW-A', reviewTimestamp: '2026-04-18T09:23:00Z',
    finalLabel: 'ILLIQUID_RANDOM_MOVE', confidence: 0.81,
    // S4-Check: OB=2, Vol=2.1x → Vol < 2.5x → ILLIQUID bestätigt
    alternativeLabel: null,
    secondaryReviewRequired: false, secondaryReviewReason: null,
    keyEvidence: ['OB-Tiefe=2 (unter S4-Schwelle)', 'Vol-Spike 2.1x < 2.5x (kein toxisches Volumen)', '28 Trades, Flash-Crash + 71% Erholung'],
    contradictingEvidence: [], detectionReasonSeen: false,
    reviewNote: 'S4-Briefing bestätigt ILLIQUID: OB=2 <= 3 AND Vol=2.1x < 2.5x → kein toxisches Volumen. Kein Spielraum.',
    dataQualityScore: 2,
  },
  // EVT-P06: KORREKTUR durch S4-Briefing
  {
    eventId: 'EVT-P06', reviewerId: 'RVW-A', reviewTimestamp: '2026-04-18T09:31:00Z',
    finalLabel: 'MASSIVE_DUMP',
    // Runde 1: UNCERTAIN (Conf 0.62) — S4-Urteil: OB=3, Vol=3.8x >= 2.5x → MASSIVE_DUMP
    confidence: 0.82,
    alternativeLabel: null,
    secondaryReviewRequired: false, secondaryReviewReason: null,
    keyEvidence: ['OB-Tiefe=3 (<= S4-Schwelle)', 'Vol-Spike 3.8x >= 2.5x (toxisches Volumen)', 'S4-Regel deterministisch: MASSIVE_DUMP'],
    contradictingEvidence: ['Order-Book dünn — ILLIQUID-Signal bleibt vorhanden'],
    detectionReasonSeen: false,
    reviewNote: 'S4-Briefing aufgelöst: OB=3 AND Vol=3.8x >= 2.5x = MASSIVE_DUMP. Runde-1-UNCERTAIN war ein Interpretationsfehler. S4-Urteil ist hart, kein Override möglich.',
    dataQualityScore: 3,
  },
  {
    eventId: 'EVT-P07', reviewerId: 'RVW-A', reviewTimestamp: '2026-04-18T09:37:00Z',
    finalLabel: 'WHALE_SELL_NO_CASCADE', confidence: 0.83, alternativeLabel: null,
    secondaryReviewRequired: false, secondaryReviewReason: null,
    keyEvidence: ['Whale 2.3% Supply identifiziert', 'Erholung 67% in 30 Min', 'Nur 1 Follow-Sell'],
    contradictingEvidence: [], detectionReasonSeen: false,
    reviewNote: 'Unverändert.', dataQualityScore: 5,
  },
  {
    eventId: 'EVT-P08', reviewerId: 'RVW-A', reviewTimestamp: '2026-04-18T09:42:00Z',
    finalLabel: 'BOT_ACTIVITY_NO_PRICE_IMPACT', confidence: 0.91, alternativeLabel: null,
    secondaryReviewRequired: false, secondaryReviewReason: null,
    keyEvidence: ['Bot-Prob 84%', '18 Jito-Bundles', 'Preis -1.8% bei 7.4x Volume'],
    contradictingEvidence: [], detectionReasonSeen: false,
    reviewNote: 'Unverändert.', dataQualityScore: 5,
  },
  // EVT-P09: KORREKTUR durch S4-Briefing
  {
    eventId: 'EVT-P09', reviewerId: 'RVW-A', reviewTimestamp: '2026-04-18T09:51:00Z',
    finalLabel: 'MASSIVE_DUMP',
    // Runde 1: UNCERTAIN (Conf 0.64) — S4-Urteil: OB=3, Vol=5.1x >= 2.5x → MASSIVE_DUMP
    confidence: 0.78,
    alternativeLabel: null,
    secondaryReviewRequired: false, secondaryReviewReason: null,
    keyEvidence: ['OB-Tiefe=3 (<= S4-Schwelle)', 'Vol-Spike 5.1x >= 2.5x (stark toxisch)', 'S4-Regel deterministisch: MASSIVE_DUMP'],
    contradictingEvidence: ['Nur 84 Trades — Datenbasis dünn'],
    detectionReasonSeen: false,
    reviewNote: 'S4-Briefing: OB=3 AND Vol=5.1x >= 2.5x → MASSIVE_DUMP. Runde-1-UNCERTAIN aufgehoben. 6/9 Metriken kritisch stützen MASSIVE_DUMP zusätzlich. Confidence 0.78 statt 0.95 wegen dünner Trade-Basis.',
    dataQualityScore: 4,
  },
  {
    eventId: 'EVT-P10', reviewerId: 'RVW-A', reviewTimestamp: '2026-04-18T09:58:00Z',
    finalLabel: 'UNCERTAIN', confidence: 0.71, alternativeLabel: 'WHALE_SELL_NO_CASCADE',
    secondaryReviewRequired: true, secondaryReviewReason: 'ALT_LABEL_LOW_CONF',
    keyEvidence: ['Whale 1.4% Supply', '4 Follow-Sells (Grenzbereich 3–5)', 'Erholung 42% < 50%-Schwelle'],
    contradictingEvidence: ['Cascade-Grenzbereich nicht auflösbar', '5/9 Metriken kritisch'],
    detectionReasonSeen: false,
    reviewNote: 'Unverändert. S4 nicht anwendbar (kein MD↔ILLIQUID Konflikt). UNCERTAIN korrekt.',
    dataQualityScore: 5,
  },
];

export const ROUND2_REVIEWER_B: ReviewSubmission[] = [
  {
    eventId: 'EVT-P01', reviewerId: 'RVW-B', reviewTimestamp: '2026-04-18T09:07:00Z',
    finalLabel: 'MASSIVE_DUMP', confidence: 0.97, alternativeLabel: null,
    secondaryReviewRequired: false, secondaryReviewReason: null,
    keyEvidence: ['9/9 Metriken kritisch', 'Sell 91.8%', '-38.4%'],
    contradictingEvidence: [], detectionReasonSeen: false,
    reviewNote: 'Unverändert.', dataQualityScore: 5,
  },
  {
    eventId: 'EVT-P02', reviewerId: 'RVW-B', reviewTimestamp: '2026-04-18T09:12:00Z',
    finalLabel: 'MASSIVE_DUMP', confidence: 0.89, alternativeLabel: null,
    secondaryReviewRequired: false, secondaryReviewReason: null,
    keyEvidence: ['Sell 85.7%', '-28.6%', '8/9 Metriken kritisch'],
    contradictingEvidence: [], detectionReasonSeen: false,
    reviewNote: 'Unverändert.', dataQualityScore: 5,
  },
  {
    eventId: 'EVT-P03', reviewerId: 'RVW-B', reviewTimestamp: '2026-04-18T09:16:00Z',
    finalLabel: 'NORMAL_VOLATILITY', confidence: 0.94, alternativeLabel: null,
    secondaryReviewRequired: false, secondaryReviewReason: null,
    keyEvidence: ['Alle Metriken grün', 'Buy/Sell ausgeglichen', '-4.2%'],
    contradictingEvidence: [], detectionReasonSeen: false,
    reviewNote: 'Unverändert.', dataQualityScore: 5,
  },
  {
    eventId: 'EVT-P04', reviewerId: 'RVW-B', reviewTimestamp: '2026-04-18T09:20:00Z',
    finalLabel: 'NORMAL_VOLATILITY', confidence: 0.82, alternativeLabel: null,
    secondaryReviewRequired: false, secondaryReviewReason: null,
    keyEvidence: ['+6.8%', 'Keine kritischen Metriken', 'Spread stabil'],
    contradictingEvidence: ['Volume 1.8x'], detectionReasonSeen: false,
    reviewNote: 'Unverändert.', dataQualityScore: 5,
  },
  {
    eventId: 'EVT-P05', reviewerId: 'RVW-B', reviewTimestamp: '2026-04-18T09:25:00Z',
    finalLabel: 'ILLIQUID_RANDOM_MOVE', confidence: 0.84,
    // S4-Check: OB=2, Vol=2.1x → ILLIQUID bestätigt — B erhöht Confidence
    alternativeLabel: null,
    secondaryReviewRequired: false, secondaryReviewReason: null,
    keyEvidence: ['OB=2 <= S4-Schwelle 3', 'Vol=2.1x < 2.5x (kein Dump-Trigger)', '71% Erholung bestätigt ILLIQUID'],
    contradictingEvidence: [], detectionReasonSeen: false,
    reviewNote: 'S4 bestätigt und erhöht Confidence: OB=2 AND Vol=2.1x < 2.5x → deterministisch ILLIQUID.',
    dataQualityScore: 2,
  },
  // EVT-P06: S4-Bestätigung für B (war bereits MASSIVE_DUMP, jetzt mit S4-Begründung)
  {
    eventId: 'EVT-P06', reviewerId: 'RVW-B', reviewTimestamp: '2026-04-18T09:33:00Z',
    finalLabel: 'MASSIVE_DUMP',
    // Runde 1: MASSIVE_DUMP (Conf 0.69) — jetzt durch S4 deterministisch bestätigt
    confidence: 0.88,
    alternativeLabel: null,
    secondaryReviewRequired: false, secondaryReviewReason: null,
    keyEvidence: ['OB=3 <= S4-Schwelle', 'Vol=3.8x >= 2.5x (S4 deterministisch)', 'Sell-Volume 77.9% bestätigt Druck'],
    contradictingEvidence: ['Order-Book-Tiefe 3 — Illiquiditäts-Signal vorhanden'],
    detectionReasonSeen: false,
    reviewNote: 'Runde-1-Entscheidung MASSIVE_DUMP durch S4-Briefing bestätigt und Confidence erhöht. OB=3 AND Vol=3.8x >= 2.5x = deterministisch MASSIVE_DUMP. Secondary Review nicht mehr nötig.',
    dataQualityScore: 3,
  },
  {
    eventId: 'EVT-P07', reviewerId: 'RVW-B', reviewTimestamp: '2026-04-18T09:39:00Z',
    finalLabel: 'WHALE_SELL_NO_CASCADE', confidence: 0.80, alternativeLabel: null,
    secondaryReviewRequired: false, secondaryReviewReason: null,
    keyEvidence: ['Whale 2.3% Supply', 'Einzelorder 38.7%', 'Erholung 67%'],
    contradictingEvidence: ['1 Follow-Sell'], detectionReasonSeen: false,
    reviewNote: 'Unverändert.', dataQualityScore: 5,
  },
  {
    eventId: 'EVT-P08', reviewerId: 'RVW-B', reviewTimestamp: '2026-04-18T09:44:00Z',
    finalLabel: 'BOT_ACTIVITY_NO_PRICE_IMPACT', confidence: 0.93, alternativeLabel: null,
    secondaryReviewRequired: false, secondaryReviewReason: null,
    keyEvidence: ['84% Bot-Prob', 'Vol 7.4x Baseline', 'Preis -1.8%'],
    contradictingEvidence: [], detectionReasonSeen: false,
    reviewNote: 'Unverändert.', dataQualityScore: 5,
  },
  // EVT-P09: S4-Bestätigung für B (war bereits MASSIVE_DUMP — jetzt deterministic)
  {
    eventId: 'EVT-P09', reviewerId: 'RVW-B', reviewTimestamp: '2026-04-18T09:53:00Z',
    finalLabel: 'MASSIVE_DUMP',
    // Runde 1: MASSIVE_DUMP (Conf 0.67) — S4 bestätigt, Confidence steigt
    confidence: 0.85,
    alternativeLabel: null,
    secondaryReviewRequired: false, secondaryReviewReason: null,
    keyEvidence: ['OB=3 <= S4-Schwelle', 'Vol=5.1x >= 2.5x (stark toxisch, S4 deterministisch)', '6/9 Metriken kritisch'],
    contradictingEvidence: ['84 Trades — dünne Datenbasis'],
    detectionReasonSeen: false,
    reviewNote: 'Runde-1-MASSIVE_DUMP durch S4 bestätigt: OB=3 AND Vol=5.1x >= 2.5x → MASSIVE_DUMP. Kein Spielraum. Confidence erhöht.',
    dataQualityScore: 4,
  },
  {
    eventId: 'EVT-P10', reviewerId: 'RVW-B', reviewTimestamp: '2026-04-18T10:00:00Z',
    finalLabel: 'UNCERTAIN', confidence: 0.68, alternativeLabel: 'WHALE_SELL_NO_CASCADE',
    secondaryReviewRequired: true, secondaryReviewReason: 'ALT_LABEL_LOW_CONF',
    keyEvidence: ['Whale identifiziert', '4 Follow-Sells (Grenzbereich)', 'Erholung 42% < 50%'],
    contradictingEvidence: ['Cascade-Grenzzone nicht deterministisch auflösbar'],
    detectionReasonSeen: false,
    reviewNote: 'Unverändert. UNCERTAIN korrekt.', dataQualityScore: 5,
  },
];
