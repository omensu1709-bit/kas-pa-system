/**
 * Pilot Review Runner — v2
 * KAS PA v4.3 — Ground-Truth System
 *
 * Neu in v2:
 *   - resolveS4Rule(): Deterministischer Pre-Filter für MASSIVE_DUMP↔ILLIQUID Konflikte
 *   - ASYMMETRISCHE_PENALTY_MATRIX: Exponentieller Score-Abzug für EXECUTION↔NOISE Konflikte
 *   - computeWeightedKASScore(): Asymmetrisch gewichteter Validierungs-Score
 *   - computeValidationGate(): Status-Gate mit Blocking-Bedingung kritischer Konfusions-Zelle
 *   - runS4PreFilter(): Batch-Anwendung auf alle ReviewPairs
 */

import type {
  GroundTruthLabel,
  ReviewSubmission,
  ReviewPair,
  PilotReport,
  SecondaryReviewReason,
  S4FilterInput,
  S4FilterResult,
  PenaltyMatrix,
  WeightedAgreementScore,
  ValidationGate,
  ValidationStatus,
} from './review-types.js';
import { PILOT_CASES } from './pilot-cases.js';

const ALL_LABELS: GroundTruthLabel[] = [
  'MASSIVE_DUMP',
  'NORMAL_VOLATILITY',
  'ILLIQUID_RANDOM_MOVE',
  'WHALE_SELL_NO_CASCADE',
  'BOT_ACTIVITY_NO_PRICE_IMPACT',
  'UNCERTAIN',
  'DATA_INSUFFICIENT',
];

// ─── S4-Schwellenwerte ────────────────────────────────────────────────────────

/** Maximale Order-Book-Tiefe für ILLIQUID-Klassifikation (inclusive) */
const OB_DEPTH_THRESHOLD = 3;

/**
 * Mindestwert des Volume-Spike-Multiplikators für einen "toxischen" Dump
 * in einem flachen Order-Book. Unterhalb = stochastisches Rauschen.
 */
const VOLUME_SPIKE_REQ = 2.5;

// ─── Asymmetrische Penalty-Matrix ────────────────────────────────────────────
//
// Zeile = Reviewer A Label, Spalte = Reviewer B Label.
// Wert 0.0 = keine Strafe (Einigkeit oder harmloses Paar).
// Wert 1.0 = lineare Strafe (Standard-Konflikt).
// Wert > 1.0 = exponentiell gewichtete Strafe (EXECUTION↔NOISE Konflikt).
//
// Kategorien:
//   EXECUTION_CLASS: MASSIVE_DUMP (löst Short-Trade aus)
//   NOISE_CLASS:     ILLIQUID_RANDOM_MOVE, NORMAL_VOLATILITY, BOT_ACTIVITY, DATA_INSUFFICIENT
//   AMBIGUOUS_CLASS: UNCERTAIN, WHALE_SELL_NO_CASCADE
//
// Asymmetrie-Begründung:
//   MASSIVE_DUMP ↔ ILLIQUID = 3.0 (höchste Strafe):
//     Falsch-Positiv → Execution in leerem Orderbuch = Slippage-Desaster
//     Falsch-Negativ → verpasstes Signal wenn echter Dump als Rauschen abgetan wird
//   MASSIVE_DUMP ↔ NORMAL   = 2.5 (ebenfalls katastrophal aber seltener)
//   MASSIVE_DUMP ↔ UNCERTAIN = 1.5 (immerhin Eskalation erzwungen)
//   ILLIQUID ↔ UNCERTAIN     = 0.8 (harmlos: kein Trade in beiden Fällen)

const PENALTY_MATRIX: PenaltyMatrix = {
  MASSIVE_DUMP: {
    MASSIVE_DUMP:                   0.0,
    ILLIQUID_RANDOM_MOVE:           3.0,  // KRITISCH: Execution↔Noise
    NORMAL_VOLATILITY:              2.5,  // KRITISCH: Execution↔Noise
    WHALE_SELL_NO_CASCADE:          1.8,  // HOCH: Execution↔Ambiguous
    BOT_ACTIVITY_NO_PRICE_IMPACT:   2.0,  // HOCH: Execution↔Noise
    UNCERTAIN:                      1.5,  // MITTEL: Eskalation erzwungen
    DATA_INSUFFICIENT:              1.2,  // NIEDRIG: Eskalation erzwungen
  },
  ILLIQUID_RANDOM_MOVE: {
    MASSIVE_DUMP:                   3.0,  // Symmetrisch zu oben
    ILLIQUID_RANDOM_MOVE:           0.0,
    NORMAL_VOLATILITY:              0.8,  // HARMLOS: beide kein Trade
    WHALE_SELL_NO_CASCADE:          1.0,  // STANDARD
    BOT_ACTIVITY_NO_PRICE_IMPACT:   0.8,  // HARMLOS
    UNCERTAIN:                      0.8,  // HARMLOS
    DATA_INSUFFICIENT:              0.6,  // HARMLOS
  },
  NORMAL_VOLATILITY: {
    MASSIVE_DUMP:                   2.5,
    ILLIQUID_RANDOM_MOVE:           0.8,
    NORMAL_VOLATILITY:              0.0,
    WHALE_SELL_NO_CASCADE:          1.0,
    BOT_ACTIVITY_NO_PRICE_IMPACT:   0.7,  // HARMLOS: beide kein Trade
    UNCERTAIN:                      0.9,
    DATA_INSUFFICIENT:              0.6,
  },
  WHALE_SELL_NO_CASCADE: {
    MASSIVE_DUMP:                   1.8,
    ILLIQUID_RANDOM_MOVE:           1.0,
    NORMAL_VOLATILITY:              1.0,
    WHALE_SELL_NO_CASCADE:          0.0,
    BOT_ACTIVITY_NO_PRICE_IMPACT:   1.0,
    UNCERTAIN:                      0.9,
    DATA_INSUFFICIENT:              0.7,
  },
  BOT_ACTIVITY_NO_PRICE_IMPACT: {
    MASSIVE_DUMP:                   2.0,
    ILLIQUID_RANDOM_MOVE:           0.8,
    NORMAL_VOLATILITY:              0.7,
    WHALE_SELL_NO_CASCADE:          1.0,
    BOT_ACTIVITY_NO_PRICE_IMPACT:   0.0,
    UNCERTAIN:                      0.8,
    DATA_INSUFFICIENT:              0.6,
  },
  UNCERTAIN: {
    MASSIVE_DUMP:                   1.5,
    ILLIQUID_RANDOM_MOVE:           0.8,
    NORMAL_VOLATILITY:              0.9,
    WHALE_SELL_NO_CASCADE:          0.9,
    BOT_ACTIVITY_NO_PRICE_IMPACT:   0.8,
    UNCERTAIN:                      0.0,
    DATA_INSUFFICIENT:              0.5,
  },
  DATA_INSUFFICIENT: {
    MASSIVE_DUMP:                   1.2,
    ILLIQUID_RANDOM_MOVE:           0.6,
    NORMAL_VOLATILITY:              0.6,
    WHALE_SELL_NO_CASCADE:          0.7,
    BOT_ACTIVITY_NO_PRICE_IMPACT:   0.6,
    UNCERTAIN:                      0.5,
    DATA_INSUFFICIENT:              0.0,
  },
};

// ─── Kritische Konfliktkombinationen (für Pair-Typisierung) ──────────────────

const CRITICAL_CONFLICT_PAIRS = new Set([
  'MASSIVE_DUMP|ILLIQUID_RANDOM_MOVE',
  'ILLIQUID_RANDOM_MOVE|MASSIVE_DUMP',
  'MASSIVE_DUMP|WHALE_SELL_NO_CASCADE',
  'WHALE_SELL_NO_CASCADE|MASSIVE_DUMP',
  'MASSIVE_DUMP|UNCERTAIN',
  'UNCERTAIN|MASSIVE_DUMP',
]);

const ADJACENT_PAIRS = new Set([
  'NORMAL_VOLATILITY|BOT_ACTIVITY_NO_PRICE_IMPACT',
  'BOT_ACTIVITY_NO_PRICE_IMPACT|NORMAL_VOLATILITY',
  'WHALE_SELL_NO_CASCADE|UNCERTAIN',
  'UNCERTAIN|WHALE_SELL_NO_CASCADE',
  'ILLIQUID_RANDOM_MOVE|UNCERTAIN',
  'UNCERTAIN|ILLIQUID_RANDOM_MOVE',
]);

// ─── S4-Filter: Deterministischer Konflikt-Resolver ──────────────────────────

/**
 * Deterministischer S4-Filter für MASSIVE_DUMP↔ILLIQUID_RANDOM_MOVE Konflikte.
 *
 * Logik:
 *   orderBookDepthLevels <= OB_DEPTH_THRESHOLD (3):
 *     volumeSpikeMultiplier < VOLUME_SPIKE_REQ (2.5) → ILLIQUID_RANDOM_MOVE
 *       (flaches Buch + kein toxisches Volumen = stochastisches Rauschen)
 *     volumeSpikeMultiplier >= VOLUME_SPIKE_REQ (2.5) → MASSIVE_DUMP
 *       (flaches Buch + toxisches Volumen = echter Dump nutzt Illiquidität aus)
 *   orderBookDepthLevels > OB_DEPTH_THRESHOLD:
 *     → UNCERTAIN (Orderbuch zu tief für ILLIQUID-Klassifikation, aber kein DUMP-Beweis)
 *
 * @param orderBookDepthLevels  Anzahl aktiver Order-Book-Levels im Fenster
 * @param volumeSpikeMultiplier Aktuelles Volumen / gleitender 24h-Durchschnitt
 */
export function resolveS4Rule(
  orderBookDepthLevels: number,
  volumeSpikeMultiplier: number
): 'MASSIVE_DUMP' | 'ILLIQUID_RANDOM_MOVE' | 'UNCERTAIN' {
  if (orderBookDepthLevels <= OB_DEPTH_THRESHOLD) {
    if (volumeSpikeMultiplier < VOLUME_SPIKE_REQ) {
      return 'ILLIQUID_RANDOM_MOVE';
    }
    return 'MASSIVE_DUMP';
  }
  return 'UNCERTAIN';
}

/**
 * Wendet resolveS4Rule auf ein Event an und liefert eine vollständige Annotation
 * mit Volume-Koeffizient, Override-Flags und menschenlesbarer Begründung.
 *
 * Nur auf Events anwendbar bei denen MASSIVIE_DUMP↔ILLIQUID_RANDOM_MOVE Konflikt vorliegt.
 */
export function applyS4Filter(input: S4FilterInput): S4FilterResult {
  const { eventId, orderBookDepthLevels, volumeSpikeMultiplier, reviewerLabelA, reviewerLabelB } = input;

  // Prüfen ob S4-Filter relevant ist
  const involvesMD = reviewerLabelA === 'MASSIVE_DUMP' || reviewerLabelB === 'MASSIVE_DUMP';
  const involvesIL = reviewerLabelA === 'ILLIQUID_RANDOM_MOVE' || reviewerLabelB === 'ILLIQUID_RANDOM_MOVE';
  const applicable = involvesMD && involvesIL && reviewerLabelA !== reviewerLabelB;

  if (!applicable) {
    return {
      eventId,
      applicable: false,
      deterministicLabel: 'NOT_APPLICABLE',
      orderBookDepthLevels,
      volumeSpikeMultiplier,
      volumeCoefficient: volumeSpikeMultiplier / 10, // normiert, zur Info
      splitPoint: 'N/A',
      conflictResolved: false,
      overridesReviewerA: false,
      overridesReviewerB: false,
      rationale: 'Kein MASSIVE_DUMP↔ILLIQUID_RANDOM_MOVE Konflikt — S4-Filter nicht anwendbar.',
    };
  }

  const deterministicLabel = resolveS4Rule(orderBookDepthLevels, volumeSpikeMultiplier);

  // Normierter Volume-Koeffizient: 0 = kein Volumen, 1 = 10x oder mehr
  const volumeCoefficient = Math.min(volumeSpikeMultiplier / 10, 1.0);

  const splitPoint = orderBookDepthLevels <= OB_DEPTH_THRESHOLD
    ? 'BELOW_OB_THRESHOLD'
    : 'ABOVE_OB_THRESHOLD';

  const overridesA = (deterministicLabel as string) !== 'NOT_APPLICABLE' && reviewerLabelA !== deterministicLabel;
  const overridesB = (deterministicLabel as string) !== 'NOT_APPLICABLE' && reviewerLabelB !== deterministicLabel;
  const conflictResolved = deterministicLabel !== 'UNCERTAIN' && (overridesA || overridesB);

  let rationale: string;
  if (deterministicLabel === 'ILLIQUID_RANDOM_MOVE') {
    rationale =
      `OB-Tiefe ${orderBookDepthLevels} <= ${OB_DEPTH_THRESHOLD} (ILLIQUID-Schwelle) ` +
      `UND Volume-Spike ${volumeSpikeMultiplier.toFixed(2)}x < ${VOLUME_SPIKE_REQ}x (kein toxisches Volumen). ` +
      `→ Stochastisches Rauschen durch Illiquidität. S4-Regel: ILLIQUID_RANDOM_MOVE.`;
  } else if (deterministicLabel === 'MASSIVE_DUMP') {
    rationale =
      `OB-Tiefe ${orderBookDepthLevels} <= ${OB_DEPTH_THRESHOLD} (ILLIQUID-Schwelle) ` +
      `ABER Volume-Spike ${volumeSpikeMultiplier.toFixed(2)}x >= ${VOLUME_SPIKE_REQ}x (toxisches Volumen). ` +
      `→ Echter Dump nutzt Illiquidität aus. S4-Regel: MASSIVE_DUMP.`;
  } else {
    rationale =
      `OB-Tiefe ${orderBookDepthLevels} > ${OB_DEPTH_THRESHOLD} — Orderbuch zu tief für ILLIQUID-Klassifikation. ` +
      `S4-Regel nicht entscheidbar. → UNCERTAIN bleibt.`;
  }

  return {
    eventId,
    applicable,
    deterministicLabel,
    orderBookDepthLevels,
    volumeSpikeMultiplier,
    volumeCoefficient,
    splitPoint,
    conflictResolved,
    overridesReviewerA: overridesA,
    overridesReviewerB: overridesB,
    rationale,
  };
}

/**
 * Batch-Anwendung des S4-Filters auf alle ReviewPairs.
 * Extrahiert orderBookDepthLevels und volumeRatioVsBaseline aus den Pilot-Cases.
 */
export function runS4PreFilter(pairs: ReviewPair[]): S4FilterResult[] {
  const caseIndex = new Map(PILOT_CASES.map(c => [c.eventId, c]));

  return pairs.map(pair => {
    const eventCase = caseIndex.get(pair.eventId);

    const input: S4FilterInput = {
      eventId: pair.eventId,
      orderBookDepthLevels: eventCase?.volume.orderBookDepthLevels ?? 99,
      volumeSpikeMultiplier: eventCase?.volume.volumeRatioVsBaseline ?? 1.0,
      reviewerLabelA: pair.reviewA.finalLabel,
      reviewerLabelB: pair.reviewB.finalLabel,
    };

    return applyS4Filter(input);
  });
}

// ─── Asymmetrischer KAS-Score ─────────────────────────────────────────────────

/**
 * Berechnet den KAS-Score (KAS PA Agreement Score):
 * Ein asymmetrisch gewichteter Validierungs-Score der Konflikte zwischen
 * EXECUTION-Klassen (MASSIVE_DUMP) und NOISE-Klassen (ILLIQUID, NORMAL, BOT)
 * exponentiell bestraft.
 *
 * Formel:
 *   base_agreement = (einige Pairs) / (total Pairs)
 *   penalty = sum(penaltyWeight^2 / n) für alle Konflikte (quadratisch, nicht linear)
 *   kas_score = base_agreement * (1 - penalty)
 *
 * Interpretation:
 *   >= 0.85 → VALIDATED (Ziel)
 *   0.70–0.84 → DEGRADED (Alignment-Session nötig)
 *   < 0.70 → BLOCKED oder re-Kalibrierung
 */
export function computeWeightedKASScore(pairs: ReviewPair[]): WeightedAgreementScore {
  const n = pairs.length;
  if (n === 0) {
    return {
      cohensKappa: 0,
      kasScore: 0,
      penaltyFactor: 1,
      penaltyBreakdown: [],
    };
  }

  const cohensKappa = computeCohensKappa(pairs);

  const baseAgreement = pairs.filter(p => p.sameClass).length / n;

  // Penalty-Breakdown für alle Konflikte
  const breakdown: WeightedAgreementScore['penaltyBreakdown'] = [];
  let totalPenaltySquared = 0;

  for (const pair of pairs) {
    if (pair.sameClass) continue;

    const la = pair.reviewA.finalLabel;
    const lb = pair.reviewB.finalLabel;
    const w = PENALTY_MATRIX[la][lb];

    if (w > 0) {
      // Quadratische Penalty: schwerere Konflikte dominieren überproportional
      const penaltyContribution = (w * w) / n;
      totalPenaltySquared += penaltyContribution;

      breakdown.push({
        eventId: pair.eventId,
        labelA: la,
        labelB: lb,
        penaltyWeight: w,
        contribution: penaltyContribution,
      });
    }
  }

  // Sortieren: höchste Contribution zuerst
  breakdown.sort((a, b) => b.contribution - a.contribution);

  // Gesamt-Penalty-Faktor (gedeckelt bei 1.0 damit kasScore >= 0)
  const penaltyFactor = Math.min(totalPenaltySquared, 1.0);

  // KAS-Score: base_agreement gemindert durch penaltyFactor
  const kasScore = Math.max(baseAgreement * (1 - penaltyFactor), 0);

  return { cohensKappa, kasScore, penaltyFactor, penaltyBreakdown: breakdown };
}

// ─── Validierungs-Gate ────────────────────────────────────────────────────────

/**
 * Berechnet den ValidationStatus basierend auf:
 * 1. Kritische Konfusions-Zelle MASSIVE_DUMP↔ILLIQUID_RANDOM_MOVE muss = 0 für VALIDATED
 * 2. KAS-Score >= 0.85 für VALIDATED
 * 3. Wenn kritische Zelle > 0 → immer BLOCKED, unabhängig von KAS-Score
 */
export function computeValidationGate(
  pairs: ReviewPair[],
  weighted: WeightedAgreementScore
): ValidationGate {
  const rawAgreementPct = computeRawAgreement(pairs);

  // Kritische Konfusions-Zelle: beide Richtungen MD↔IL
  const criticalCellEvents = pairs.filter(p => {
    const pairKey = `${p.reviewA.finalLabel}|${p.reviewB.finalLabel}`;
    return (
      pairKey === 'MASSIVE_DUMP|ILLIQUID_RANDOM_MOVE' ||
      pairKey === 'ILLIQUID_RANDOM_MOVE|MASSIVE_DUMP'
    );
  });

  const criticalCellCount = criticalCellEvents.length;
  const blockingEvents = criticalCellEvents.map(p => p.eventId);

  let status: ValidationStatus;
  let nextAction: string;

  if (pairs.length < 10) {
    status = 'CALIBRATING';
    nextAction = 'Pilot-Set auf mindestens 10 Events erweitern.';
  } else if (criticalCellCount > 0) {
    status = 'BLOCKED';
    nextAction =
      `${criticalCellCount} Konflikt(e) in kritischer MASSIVE_DUMP↔ILLIQUID Zelle (Events: ${blockingEvents.join(', ')}). ` +
      `S4-Pre-Filter auf alle betroffenen Events anwenden und Reviewer-Alignment durchführen. ` +
      `Gate wechselt erst auf VALIDATED wenn diese Zelle = 0.`;
  } else if (weighted.kasScore < 0.85) {
    status = 'DEGRADED';
    nextAction =
      `KAS-Score ${weighted.kasScore.toFixed(3)} < 0.85 (Ziel). ` +
      `Kritische Zelle ist sauber — Alignment-Session für andere Konflikte empfohlen.`;
  } else {
    status = 'VALIDATED';
    nextAction = 'Runde 2 mit Produktions-Events kann starten.';
  }

  return {
    status,
    kasScore: weighted.kasScore,
    cohensKappa: weighted.cohensKappa,
    rawAgreementPct,
    criticalCellCount,
    blockingEvents,
    nextAction,
  };
}

// ─── Pair-Analyse ─────────────────────────────────────────────────────────────

export function analyzeReviewPair(a: ReviewSubmission, b: ReviewSubmission): ReviewPair {
  if (a.eventId !== b.eventId) {
    throw new Error(`Event-ID mismatch: ${a.eventId} vs ${b.eventId}`);
  }

  const sameClass = a.finalLabel === b.finalLabel;
  const confidenceDiff = Math.abs(a.confidence - b.confidence);
  const pairKey = `${a.finalLabel}|${b.finalLabel}`;

  let conflictType: ReviewPair['conflictType'] = 'NONE';
  if (!sameClass) {
    if (CRITICAL_CONFLICT_PAIRS.has(pairKey)) {
      conflictType = 'CRITICAL_CONFLICT';
    } else if (ADJACENT_PAIRS.has(pairKey)) {
      conflictType = 'ADJACENT_CLASS';
    } else {
      conflictType = 'FULL_DISAGREEMENT';
    }
  } else if (confidenceDiff >= 0.2) {
    conflictType = 'CONFIDENCE_ONLY';
  }

  const requiresSecondary =
    a.secondaryReviewRequired ||
    b.secondaryReviewRequired ||
    conflictType === 'CRITICAL_CONFLICT' ||
    conflictType === 'FULL_DISAGREEMENT';

  return {
    eventId: a.eventId,
    reviewA: a,
    reviewB: b,
    agreed: sameClass,
    sameClass,
    confidenceDiff,
    conflictType,
    requiresSecondary,
  };
}

// ─── Cohen's Kappa ────────────────────────────────────────────────────────────

export function computeCohensKappa(pairs: ReviewPair[]): number {
  const n = pairs.length;
  if (n === 0) return 0;

  const observed = pairs.filter(p => p.sameClass).length / n;

  // Marginale Häufigkeiten
  const countA: Record<string, number> = {};
  const countB: Record<string, number> = {};
  for (const p of pairs) {
    countA[p.reviewA.finalLabel] = (countA[p.reviewA.finalLabel] ?? 0) + 1;
    countB[p.reviewB.finalLabel] = (countB[p.reviewB.finalLabel] ?? 0) + 1;
  }

  let expected = 0;
  for (const label of ALL_LABELS) {
    expected += ((countA[label] ?? 0) / n) * ((countB[label] ?? 0) / n);
  }

  if (expected === 1) return 1;
  return (observed - expected) / (1 - expected);
}

// ─── Raw Agreement ────────────────────────────────────────────────────────────

export function computeRawAgreement(pairs: ReviewPair[]): number {
  if (pairs.length === 0) return 0;
  return pairs.filter(p => p.sameClass).length / pairs.length;
}

// ─── Confusion Matrix ─────────────────────────────────────────────────────────

export function buildConfusionMatrix(
  pairs: ReviewPair[]
): Record<GroundTruthLabel, Record<GroundTruthLabel, number>> {
  const matrix = {} as Record<GroundTruthLabel, Record<GroundTruthLabel, number>>;

  for (const la of ALL_LABELS) {
    matrix[la] = {} as Record<GroundTruthLabel, number>;
    for (const lb of ALL_LABELS) {
      matrix[la][lb] = 0;
    }
  }

  for (const p of pairs) {
    matrix[p.reviewA.finalLabel][p.reviewB.finalLabel] += 1;
  }

  return matrix;
}

// ─── Häufigste Konflikte ──────────────────────────────────────────────────────

export function findTopConflicts(
  pairs: ReviewPair[],
  topN = 5
): Array<{ pair: [GroundTruthLabel, GroundTruthLabel]; count: number }> {
  const counts: Record<string, number> = {};

  for (const p of pairs) {
    if (!p.sameClass) {
      // Normalisiert: alphabetisch geordnet für Deduplikation
      const [l1, l2] = [p.reviewA.finalLabel, p.reviewB.finalLabel].sort();
      const key = `${l1}|${l2}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }

  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN)
    .map(([key, count]) => {
      const [l1, l2] = key.split('|') as [GroundTruthLabel, GroundTruthLabel];
      return { pair: [l1, l2], count };
    });
}

// ─── Secondary-Review-Trigger-Statistik ──────────────────────────────────────

export function countSecondaryTriggers(
  submissions: ReviewSubmission[]
): Record<SecondaryReviewReason, number> {
  const counts = {} as Record<SecondaryReviewReason, number>;

  for (const s of submissions) {
    if (s.secondaryReviewRequired && s.secondaryReviewReason) {
      counts[s.secondaryReviewReason] = (counts[s.secondaryReviewReason] ?? 0) + 1;
    }
  }

  return counts;
}

// ─── Problematische Klassenpaare identifizieren ───────────────────────────────

function identifyProblematicPairs(pairs: ReviewPair[]): string[] {
  const problems: string[] = [];

  const criticalConflicts = pairs.filter(p => p.conflictType === 'CRITICAL_CONFLICT');
  if (criticalConflicts.length > 0) {
    const grouped: Record<string, string[]> = {};
    for (const p of criticalConflicts) {
      const key = [p.reviewA.finalLabel, p.reviewB.finalLabel].sort().join(' vs ');
      grouped[key] = grouped[key] ?? [];
      grouped[key].push(p.eventId);
    }
    for (const [pair, events] of Object.entries(grouped)) {
      problems.push(`KRITISCHER KONFLIKT: ${pair} (Events: ${events.join(', ')})`);
    }
  }

  const fullDisagreements = pairs.filter(p => p.conflictType === 'FULL_DISAGREEMENT');
  if (fullDisagreements.length > 0) {
    problems.push(
      `VOLLSTÄNDIGE UNEINIGKEIT: ${fullDisagreements.map(p => p.eventId).join(', ')}`
    );
  }

  // Klassen mit > 50% Verwechslungsrate (bei >= 2 Events dieser Klasse)
  for (const label of ALL_LABELS) {
    const labelPairs = pairs.filter(
      p => p.reviewA.finalLabel === label || p.reviewB.finalLabel === label
    );
    if (labelPairs.length >= 2) {
      const confused = labelPairs.filter(p => !p.sameClass).length;
      if (confused / labelPairs.length > 0.5) {
        problems.push(`HOHE VERWECHSLUNGSRATE: ${label} (${confused}/${labelPairs.length} Fälle)`);
      }
    }
  }

  return problems;
}

// ─── Regelprobleme aus Notizen extrahieren ────────────────────────────────────

function extractRuleProblems(pairs: ReviewPair[]): string[] {
  const problems: string[] = [];

  // UNCERTAIN ohne alternativeLabel trotz niedrigem Confidence
  const uncertainWithoutAlt = pairs.flatMap(p => [p.reviewA, p.reviewB]).filter(
    s => s.finalLabel === 'UNCERTAIN' && s.alternativeLabel === null && s.confidence < 0.7
  );
  if (uncertainWithoutAlt.length > 0) {
    problems.push(
      `REGEL: alternativeLabel-Pflicht bei UNCERTAIN zu unklar — ${uncertainWithoutAlt.length} Submissions ohne alternativeLabel`
    );
  }

  // detectionReasonSeen = true — Priming-Verstoß
  const primingViolations = pairs.flatMap(p => [p.reviewA, p.reviewB]).filter(
    s => s.detectionReasonSeen === true
  );
  if (primingViolations.length > 0) {
    problems.push(
      `BIAS: detectionReasonSeen = true bei ${primingViolations.length} Submissions — Daten-Präsentation überprüfen`
    );
  }

  // Confidence-Grenzzone: viele Submissions mit 0.58–0.62 (Schwelle unklar)
  const borderlineConf = pairs.flatMap(p => [p.reviewA, p.reviewB]).filter(
    s => s.confidence >= 0.55 && s.confidence <= 0.65
  );
  if (borderlineConf.length >= 3) {
    problems.push(
      `REGEL: 0.6-Schwelle für UNCERTAIN zu nah an häufig gewählten Konfidenzwerten — ${borderlineConf.length} Submissions im Grenzbereich`
    );
  }

  // contradictingEvidence leer trotz UNCERTAIN
  const uncertainNoContra = pairs.flatMap(p => [p.reviewA, p.reviewB]).filter(
    s => s.finalLabel === 'UNCERTAIN' && s.contradictingEvidence.length === 0
  );
  if (uncertainNoContra.length > 0) {
    problems.push(
      `REGEL: contradictingEvidence bei UNCERTAIN oft leer (${uncertainNoContra.length}x) — Anforderung zu unklar`
    );
  }

  return problems;
}

// ─── Empfehlungen generieren ──────────────────────────────────────────────────

function generateRecommendations(
  report: Omit<PilotReport, 'recommendations'>,
  pairs: ReviewPair[]
): string[] {
  const recs: string[] = [];

  if (report.rawAgreementPct < 0.75) {
    recs.push('DRINGEND: Raw-Agreement < 75% — Alignment-Session vor Runde 2 erforderlich');
  }

  if (report.cohensKappa < 0.6) {
    recs.push('DRINGEND: Kappa < 0.6 — Kalibrierungs-Session mit Gold-Standard-Fällen wiederholen');
  } else if (report.cohensKappa < 0.7) {
    recs.push('WARNUNG: Kappa 0.6–0.7 — Alignment-Session für problematische Klassenpaare empfohlen');
  }

  if (report.uncertainRate > 0.3) {
    recs.push('WARNUNG: > 30% UNCERTAIN-Rate — Reviewer tendieren zu defensivem Labeling, Kalibrierung prüfen');
  }

  const criticalConflictPairs = pairs.filter(p => p.conflictType === 'CRITICAL_CONFLICT');
  if (criticalConflictPairs.length >= 2) {
    recs.push('REGELANPASSUNG: ILLIQUID vs MASSIVE_DUMP — Entscheidungsbaum S4-Regel mit konkreten Beispielfällen ergänzen');
  }

  if (report.dataInsufficientRate > 0.2) {
    recs.push('WARNUNG: > 20% DATA_INSUFFICIENT — Pilot-Set hatte zu viele Datenlücken oder S1/S2-Grenze zu großzügig');
  }

  const altLabelTriggers = report.secondaryTriggersByReason['ALT_LABEL_LOW_CONF'] ?? 0;
  if (altLabelTriggers >= 4) {
    recs.push('REGELKLARSTELLUNG: alternativeLabel-Schwelle (Confidence < 0.75) zu oft getriggert — Regel präzisieren');
  }

  if (report.problematicClassPairs.some(p => p.includes('WHALE'))) {
    recs.push('REGELANPASSUNG: WHALE_SELL_NO_CASCADE — Cascade-Schwelle (3–5 Follow-Sells) mit Beispielzahlen verdeutlichen');
  }

  if (recs.length === 0) {
    recs.push('Pilot erfolgreich: Kappa und Raw-Agreement im Zielbereich. Runde 2 mit Produktions-Events kann starten.');
  }

  return recs;
}

// ─── Haupt-Runner ─────────────────────────────────────────────────────────────

export function runPilotReview(
  submissionsA: ReviewSubmission[],
  submissionsB: ReviewSubmission[]
): PilotReport {
  // Index nach eventId
  const indexB = new Map(submissionsB.map(s => [s.eventId, s]));

  const pairs: ReviewPair[] = [];
  for (const a of submissionsA) {
    const b = indexB.get(a.eventId);
    if (!b) {
      console.warn(`[PilotRunner] Kein Review B für ${a.eventId} — übersprungen`);
      continue;
    }
    pairs.push(analyzeReviewPair(a, b));
  }

  // 1. S4-Pre-Filter — deterministisch vor allen Score-Berechnungen
  const s4FilterResults = runS4PreFilter(pairs);

  // 2. KAS-Score und Validation-Gate
  const weightedScore = computeWeightedKASScore(pairs);
  const validationGate = computeValidationGate(pairs, weightedScore);

  const allSubmissions = [...submissionsA, ...submissionsB];
  const totalLabels = allSubmissions.map(s => s.finalLabel);

  const uncertainRate =
    totalLabels.filter(l => l === 'UNCERTAIN').length / totalLabels.length;
  const dataInsufficientRate =
    totalLabels.filter(l => l === 'DATA_INSUFFICIENT').length / totalLabels.length;

  const rawAgreementPct = computeRawAgreement(pairs);
  const cohensKappa = computeCohensKappa(pairs);
  const confusionMatrix = buildConfusionMatrix(pairs);
  const conflictPairs = findTopConflicts(pairs);
  const secondaryTriggersByReason = countSecondaryTriggers(allSubmissions);
  const problematicClassPairs = identifyProblematicPairs(pairs);
  const rulesNeedingClarification = extractRuleProblems(pairs);

  const reportWithoutRecs: Omit<PilotReport, 'recommendations'> = {
    totalEvents: pairs.length,
    rawAgreementPct,
    cohensKappa,
    weightedScore,
    validationGate,
    s4FilterResults,
    confusionMatrix,
    conflictPairs,
    uncertainRate,
    dataInsufficientRate,
    secondaryTriggersByReason,
    problematicClassPairs,
    rulesNeedingClarification,
  };

  const recommendations = generateRecommendations(reportWithoutRecs, pairs);

  return { ...reportWithoutRecs, recommendations };
}

// ─── Report-Formatter ─────────────────────────────────────────────────────────

export function formatPilotReport(report: PilotReport, designLabels?: Record<string, GroundTruthLabel>): string {
  const gate = report.validationGate;
  const wScore = report.weightedScore;
  const gateSymbol = gate.status === 'VALIDATED' ? '✓' : gate.status === 'BLOCKED' ? '✗' : '~';

  const lines: string[] = [
    '═══════════════════════════════════════════════════════',
    '  KAS PA GROUND-TRUTH — PILOT REVIEW BERICHT v2',
    '═══════════════════════════════════════════════════════',
    '',
    `  Validation Gate:    [${gateSymbol}] ${gate.status}`,
    `  KAS-Score:          ${wScore.kasScore.toFixed(3)}  (Ziel: >= 0.85)`,
    `  Penalty-Faktor:     ${wScore.penaltyFactor.toFixed(3)}  (0.0 = keine Strafe)`,
    `  Krit. Zelle MD↔IL:  ${gate.criticalCellCount}  (MUSS 0 sein für VALIDATED)`,
    '',
    `  Raw Agreement:      ${(report.rawAgreementPct * 100).toFixed(1)}%  (Ziel: >= 80%)`,
    `  Cohen's Kappa:      ${report.cohensKappa.toFixed(3)}  (Ziel: >= 0.70)`,
    `  UNCERTAIN-Rate:     ${(report.uncertainRate * 100).toFixed(1)}%`,
    `  DATA_INSUFF.-Rate:  ${(report.dataInsufficientRate * 100).toFixed(1)}%`,
    '',
    '─── S4-Pre-Filter Ergebnisse ────────────────────────────',
  ];

  for (const r of report.s4FilterResults) {
    if (r.applicable) {
      lines.push(
        `  ${r.eventId}: OB=${r.orderBookDepthLevels} | VolSpike=${r.volumeSpikeMultiplier.toFixed(2)}x` +
        ` | S4→ ${r.deterministicLabel} | Resolved: ${r.conflictResolved}`
      );
      lines.push(`    ${r.rationale}`);
    }
  }

  if (!report.s4FilterResults.some(r => r.applicable)) {
    lines.push('  Keine MASSIVE_DUMP↔ILLIQUID Konflikte — S4-Filter nicht getriggert.');
  }

  if (wScore.penaltyBreakdown.length > 0) {
    lines.push('', '─── Penalty-Breakdown (höchste Konflikte) ────────────────');
    for (const pb of wScore.penaltyBreakdown.slice(0, 5)) {
      lines.push(
        `  ${pb.eventId}: ${pb.labelA} vs ${pb.labelB} | w=${pb.penaltyWeight.toFixed(1)} | contrib=${pb.contribution.toFixed(4)}`
      );
    }
  }

  lines.push('', `─── Validation Gate: ${gate.status} ─────────────────────────`);
  lines.push(`  Nächste Aktion: ${gate.nextAction}`);
  if (gate.blockingEvents.length > 0) {
    lines.push(`  Blockierende Events: ${gate.blockingEvents.join(', ')}`);
  }

  lines.push('', '─── Häufigste Klassenkonflikte ──────────────────────────');

  if (report.conflictPairs.length === 0) {
    lines.push('  Keine Konflikte.');
  } else {
    for (const { pair, count } of report.conflictPairs) {
      lines.push(`  ${pair[0]} vs ${pair[1]}: ${count}x`);
    }
  }

  lines.push('', '─── Problematische Klassenpaare ─────────────────────────');
  if (report.problematicClassPairs.length === 0) {
    lines.push('  Keine kritischen Probleme identifiziert.');
  } else {
    for (const p of report.problematicClassPairs) {
      lines.push(`  • ${p}`);
    }
  }

  lines.push('', '─── Regeln die unklar waren ─────────────────────────────');
  if (report.rulesNeedingClarification.length === 0) {
    lines.push('  Keine Regelprobleme identifiziert.');
  } else {
    for (const r of report.rulesNeedingClarification) {
      lines.push(`  • ${r}`);
    }
  }

  lines.push('', '─── Secondary Review Trigger (nach Reason-Code) ─────────');
  const triggerEntries = Object.entries(report.secondaryTriggersByReason);
  if (triggerEntries.length === 0) {
    lines.push('  Keine Secondary-Trigger ausgelöst.');
  } else {
    for (const [reason, count] of triggerEntries.sort(([, a], [, b]) => b - a)) {
      lines.push(`  ${reason}: ${count}x`);
    }
  }

  lines.push('', '─── Empfehlungen vor Runde 2 ────────────────────────────');
  for (const rec of report.recommendations) {
    lines.push(`  [!] ${rec}`);
  }

  lines.push('', '═══════════════════════════════════════════════════════');

  return lines.join('\n');
}

// ─── Paket-Export für Reviewer ────────────────────────────────────────────────

export function exportReviewerPackage(reviewerId: string) {
  const { getBlindPilotCases } = require('./pilot-cases.js');
  const blindCases = getBlindPilotCases();

  return {
    packageVersion: 'PILOT-R1',
    reviewerId,
    exportTimestamp: new Date().toISOString(),
    instructions: [
      'Labele jeden Fall OHNE Kenntnis des Token-Namens.',
      'Schaue die KAS-PA-Prediction erst NACH dem Labeling an.',
      'Setze detectionReasonSeen = false solange du nicht vorher die Modell-Ausgabe gesehen hast.',
      'Vergib genau 2–3 keyEvidence-Einträge.',
      'Setze alternativeLabel wenn > 1 Klasse plausibel war.',
      'Confidence < 0.6 → finalLabel automatisch UNCERTAIN.',
    ],
    events: blindCases,
    submissionTemplate: {
      eventId: '',
      reviewerId,
      reviewTimestamp: '',
      finalLabel: '',
      confidence: 0,
      alternativeLabel: null,
      secondaryReviewRequired: false,
      secondaryReviewReason: null,
      keyEvidence: [],
      contradictingEvidence: [],
      detectionReasonSeen: false,
      reviewNote: '',
      dataQualityScore: 3,
    },
  };
}
