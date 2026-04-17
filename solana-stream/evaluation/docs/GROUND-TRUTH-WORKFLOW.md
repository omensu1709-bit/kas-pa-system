# KAS PA v4.3 - Ground Truth Workflow Documentation

**Version:** 4.3.0
**Datum:** 2026-04-16
**Status:** INFRASTRUKTUR FERTIG - KEINE EMPIRISCHEN DATEN

---

## ⚠️ CRITICAL WARNING: INFRASTRUKTUR, NICHT VALIDIERUNG

**Dieses Framework ist INFRASTRUKTUR zur Ground-Truth-Erstellung.**

Die folgenden Komponenten sind **funktionsfähig**:
- Schema-Definitionen ✅
- Candidate Generator ✅
- Auto-Labeler ✅
- Review Workflow ✅
- Confidence Calculator ✅
- Storage Manager ✅
- CLI-Tools ✅

**ABER:** Es liegen **KEINE empirischen Ground-Truth-Daten** vor.
Solange keine echten, gelabelten historischen Events existieren:

- ❌ Keine Precision-Messung möglich
- ❌ Keine FPR-Messung möglich
- ❌ Keine Modellvergleiche valide
- ❌ Keine Backtesting-Ergebnisse

---

## 1. PURPOSE

Der Ground-Truth-Workflow erstellt einen **belastbaren, reproduzierbaren und auditierbaren Datensatz** zur empirischen Validierung des KAS PA Systems.

### Ziele:
1. Klare Trennung zwischen Rohdaten, Kandidaten, Auto-Labels, Reviews und finaler Ground Truth
2. Jeder Schritt ist auditierbar und reproduzierbar
3. Keine stillschweigenden Annahmen
4. Auto-Labels sind VORSTUFEN, nicht Wahrheit
5. Finale Ground Truth erfordert menschliche Bestätigung

---

## 2. DATA MODEL - 5 LAYERS

### Layer 1: Raw Observation
Einzelne Rohdatenpunkte / Snapshots / API-Antworten

```typescript
interface RawObservation {
  id: string;
  timestamp: number;
  chain: 'solana' | 'ethereum';
  source: 'chainstack' | 'helius' | 'dexscreener';
  tokenAddress: string;
  tokenSymbol: string;
  // Preis, Volume, Liquidity, Bot, Whale, etc.
  priceChange24h?: number;
  volumeSpikeMultiplier?: number;
  botProbability?: number;
  // ...
}
```

### Layer 2: Event Candidate
Automatisch erkannter Kandidat für relevantes Markt-Event

```typescript
interface EventCandidate {
  candidateId: string;
  detectionRule: string;  // Welche Regel hat den Candidate erzeugt
  candidateWindowStart: number;
  candidateWindowEnd: number;
  detectionConfidence: number;
  status: 'candidate' | 'processing' | 'labeled' | 'reviewed' | 'final';
  // Metriken...
}
```

**WICHTIG:** Candidates sind NICHT Ground Truth.

### Layer 3: Preliminary Label
Vorläufiges maschinelles Label

```typescript
interface PreliminaryLabel {
  candidateId: string;
  labelClass: LabelClass;
  labelConfidence: number;
  labelingRule: string;  // Dokumentation der Regel
  status: 'pending_review' | 'in_review' | 'reviewed' | 'approved' | 'rejected';
  // Schwächen-Dokumentation...
}
```

**WICHTIG:** Auto-Labels dürfen **NIEMALS** als Ground Truth behandelt werden.

### Layer 4: Human Review
Manuelle Prüfung durch Analyst

```typescript
interface HumanReview {
  candidateId: string;
  finalLabelClass: LabelClass;
  reviewerConfidence: number;
  ambiguityFlags: AmbiguityFlag[];
  needsSecondaryReview: boolean;
  status: 'primary_review' | 'secondary_review' | 'approved' | 'rejected';
}
```

### Layer 5: Final Ground Truth Label
Final bestätigtes, versioniertes Label

```typescript
interface FinalGroundTruthLabel {
  eventId: string;
  labelClass: LabelClass;
  labelVersion: string;
  labelStatus: 'preliminary' | 'reviewed' | 'approved' | 'rejected';
  labelConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reviewStatus: 'pending' | 'primary_reviewed' | 'secondary_reviewed' | 'final';
  isGroundTruth: boolean;  // MUSS true sein
  reviewHistory: ReviewHistoryEntry[];
}
```

---

## 3. LABEL CLASSES

### 3.1 MASSIVE_DUMP

**Definition:** Signifikanter, anhaltender Preisverlust mit struktureller Vorbereitung

**Inklusionskriterien:**
- Preisverlust >= 30% in 24h ODER >= 20% in 4h
- Mindestens 2 proxy-Metriken zeigen Anomalien (Bot, Liquidity, Volume)
- Mindestens 1 strukturelle Bedingung
- Preisverlust PERSISTIERT über >= 1h

**Exklusionskriterien:**
- Isolierter Whale-Trade ohne Follow-on
- Illiquider Markt ohne normale Handelsaktivität
- Preisverlust < 15% in 24h
- Flash-Crash mit Erholung > 50% innerhalb 1h

### 3.2 NORMAL_VOLATILITY

**Definition:** Normale Marktbewegung ohne signifikante strukturelle Ereignisse

**Inklusionskriterien:**
- Preisverlust < 15% in 24h
- Keine ungewöhnlichen Bot-Aktivitäts-Cluster
- Volume innerhalb 2x des 7-Tage-Durchschnitts

### 3.3 ILLIQUID_RANDOM_MOVE

**Definition:** Illiquider Einmal-Exit ohne Follow-on-Kaskade

**Inklusionskriterien:**
- Preisverlust >= 20% in < 1h
- Keine strukturelle Vorbereitung
- Liquiditätsabnahme > 50%
- Keine Follow-on Transaktionen (< 3)

### 3.4 WHALE_SELL_NO_CASCADE

**Definition:** Einzelner Whale-Exit ohne nachhaltige Preisbewegung

**Inklusionskriterien:**
- Einzelne Wallet mit >= 100 SOL Verkaufsvolumen
- Preisverlust < 25% in 4h
- Follow-on Transaktionen < 3
- Keine koordinierte Aktivität

### 3.5 BOT_ACTIVITY_NO_PRICE_IMPACT

**Definition:** Erhöhte Bot-Aktivität ohne nachhaltigen Preiseffekt

**Inklusionskriterien:**
- Bot-Probability >= 0.70
- Preisverlust < 5% in 4h
- Symmetrisches Volume

### 3.6 UNCERTAIN

**Definition:** Strittiger Fall - nicht eindeutig klassifizierbar

Verwendung wenn:
- Widersprüchliche Evidenz
- Boundary-Cases
- Ambiguität in Dateninterpretation

### 3.7 DATA_INSUFFICIENT

**Definition:** Nicht genug Daten für Klassifikation

Verwendung wenn:
- Datenlücken > 30% des relevanten Zeitfensters
- Kritische Datenfeeds nicht verfügbar

---

## 4. CANDIDATE GENERATION

### Trigger Rules

| Trigger | Bedingung | Window |
|---------|-----------|--------|
| Price Drop 30% 24h | priceChange24h <= -30% | 24h |
| Price Drop 20% 4h | priceChange4h <= -20% | 4h |
| Price Drop 10% 1h | priceChange1h <= -10% | 1h |
| Volume Spike 3x | volumeSpikeMultiplier >= 3.0 | 1h |
| Liquidity Drop 50% | liquidityChange <= -50% | 1h |
| High Bot Activity | botActivityScore >= 0.70 | 30min |
| Order Flow Skew | buySellImbalance <= -0.30 | 30min |
| Whale Concentration | whaleConcentration >= 0.80 | 2h |
| Combined Cascade | priceChange4h <= -15% + volume >= 2x + bot >= 0.60 | 4h |

### Deduplication
- Mehrere Trigger für dasselbe Event werden zusammengeführt
- Window: 1 Stunde Standard

---

## 5. AUTO-LABELING RULES

### Priorität der Regeln

1. **MASSIVE_DUMP** - Höchste Priorität
2. **BOT_ACTIVITY_NO_PRICE_IMPACT**
3. **ILLIQUID_RANDOM_MOVE**
4. **WHALE_SELL_NO_CASCADE**
5. **NORMAL_VOLATILITY**
6. **UNCERTAIN** - Catch-all

### Confidence Calculation

```typescript
baseConfidence = {
  MASSIVE_DUMP: 0.75,
  NORMAL_VOLATILITY: 0.85,
  ILLIQUID_RANDOM_MOVE: 0.65,
  WHALE_SELL_NO_CASCADE: 0.60,
  BOT_ACTIVITY_NO_PRICE_IMPACT: 0.70,
  UNCERTAIN: 0.50,
  DATA_INSUFFICIENT: 0.95,
}[label] || 0.5;

ruleBoost = min(matchedRules.length * 0.05, 0.15);
finalConfidence = min(baseConfidence + ruleBoost, 0.95);
```

### Dokumentation

Jedes Auto-Label enthält:
- Verwendete Regel(n)
- Erwartete False Positives
- Erwartete False Negatives
- Bekannte Schwächen

---

## 6. REVIEW WORKFLOW

### Primary Review

Alle Auto-Labels müssen durch Primary Review.

### Secondary Review Required Wenn:

1. **Confidence < 0.70**
2. **Label = MASSIVE_DUMP / WHALE_SELL / BOT_ACTIVITY**
3. **High Severity Ambiguität Flags**
4. **> 3 Data Gaps**
5. **Kritische Felder fehlen**
6. **Auto-Label wurde überschrieben**

### Review-Entscheidung

```typescript
interface ReviewDecision {
  finalLabel: LabelClass;
  confidence: number;
  notes: string;
  evidenceSummary: string;
  ambiguityFlags: AmbiguityFlag[];
  overrideAutoLabel: boolean;
  needsSecondaryReview: boolean;
}
```

---

## 7. CONFIDENCE MODEL

### Factors

| Factor | Gewicht | Beschreibung |
|--------|---------|--------------|
| Data Completeness | 25% | Wie viele kritische Felder vorhanden |
| Signal Consistency | 25% | Konsistenz über Time-Windows |
| Evidence Source Count | 15% | Anzahl unterstützender Evidenzquellen |
| Reviewer Certainty | 20% | Reviewer Confidence |
| Contradiction Level | 15% | Widersprüche in den Daten (invertiert) |

### Confidence Bands

| Band | Score | Bedeutung |
|------|-------|-----------|
| HIGH | >= 0.80 | Starke Evidenz, vollständige Daten |
| MEDIUM | 0.60-0.79 | Moderate Evidenz, einige Lücken |
| LOW | < 0.60 | Schwache Evidenz, signifikante Lücken |

---

## 8. DATA STORAGE

### Verzeichnisstruktur

```
data/gt/
├── raw/                    # Rohdaten-Snapshots
├── candidates/              # Event-Kandidaten
├── auto-labels/             # Vorläufige Auto-Labels
├── reviews/                 # Manuelle Reviews
└── final/                   # Finale Ground Truth Labels
    └── groundtruth_*.jsonl  # Versioniertes Dataset
```

### Versionierung

Jedes finale Label enthält:
- `labelVersion` (SemVer)
- `reviewHistory[]` mit Timestamps
- `isGroundTruth` Flag (muss true sein)

---

## 9. CLI COMMANDS

```bash
# Generiere Kandidaten
npx tsx src/groundtruth/cli.ts gt:candidates

# Auto-Labeling
npx tsx src/groundtruth/cli.ts gt:autolabel --dry-run

# Liste ausstehende Reviews
npx tsx src/groundtruth/cli.ts gt:review:list

# Submit Review
npx tsx src/groundtruth/cli.ts gt:review:apply \
  --candidate=cand_123 \
  --label=MASSIVE_DUMP \
  --confidence=0.85 \
  --notes="Confirmed based on price and volume data"

# Export Ground Truth
npx tsx src/groundtruth/cli.ts gt:export \
  --output=/path/to/groundtruth.jsonl

# Statistiken
npx tsx src/groundtruth/cli.ts gt:stats

# Validierung
npx tsx src/groundtruth/cli.ts gt:validate
```

---

## 10. KNOWN LIMITATIONS

1. **Keine echten historischen Daten** - Currently using synthetic test data
2. **Whale Concentration** - Calculation is placeholder
3. **Smart Money Activity** - Field not reliably available
4. **Transaction Burst Score** - Threshold needs validation
5. **Cluster Score** - Graph-based metrics need tuning

---

## 11. NEXT STEPS

### Phase 1: Data Collection (KRITISCH)
- [ ] Historische Preis-Daten sammeln (14 Tage, 59 Tokens)
- [ ] Volume-Daten aggregieren
- [ ] Bot-Aktivität-Daten回放

### Phase 2: Labeling
- [ ] Auto-Labeling auf echten Daten testen
- [ ] Manual Review Workflow implementieren

### Phase 3: Validation
- [ ] Backtesting mit Ground Truth durchführen
- [ ] Baseline-Vergleiche validieren

---

## 12. VALIDATION RULES

### Checks vor Export:

1. ✅ Schema-Validierung
2. ✅ Pflichtfelder vorhanden
3. ✅ Zeitkonsistenz (startTime < endTime)
4. ✅ Gültige Label-Transitions
5. ✅ Keine Auto-Labels als Ground Truth
6. ✅ Evidence References vorhanden
7. ✅ Review Audit Trail komplett

---

## 13. METHODISCHE GRUNDSÄTZE

1. **Keine Modellgüte behaupten** ohne echte gelabelte Daten
2. **Keine Precision-/Recall-Aussagen** ohne Ground Truth
3. **Keine Auto-Labels als "Ground Truth"** verkaufen
4. **Keine stillen Defaults** wenn Daten fehlen
5. **Bei Unklarheit** lieber UNCERTAIN als falsche Sicherheit
6. **Methodische Sauberkeit** ist wichtiger als Bequemlichkeit

---

## 14. CONTACT & VERSION

- **Version:** 4.3.0
- **Datum:** 2026-04-16
- **Status:** INFRASTRUKTUR FERTIG
- **Ground Truth Data:** FEHLT