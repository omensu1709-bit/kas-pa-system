# KAS PA - Technisches Validierungs-Fundament

**Version:** 1.0
**Datum:** 2026-04-17
**Status:** FÜR VALIDIERUNG

---

## 1. EVENT-DEFINITION

### 1.1 Primäres Ziel-Event: "Massive Dump-Bewegung"

Eine **Massive Dump-Bewegung** ist definiert als:

```
DEFINITION: MASSIVE_DUMP
═══════════════════════════════════════════════════════════════

Ein MASSIVE_DUMP Event tritt ein wenn ALLE der folgenden
Bedingungen innerhalb eines 24-Stunden-Fensters erfüllt sind:

MUSS ERFÜLLT SEIN:
──────────────────
(1) Preisverlust ≥ 30% relativ zum 24h-Vorherigen Preis
    → priceChange24h ≤ -0.30

(2) Mindestens 2 der folgenden proxy-Metriken zeigen
    innerhalb von 1 Stunde VOR dem Dump Anomalien:
    (a) Bot-Aktivität > 70. Perzentil (letzte 7 Tage)
    (b) Liquiditätsabnahme > 50% im OrderBook
    (c) Smart-Money-Exits > 3 Wallet-Transaktionen > 10 SOL

(3) Mindestens 1 der folgenden strukturellen Bedingungen:
    (a) Vorheriger Konsolidierungszeitraum > 4 Stunden
    (b) Volume-Spike > 3x 24h-Durchschnitt
    (c) Koordinierte Wallet-Aktivität (Cluster-Analyse)

OPTIONAL (erhöht Konfidenz):
───────────────────────────
(4) Mindestens 3 der 9 Crash-Metriken zeigen
    Z-Score > 1.5 oder < -1.5 (richtungabhängig)

ABGRENZUNG ZU ANDEREN EVENTS:
──────────────────────────────
• Flash Crash (Minuten): Preisverlust >10% in <5Min
• Normale Volatilität: Preisverlust <30% in 24h
• Gewinnmitnahme: Preisverlust <15% mit Volumen normal
• Liquidation Cascade: Bot-Aktivität > 90. Perzentil
```

### 1.2 Schweregrade

| Schweregrad | Preisverlust | Lead Time | Bot-Aktivität | Konfidenz |
|------------|--------------|-----------|----------------|-----------|
| **SEVERE** | ≥50% | >2h | ≥80% | HOCH |
| **MAJOR** | 30-50% | >1h | ≥70% | MITTEL |
| **MODERATE** | 20-30% | >30min | ≥60% | NIEDRIG |

---

## 2. NEGATIVKLASSEN (Gegenereignisse)

### 2.1 Negativklassen-Definition

```
NEGATIVKLASSEN FÜR BACKTESTING-LABELS
═══════════════════════════════════════════════════════════════

KLASSE A: FALSCHER ALARM (False Positive)
────────────────────────────────────────
Bedingung: System sagt MASSIVE_DUMP voraus
Aber: Preisverlust < 30% in den nächsten 24h

KLASSE B: VERPASSTER CRASH (False Negative)
────────────────────────────────────────
Bedingung: System sagt KEIN DUMP voraus (IGNORE/MONITOR)
Aber: MASSIVE_DUMP tritt ein innerhalb 24h

KLASSE C: FEHLERHAFTE TIMING
────────────────────────────────────────
Bedingung: MASSIVE_DUMP tritt ein
Aber: System warnt >6h zu früh ODER >2h zu spät

KLASSE D: NORMALER MARKT
────────────────────────────────────────
Bedingung: Kein MASSIVE_DUMP, kein Signal
Erwartung: System bleibt ruhig (True Negative)

KLASSE E: BUY-THE-DIP
────────────────────────────────────────
Bedingung: Preisverlust >15%, dann Erholung >20%
Problem: System shortet vor Erholung
```

### 2.2 Label-Matrix

| Vorhersage ↓ / Tatsache → | MASSIVE_DUMP | KEIN_DUMP |
|---------------------------|--------------|------------|
| **SHORT/SIGNAL** | ✅ TP | ❌ FP |
| **IGNORE/MONITOR** | ❌ FN | ✅ TN |

---

## 3. FEATURE-MATRIX

### 3.1 Crash Detection Features (9 Metriken)

| # | Feature | Quelle | Berechnungszeitpunkt | Lookahead-Risiko | Erwarteter Beitrag | Status |
|---|---------|--------|---------------------|-----------------|-------------------|--------|
| F1 | Hawkes (n) | Chainstack RPC | Nach jedem TX-Event | 🔴 HOCH | n→1 zeigt Selbst-anregung | ✅ Implementiert |
| F2 | Entropy (PE) | Preise | Nach jedem Preis-Update | 🟡 MEDIUM | PE<0.35 = Deterministisch | ✅ Implementiert |
| F3 | Molloy-Reed (κ) | Graph TX | Nach Edge-Add | 🔴 HOCH | κ<3 = Kritische Infrastruktur | ✅ Implementiert |
| F4 | Fragmentation | Graph | Nach Edge-Add | 🟡 MEDIUM | Rising = Perkolations | ✅ Implementiert |
| F5 | Epidemic (Rt) | Epidemic TX | Nach TX-Window | 🔴 HOCH | Rt>1.2 = Epidemisch | ✅ Implementiert |
| F6 | b-value | Seismic | Nach Magnitude | 🟡 MEDIUM | b<1 = Major Event | ✅ Implementiert |
| F7 | CTE | Transfer Entropy | Nach TX-Pattern | 🟡 MEDIUM | Rising = Herding | ✅ Implementiert |
| F8 | SSI | Super-Spreader | Nach TX-Aktivität | 🔴 HOCH | Rising = Whale-Aktivität | ✅ Implementiert |
| F9 | LFI | Liquidity | Nach Trade | 🔴 HOCH | Rising = Liquiditätsstress | ✅ Implementiert |

### 3.2 Bot Detection Features

| # | Feature | Quelle | Berechnungszeitpunkt | Lookahead-Risiko | Erwarteter Beitrag | Status |
|---|---------|--------|---------------------|-----------------|-------------------|--------|
| F10 | botProbability | Chainstack RPC | Alle 5s | 🟢 NIEDRIG | Bot-Aktivität = Dump-Indikator | ✅ Implementiert |
| F11 | jitoBundleCount | Chainstack RPC | Nach jedem Block | 🟢 NIEDRIG | Jito = Dump-Signal | ✅ Implementiert |
| F12 | sandwichCount | Chainstack RPC | Nach jedem TX | 🟢 NIEDRIG | Sandwich = Preismanipulation | ✅ Implementiert |
| F13 | sniperCount | Chainstack RPC | Nach jedem TX | 🟢 NIEDRIG | Sniper = Emotional Selling | ✅ Implementiert |
| F14 | liquidationCount | Chainstack RPC | Nach jedem TX | 🟢 NIEDRIG | Liquidations = Cascade | ✅ Implementiert |
| F15 | backrunCount | Chainstack RPC | Nach jedem TX | 🟢 NIEDRIG | Backrun = Info-Vorteil | ✅ Implementiert |

### 3.3 Order Flow Features

| # | Feature | Quelle | Berechnungszeitpunkt | Lookahead-Risiko | Erwarteter Beitrag | Status |
|---|---------|--------|---------------------|-----------------|-------------------|--------|
| F16 | TFI | DexScreener | Alle 30s | 🟢 NIEDRIG | TFI<0 = Dump-Druck | ✅ Implementiert |
| F17 | buyVolume | DexScreener | Alle 30s | 🟢 NIEDRIG | Volumen-Dynamik | ✅ Implementiert |
| F18 | sellVolume | DexScreener | Alle 30s | 🟢 NIEDRIG | Volumen-Dynamik | ✅ Implementiert |
| F19 | volumeRatio | Berechnet | Alle 30s | 🟢 NIEDRIG | Buy/Sell Balance | ✅ Implementiert |

### 3.4 Price Velocity Features

| # | Feature | Quelle | Berechnungszeitpunkt | Lookahead-Risiko | Erwarteter Beitrag | Status |
|---|---------|--------|---------------------|-----------------|-------------------|--------|
| F20 | priceChange1min | Berechnet | Nach Preis-Update | 🟢 NIEDRIG | Kurzfrist-Dynamik | ✅ Implementiert |
| F21 | priceChange5min | Berechnet | Nach Preis-Update | 🟢 NIEDRIG | Midfrist-Dynamik | ✅ Implementiert |
| F22 | acceleration | Berechnet | Nach Preis-Update | 🟢 NIEDRIG | Momentum | ✅ Implementiert |
| F23 | jerk | Berechnet | Nach Preis-Update | 🟢 NIEDRIG | Transienten | ✅ Implementiert |
| F24 | isFlashCrash | Berechnet | Nach Preis-Update | 🟢 NIEDRIG | -10% in 5min | ✅ Implementiert |

### 3.5 Market Structure Features

| # | Feature | Quelle | Berechnungszeitpunkt | Lookahead-Risiko | Erwarteter Beitrag | Status |
|---|---------|--------|---------------------|-----------------|-------------------|--------|
| F25 | shortSignalScore | Ranking Service | Alle 30min | 🟡 MEDIUM | Volatilität + Performance | ✅ Implementiert |
| F26 | volatilityScore | Ranking Service | Alle 30min | 🟡 MEDIUM | Historische Volatilität | ✅ Implementiert |
| F27 | priceChange24h | DexScreener | Alle 30s | 🟢 NIEDRIG | 24h Performance | ✅ Implementiert |

### 3.6 Lookahead-Bias Risiko-Matrix

```
RISIKO-MATRIX: FEATURE → LABEL
═══════════════════════════════════════════════════════════════

LEGENDE:
🟢 NIEDRIG: Feature wird VOR dem zu预测enden Zeitfenster berechnet
🟡 MEDIUM: Feature könnte teilweise zukünftige Info enthalten
🔴 HOCH: Feature hat direktes Leakage-Potenzial

FEATURES MIT 🔴 HOCH RISIKO (müssen gefiltert werden im Backtesting):
───────────────────────────────────────────────────────────────────
• F1, F3, F5, F8, F9: Werden mit Rolling Window berechnet
  → Nur Features NACH dem Cutoff-Zeitpunkt verwenden
  → Vorhersage-Fenster: t+5min bis t+24h

FEATURES MIT 🟡 MEDIUM RISIKO:
───────────────────────────────────────────────────────────────────
• F2, F4, F6, F7: Basieren auf Preisen
  → Nur vergangene Preise verwenden (kein Lookahead)
  → Vorhersage-Fenster: t bis t+24h

FEATURES MIT 🟢 NIEDRIG RISIKO:
───────────────────────────────────────────────────────────────────
• F10-F27: Real-time Signale
  → Können direkt verwendet werden
  → Vorhersage-Fenster: t+5min bis t+24h
```

---

## 4. BACKTESTING-SCHEMA

### 4.1 Zeitkorrekter Replay-Mechanismus

```
BACKTESTING ARCHITECTURE
═══════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────┐
│                        ZEITLINIE                                    │
│                                                                 │
│  ◄── Vergangenheit ──|── Jetzt ──|── Zukunft ──►              │
│                         ▲                                        │
│                         │                                        │
│  Cutoff ─────────────────┘                                        │
│  (Feature-Matrix bis hier)                                        │
│                                                                 │
│  Prediction ────────────────────────────────────────────────────► │
│  Window                                                         │
│  (t+5min bis t+24h)                                             │
│                                                                 │
│  Label ─────────────────────────────────────────────────────────► │
│  (trat MASSIVE_DUMP ein? Ja/Nein)                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

REGELN FÜR ZEITKORREKTEN REPLAY:
═══════════════════════════════════════════════════════════════

1. FEATURE-BERECHNUNG
   → Nur Daten BIS zum Cutoff-Zeitpunkt verwenden
   → Keine zukünftigen Preise, Volumes, oder TX

2. PREDIKTIONS-FENSTER
   → Frühester Vorhersagezeitpunkt: Cutoff + 5 Minuten
   → Spätester Vorhersagezeitpunkt: Cutoff + 24 Stunden

3. LABEL-GENERIERUNG
   → Label = MASSIVE_DUMP tritt ein im Fenster [Cutoff+5min, Cutoff+24h]
   → Label = KEIN_DUMP wenn kein MASSIVE_DUMP im Fenster

4. WALK-FORWARD VALIDATION
   → Training: Daten [t0, t_cutoff]
   → Test: Daten [t_cutoff, t_cutoff+7days]
   → Dann verschieben: t_cutoff → t_cutoff+7days
```

### 4.2 Backtesting-Parameter

| Parameter | Wert | Begründung |
|-----------|------|------------|
| Prediction Window Start | +5 min | Verarbeitungszeit |
| Prediction Window End | +24h | MASSIVE_DUMP Definition |
| Minimum Datenhistorie | 7 Tage | Für Z-Score Baselines |
| Walk-Forward Step | 1 Tag | Kontinuierliche Validierung |
| Test Period | 30 Tage | Statistische Signifikanz |
| Anzahl Runs | 1000+ | Monte Carlo |

### 4.3 Datenaufbewahrung für Backtesting

```
NOTWENDIGE DATEN FÜR REPLAY:
═══════════════════════════════════════════════════════════════

KATEGORIE A: ROHDATEN (für Backtesting)
───────────────────────────────────────────────────────────
• Preis-Streams (1-Sekunden-Auflösung)
• OrderBook-Deltas (bei Änderung)
• Transaktionen (mit Timestamp, Type, Wallets)
• Wallet-Adressen (Cluster-Info wenn möglich)
• API-Response-Rohdaten (DexScreener, Helius)

KATEGORIE B: AGGREGIERTE DATEN (für Feature-Berechnung)
───────────────────────────────────────────────────────────
• 9 Crash-Metriken (30-Sekunden-Auflösung)
• Bot-Metriken (5-Sekunden-Auflösung)
• OrderFlow-Metriken (30-Sekunden-Auflösung)
• Velocity-Metriken (1-Minuten-Auflösung)

KATEGORIE C: LABELS (für Training)
───────────────────────────────────────────────────────────
• Preisverlust-Labels (1-Stunden-Auflösung)
• MASSIVE_DUMP Events (mit Severity)
• Smart-Money-Exits (wann, wie viele Wallets)
• Liquidations-Events (wann, Volumen)

DATEIFORMAT:
───────────────────────────────────────────────────────────
• Format: Parquet oder JSONL
• Partitionierung: Nach Datum
• Komprimierung: Snappy oder Zstd
```

---

## 5. BASELINE-MODELLE

### 5.1 Baseline-Definition

```
BASELINE-MODELLE FÜR VERGLEICH
═══════════════════════════════════════════════════════════════

Ein BASELINE-MODELL muss:
1. Nur mit public/freien Daten arbeiten
2. Einfach zu implementieren sein
3. Als untere Schranke für unser System dienen
4. Nicht auf Blockchain-Daten angewiesen sein
```

### 5.2 Baseline-Katalog

| # | Baseline | Beschreibung | Erwartete Performance |
|---|----------|-------------|---------------------|
| **B1** | Random Classifier | Zufällige Entscheidung | Precision: ~1%, Recall: ~1% |
| **B2** | Price-Only | Preisverlust > 20% in 1h = Signal | Precision: ~5%, FPR: ~40% |
| **B3** | Volume-Spike | Volume > 3x Mean = Signal | Precision: ~8%, FPR: ~35% |
| **B4** | Bot-Only | botProbability > 0.7 = Signal | Precision: ~12%, FPR: ~30% |
| **B5** | Simple Moving Average | SMA-Crossdown = Signal | Precision: ~15%, FPR: ~25% |
| **B6** | Combined-Heuristic | 3 von 5 Bedingungen | Precision: ~20%, FPR: ~20% |

### 5.3 Unser System-Ziel

```
ERWARTETE PERFORMANCE DES KAS PA SYSTEMS:
═══════════════════════════════════════════════════════════════

Minimum (um Baseline B6 zu schlagen):
• Precision: > 25%
• Recall: > 15%
• FPR: < 15%
• Lead Time: > 30 Minuten

Ziel (Production Ready):
• Precision: > 40%
• Recall: > 25%
• FPR: < 10%
• Lead Time: > 2 Stunden

Optimal (SOTA):
• Precision: > 60%
• Recall: > 40%
• FPR: < 5%
• Lead Time: > 4 Stunden
```

---

## 6. EVALUATIONSMETRIKEN

### 6.1 Kernmetriken

| Metrik | Formel | Zielwert | Kritikalität |
|--------|--------|-----------|--------------|
| **Precision** | TP / (TP + FP) | >40% | 🔴 HOCH |
| **Recall** | TP / (TP + FN) | >25% | 🔴 HOCH |
| **F1-Score** | 2 × (P × R) / (P + R) | >30% | 🟡 MITTEL |
| **False Positive Rate** | FP / (FP + TN) | <10% | 🔴 HOCH |
| **Detection Lead Time** | t_signal - t_dump_start | >2h | 🟡 MITTEL |

### 6.2 Trading-Performance-Metriken

| Metrik | Formel | Zielwert | Kritikalität |
|--------|--------|-----------|--------------|
| **Average PnL per Trade** | Σ(pnl) / n | >0 SOL | 🔴 HOCH |
| **Win Rate** | wins / total | >50% | 🟡 MITTEL |
| **Sharpe Ratio** | (Rp - Rf) / σp | >1.5 | 🟡 MITTEL |
| **Sortino Ratio** | (Rp - Rf) / σdown | >2.0 | 🟡 MITTEL |
| **Maximum Drawdown** | max(peak - trough) | <20% | 🔴 HOCH |
| **Calmar Ratio** | Annual Return / MaxDD | >2.0 | 🟡 MITTEL |

### 6.3 System-Spezifische Metriken

| Metrik | Formel | Zielwert | Kritikalität |
|--------|--------|-----------|--------------|
| **Signal-to-Noise Ratio** | true_signals / false_signals | >3.0 | 🟡 MITTEL |
| **Mean Time Between False Alarms** | total_time / false_alarms | >24h | 🟡 MITTEL |
| **Escape Rate** | dumps_missed / total_dumps | <30% | 🔴 HOCH |
| **Average Correct Signal Lead** | Σ(t_signal - t_dump) / true_signals | >2h | 🟡 MITTEL |

---

## 7. LOGIK-BEWERTUNG: EMPIRISCH VS. HEURISTISCH

### 7.1 Bayesian Decision Engine

```
BAYESIAN ENGINE BEWERTUNG
═══════════════════════════════════════════════════════════════

KOMPONENTE: Posterior Calculation
───────────────────────────────────────────────────────────
P(H|E) = P(E|H) × P(H) / P(E)

EMPIRISCH BEWIESEN? ❌ NEIN
───────────────────────────────────────────────────────────
• P(H) = Prior Probability = ShortSignalScore / 100
  → Woher kommt diese Annahme?
  → Nicht validiert gegen historische Daten

• P(E|H) = Likelihood = Crash Probability aus 9 Metriken
  → METRIC_COEFFICIENTS sind geschätzt, nicht gelernt
  → Beta-Koeffizienten aus Forschung, nicht Solana

• P(E|¬H) = False Positive Rate = 0.05 (5%)
  → Arbitrary Annahme
  → Nicht empirisch validiert

EMPFEHLUNG:
───────────────────────────────────────────────────────────
1. P(H) aus historischen Dump-Häufigkeiten lernen
2. P(E|H) via LightGBM trainieren statt manuell
3. P(E|¬H) aus False-Positive-Rate im Backtesting schätzen
```

### 7.2 Consensus Engine (3/5 Rule)

```
CONSENSUS ENGINE BEWERTUNG
═══════════════════════════════════════════════════════════════

KOMPONENTE: 3/5 Signale = STRONG_SHORT
───────────────────────────────────────────────────────────
EMPIRISCH BEWIESEN? ❌ NEIN
───────────────────────────────────────────────────────────
• Warum genau 3 von 5?
• Warum nicht 4 von 5?
• Warum nicht gewichtet (0.3, 0.25, 0.2, 0.15, 0.1)?

GEWICHTUNG DER SIGNALE:
───────────────────────────────────────────────────────────
Signal          | Gewicht | Empirisch validiert?
─────────────────────────────────────────────
crashProb       | 0.30   | ❌ Nein
priceVelocity   | 0.25   | ❌ Nein
orderBook       | 0.20   | ❌ Nein
botActivity     | 0.15   | ❌ Nein
sentiment      | 0.10   | ❌ Nein (Placeholder)

EMPFEHLUNG:
───────────────────────────────────────────────────────────
1. Sensitivitätsanalyse: Teste 2/5 bis 5/5
2. Gewichte via Grid-Search im Backtesting optimieren
3. Signifikanztest: Ist 3/5 signifikant besser als 2/5?
```

### 7.3 Kelly Criterion

```
KELLY CRITERION BEWERTUNG
═══════════════════════════════════════════════════════════════

KOMPONENTE: Kelly Fraction = 0.55 (quarter)
───────────────────────────────────────────────────────────
EMPIRISCH BEWIESEN? ❌ NEIN
───────────────────────────────────────────────────────────
Kelly Formula: f* = W - (1-W)/R

• W = Win Rate (unbekannt!)
• R = Reward/Risk Ratio = 0.15/0.05 = 3.0 (fix)

PROBLEM:
───────────────────────────────────────────────────────────
• Win Rate W wird NICHT aus historischen Trades berechnet
• Stattdessen: Geschätzte Win Rate aus Simulation
• Kelly quarter (0.25) ist Conservative, aber arbitrary

EMPFEHLUNG:
───────────────────────────────────────────────────────────
1. Win Rate aus Paper Trading lernen (nach 100+ Trades)
2. Kelly fraktion dynamisch anpassen basierend auf WR
3. Full Kelly vs. Half Kelly vs. Quarter Kelly backtesten
```

### 7.4 Zusammenfassung: Empirisch vs. Heuristisch

| Komponente | Status | Beweisbasen |
|------------|--------|-------------|
| **9 Crash-Metriken** | 🟡 PARTIALLY | Forschungsliteratur, nicht Solana |
| **METRIC_COEFFICIENTS** | ❌ HEURISTIC | Geschätzt |
| **Z-Score Thresholds** | ❌ HEURISTIC | \|z\|>1.5 arbitrary |
| **Zone Thresholds** | ❌ HEURISTIC | 10%, 15% arbiträr |
| **Bayesian Prior** | ❌ HEURISTIC | Nicht validiert |
| **Consensus 3/5** | ❌ HEURISTIC | Nicht getestet |
| **Kelly Fraction** | ❌ HEURISTIC | Conservativ, nicht gelernt |
| **Exit Strategy** | 🟡 PARTIALLY | +15%/-5%/4h aus Marktlogik |

---

## 8. ABSCHLIESSENDE DELIVERABLES

### a) EVENT-DEFINITION

```
MASSIVE_DUMP = Preisverlust ≥ 30% in 24h
+ Mindestens 2 proxy-Metriken (Bot, Liquidity, Smart-Money)
+ Mindestens 1 strukturelle Bedingung (Consolidation, Volume, Cluster)

SCHWEREGRADE:
• SEVERE: ≥50% in 24h, Lead >2h
• MAJOR: 30-50% in 24h, Lead >1h
• MODERATE: 20-30% in 24h, Lead >30min
```

### b) NEGATIVKLASSEN

| Klasse | Definition | Backtesting-Relevanz |
|--------|------------|---------------------|
| **False Positive** | Signal = DUMP, Tatsache = KEIN | Precision |
| **False Negative** | Signal = IGNORE, Tatsache = DUMP | Recall |
| **Timing Error** | Dump >6h zu früh oder >2h zu spät | Lead Time |
| **True Negative** | Signal = IGNORE, Tatsache = KEIN | Spezifität |
| **Buy-The-Dip** | Dump + Erholung >20% | PnL Impact |

### c) LEAKAGE-RISIKO-MATRIX

```
                    ZUKÜNFTIGE INFO?
FEATURE        │ Preis t+5min │ Preis t+1h │ Preis t+24h │ BOT-Aktivität
───────────────┼──────────────┼─────────────┼─────────────┼──────────────
Hawkes (n)     │     🟡      │     🔴     │     🔴      │     🟢
Entropy (PE)   │     🟡      │     🟡     │     🟡      │     🟢
Molloy-Reed    │     🟡      │     🔴     │     🔴      │     🟢
Epidemic (Rt)  │     🟡      │     🟡     │     🔴      │     🟢
TFI            │     🟢      │     🟢     │     🟢      │     🟢
Bot-Prob       │     🟢      │     🟢     │     🟢      │     🟢
Velocity       │     🟢      │     🟢     │     🟢      │     🟢

🟢 = Kein Leakage (kann verwendet werden)
🟡 = Potenzielles Leakage (Vorsicht)
🔴 = Direktes Leakage (NICHT verwenden vor Cutoff)
```

### d) BASELINE-KATALOG

| Baseline | Beschreibung | Precision | FPR | Anmerkung |
|----------|-------------|-----------|-----|-----------|
| B1 | Random | ~1% | ~99% | Untergrenze |
| B2 | Price-Only | ~5% | ~40% | SMA-Cross |
| B3 | Volume-Spike | ~8% | ~35% | Volume > 3x |
| B4 | Bot-Only | ~12% | ~30% | Bot > 70% |
| B5 | SMA | ~15% | ~25% | Technisch |
| B6 | Heuristic-3/5 | ~20% | ~20% | Unser aktuell |

**Unser Ziel: B6 schlagen mit >25% Precision, <15% FPR**

### e) BACKTESTING-PLAN

```
PHASE 1: DATA COLLECTION (Woche 1-2)
───────────────────────────────────────────────────────────
• 7 Tage kontinuierliche Datensammlung
• Rohdaten speichern (Preis, OrderBook, TX)
• Label-Generierung nach 24h Window

PHASE 2: FEATURE VALIDATION (Woche 3)
───────────────────────────────────────────────────────────
• Leakage-Test für alle 27 Features
• Korrelationsanalyse (F10-F27 untereinander)
• Feature-Selektion (Remove redundante Features)

PHASE 3: BASELINE BACKTESTING (Woche 4)
───────────────────────────────────────────────────────────
• Alle 6 Baseline-Modelle backtesten
• Walk-Forward über 30 Tage
• Metriken: Precision, Recall, FPR, Lead Time

PHASE 4: SYSTEM BACKTESTING (Woche 5)
───────────────────────────────────────────────────────────
• Bayesian + Consensus + Kelly Engine backtesten
• Sensitivitätsanalyse für Schwellenwerte
• Monte Carlo Simulation (1000 Runs)

PHASE 5: OPTIMIERUNG (Woche 6-8)
───────────────────────────────────────────────────────────
• LightGBM Training mit validierten Features
• Ensemble: LightGBM + Bayesian
• Final Validation
```

### f) REIHENFOLGE DER IMPLEMENTIERUNG

```
PRIORITÄT 1: KRITISCH (müssen vor Backtesting fertig sein)
───────────────────────────────────────────────────────────
1.1 Rohdaten-Speicherung implementieren
    → API-Responses als JSONL speichern
    → Timestamps in UTC
    → 7 Tage aufbewahren

1.2 Event-Label-Generator erstellen
    → Preisverlust >= 30% in 24h als MASSIVE_DUMP
    → Label im selben Format wie Features speichern

1.3 Leakage-Test-Framework
    → Feature-Matrix mit Cutoff-Zeitpunkten
    → Automatische Erkennung von Leakage

PRIORITÄT 2: HOCH (verbessern Backtesting-Qualität)
───────────────────────────────────────────────────────────
2.1 Baseline-Modelle B1-B6 implementieren
    → Als Vergleichspunkte
    → Python oder TypeScript

2.2 Backtesting-Engine erstellen
    → Walk-Forward Validation
    → Metriken-Berechnung
    → Report-Generation

2.3 Sensitivitätsanalyse für Consensus-Schwelle
    → Teste 2/5 bis 5/5
    → Optimale Gewichtung finden

PRIORITÄT 3: MITTEL (für Production-Ready Status)
───────────────────────────────────────────────────────────
3.1 Monte Carlo Simulation
    → 1000+ Random Walks
    → Confidence-Intervals für Metriken

3.2 LightGBM Training
    → Mit validierten Features
    → Ensemble mit Bayesian

3.3 Production Deployment Checkliste
    → Dokumentation
    → Alerting
    → Rollback Procedure
```

---

## ZUSAMMENFASSUNG

### Was wir HABEN:
- ✅ 27 Features (9 Crash + 6 Bot + 5 OrderFlow + 4 Velocity + 3 Market)
- ✅ LightGBM Training Pipeline (funktioniert)
- ✅ Paper Trading Engine (mit Hash-Chain)
- ✅ 700 Zyklen Testdaten gesammelt

### Was uns FEHLT:
- ❌ Event-Definition für MASSIVE_DUMP (formalisieren)
- ❌ Rohdaten-Speicherung (API-Responses)
- ❌ Label-Generator (Post-24h Validierung)
- ❌ Backtesting-Framework
- ❌ Baseline-Modelle zum Vergleich
- ❌ Sensitivitätsanalyse für Consensus/Kelly
- ❌ Historische Crash-Daten (Terra, FTX, COVID)

### Empfohlene Reihenfolge:
1. **Rohdaten-Speicherung** (1 Tag)
2. **Event-Label-Generator** (1 Tag)
3. **Baseline-Modelle B1-B6** (2 Tage)
4. **Backtesting-Engine** (3 Tage)
5. **Erste Backtesting-Runde** (2 Tage)
6. **Sensitivitätsanalyse** (2 Tage)
7. **Monte Carlo** (2 Tage)
8. **LightGBM Training** (3 Tage)

**Geschätzter Aufwand: 14 Tage für vollständiges Validierungs-Fundament**
