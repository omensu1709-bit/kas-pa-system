# KAS PA v4.3 - Evaluation Framework

## ⚠️ STATUS-WARNUNG: INFRASTRUKTUR FERTIG, KEINE EMPIRISCHEN DATEN

### Methodischer Hinweis

**Das Framework ist fertig. Die Validierung ist NICHT abgeschlossen.**

Die folgende Dokumentation beschreibt:
- ✅ **VERFÜGBAR:** Infrastruktur (Code, Schema, CLI)
- ❌ **NICHT VERFÜGBAR:** Empirische Messungen (echte Precision, FPR, Rankings)

**Ausgaben des CLI sind DRY-RUNS mit synthetischen Daten.**

---

## Überblick

Dieses Framework ermöglicht die **potentielle** empirische Validierung des KAS PA Systems durch:

1. **Ground-Truth Labeling** - Definierte Event-Labels für Crash-/Dump-Signale
2. **Baseline-Vergleich** - Vergleich mit einfachen Signalmodelle (B1-B5)
3. **Backtesting-Engine** - Zeitkorrekte Evaluation ohne Lookahead-Bias
4. **Metriken-Berechnung** - Precision, Recall, FPR, Lead Time, PnL

**Voraussetzung:** Echtes Ground-Truth Dataset muss erst aufgebaut werden.

## Reihenfolge der Validierung

```
Ground Truth → Baselines B1-B5 → Backtesting → Event-Level Metriken
     ↓              ↓                  ↓              ↓
  MISSING       WARTET AUF         WARTET AUF     WARTET AUF
              Ground Truth        Ground Truth    Ground Truth
```

## Verzeichnisstruktur

```
evaluation/
├── src/
│   ├── labels/
│   │   ├── schema.ts       # Label-Schema Definition (INFRASTRUKTUR)
│   │   └── generator.ts    # Label Generator (INFRASTRUKTUR)
│   ├── baselines/
│   │   └── baselines.ts    # B1-B5 Baseline Modelle (INFRASTRUKTUR)
│   ├── backtest/
│   │   └── engine.ts       # Backtesting Engine (INFRASTRUKTUR)
│   ├── eval/
│   │   └── metrics.ts      # Evaluations Metriken (INFRASTRUKTUR)
│   └── cli.ts              # CLI Interface (INFRASTRUKTUR)
├── data/
│   ├── labels/             # Ground Truth Labels (FEHLT)
│   ├── signals/            # Backtest Signale (FEHLT)
│   └── results/            # Evaluation Ergebnisse (FEHLT)
├── package.json
└── README.md
```

---

## ❌ VORLÄUFIGE CLI-NUTZUNG (NUR INFRASTRUKTUR-TEST)

**WARNUNG: Alle CLI-Ausgaben basieren auf SYNTHETISCHEN Testdaten.**

```bash
# Infrastruktur testen (KEINE echten Ergebnisse)
npx tsx src/cli.ts run --baselines=B1,B2,B3,B4,B5
npx tsx src/cli.ts compare

# Ausgaben sind DRY-RUNS - KEINE empirische Aussagekraft!
```

**Was die CLI aktuell zeigt:**
- Infrastruktur funktioniert (Code kompiliert, Module laden)
- Schema ist korrekt (Types passen)
- Datenstrukturen sind definiert

**Was die CLI NICHT zeigt:**
- Tatsächliche Modell-Performance
- Reale Precision/FPR/Rankings
- Valide Modellvergleiche

---

## ⚠️ METRIK-STATUS: HYPOTHETISCH vs. REAL

### Aktuell: ALLE Metriken sind HYPOTHETISCH

| Metrik | Status | Begründung |
|--------|--------|------------|
| Precision | ❌ HYPOTHETISCH | Kein Ground Truth Dataset |
| Recall | ❌ HYPOTHETISCH | Kein Ground Truth Dataset |
| F1-Score | ❌ HYPOTHETISCH | Kein Ground Truth Dataset |
| FPR | ❌ HYPOTHETISCH | Kein Ground Truth Dataset |
| Lead Time | ❌ HYPOTHETISCH | Keine gelabelten Events |
| Win Rate | ❌ HYPOTHETISCH | Keine echten Trades |
| PnL | ❌ HYPOTHETISCH | Keine Ground Truth |

### Baseline "Erwartete Precision" sind SCHÄTZUNGEN, NICHT MESSUNGEN

| Baseline | "Erwartete Precision" | Realität |
|----------|------------------------|----------|
| B1 | ~1% | Schätzung, nicht gemessen |
| B2 | ~5-10% | Schätzung, nicht gemessen |
| B3 | ~8-15% | Schätzung, nicht gemessen |
| B4 | ~10-15% | Schätzung, nicht gemessen |
| B5 | ~15-20% | Schätzung, nicht gemessen |
| KASPA | >25% | Zielwert, nicht validiert |

**Diese Werte sind Plaungsbasierte Schätzungen, keine empirischen Resultate.**

---

## Label-Schema (INFRASTRUKTUR)

### Event-Typen (DEFINIERT, NICHT ANGEWENDET)

| Label | Beschreibung |
|-------|-------------|
| `MASSIVEDUMP` | Preisverlust >= 30% in 24h |
| `NORMALVOLATILITY` | Normale Marktbewegung |
| `ILLIQUIDRANDOMMOVE` | Illiquider Einmal-Move |
| `WHALESELLNOCASCADE` | Einzelner Whale-Exit |
| `BOTACTIVITYNOPRICEIMPACT` | Bot-Aktivität ohne Preiseffekt |

### Event-Schema (INFRASTRUKTUR, DATEN FEHLEN)

```typescript
interface GroundTruthEvent {
  id: string;
  token: string;
  pair: string;
  eventStartTime: string;
  eventEndTime: string;
  label: EventLabel;
  priceChanges: {
    '5min'?: PriceChange;
    '15min'?: PriceChange;
    '1h'?: PriceChange;
    '4h'?: PriceChange;
    '24h'?: PriceChange;
  };
  volumeSpike?: { multiplier: number };
  botMetrics?: { botProbability: number };
  confidence: number;
  sourceNotes: string;
}
```

---

## Baseline Modelle (INFRASTRUKTUR)

| Baseline | Beschreibung | Code Status |
|----------|-------------|-------------|
| B1 | Random Classifier | ✅ Infrastruktur |
| B2 | SMA/Price Momentum | ✅ Infrastruktur |
| B3 | Volume Spike | ✅ Infrastruktur |
| B4 | Bot-Only | ✅ Infrastruktur |
| B5 | Heuristic 3/5 | ✅ Infrastruktur |

---

## Evaluations-Metriken (INFRASTRUKTUR)

### Signal Quality (CODE EXISTS, NO DATA)
- Precision: ✅ Code vorhanden
- Recall: ✅ Code vorhanden
- F1-Score: ✅ Code vorhanden
- False Positive Rate: ✅ Code vorhanden
- False Negative Rate: ✅ Code vorhanden

### Lead Time (CODE EXISTS, NO DATA)
- Mean Lead Time: ✅ Code vorhanden
- Median Lead Time: ✅ Code vorhanden
- Distribution: ✅ Code vorhanden

### Trading Quality (CODE EXISTS, NO DATA)
- Win Rate: ✅ Code vorhanden
- Average PnL %: ✅ Code vorhanden
- Sharpe Ratio: ✅ Code vorhanden
- Profit Factor: ✅ Code vorhanden

### Risk Quality (CODE EXISTS, NO DATA)
- Max Drawdown: ✅ Code vorhanden
- Calmar Ratio: ✅ Code vorhanden
- Volatility: ✅ Code vorhanden

---

## ❌ VERBLEIBENDE ARBEIT: GROUND TRUTH AUFBAUEN

### Was wirklich fehlt:

1. **Historische Preis-Daten** (OHNE diese geht nichts)
   - 1-Sekunden Preis-Streams
   - 5m, 15m, 1h, 4h, 24h Aggregationen
   - Mehrere Memecoins über 7+ Tage

2. **Manuelle Event-Labels**
   - Menschliche Annotation von Dump-Events
   - Validierung der Label-Qualität

3. **Bot-Aktivität-Daten**
   - Historische Bot-Metriken
   - Korrelation mit Preisverlusten

4. **Liquiditäts-Daten**
   - Historische OrderBook-Zustände
   - Volume Spikes

---

## ✅ OFFIZIELLER STATUS

| Komponente | Status |
|------------|--------|
| Infrastruktur (Code) | ✅ FERTIG |
| Evaluations-Metriken | ✅ CODE FERTIG |
| Ground Truth Dataset | ❌ FEHLT |
| Empirische Validierung | ❌ NICHT MÖGLICH |

**Erst wenn Ground Truth existiert, sind Precision/FPR/Ranking Aussagen valide.**

---

## ANHANG E) GROUND TRUTH AUFBAUPLAN

### Phase 1: Daten sammeln (Geschätzt: 18 Stunden)

| Data | Quelle | Auflösung | Zeitraum | Tokens |
|------|--------|-----------|----------|--------|
| Preis | DexScreener / Binance | 1-Sekunde | 14 Tage | 59 |
| Volume | DexScreener | 30-Sekunden | 14 Tage | 59 |
| Liquidity | OrderBook | 5-Minuten | 14 Tage | 59 |
| Bot | Chainstack / Helius | 5-Sekunden | 14 Tage | 59 |

### Phase 2: Automatisches Labeling (Geschätzt: 2 Stunden)

**Heuristiken für automatische Labels:**

| Heuristik | Bedingung | Label |
|------------|-----------|-------|
| AUTO_DUMP_24H | priceChange24h <= -30% | MASSIVEDUMP |
| AUTO_DUMP_4H | priceChange4h <= -20% | MASSIVEDUMP |
| AUTO_VOLUME_SPIKE | volume > 3x avg AND priceChange < -10% | MASSIVEDUMP |
| AUTO_BOT_NO_IMPACT | botProb >= 0.70 AND priceChange4h > -5% | BOTACTIVITYNOPRICEIMPACT |
| AUTO_NORMAL | priceChange24h > -15% AND volume < 2x avg | NORMALVOLATILITY |

### Phase 3: Manuelle Prüfung (Geschätzt: 16 Stunden)

**Events die manuelle Prüfung benötigen:**
- Confidence < 0.70
- Ambiguität in Bedingungen
- Fehlende Daten

### Phase 4: Quality Checks

| Check | Fail Condition | Action |
|-------|----------------|--------|
| Label Distribution | MASSIVEDUMP < 10% oder > 50% | Schwellenwerte revidieren |
| Temporal Coverage | Lücken > 4h | Daten ergänzen |
| Class Balance | Klasse < min Events | Mehr Daten sammeln |
| Inter-Rater | Cohen's Kappa < 0.7 | Label-Regeln überarbeiten |

### Mindestanzahl Events pro Klasse

| Klasse | Minimum | Warum |
|--------|---------|-------|
| MASSIVEDUMP | 30 | Statistische Signifikanz |
| NORMALVOLATILITY | 100 | Majority class |
| ILLIQUIDRANDOMMOVE | 15 | Seltene Klasse |
| WHALESELLNOCASCADE | 15 | Seltene Klasse |
| BOTACTIVITYNOPRICEIMPACT | 20 | Bot-Rauschen |

### Speicherformat

```jsonl
{"id":"evt_123456789_BONK","token":"BONK","pair":"BONK/SOL","label":"MASSIVEDUMP","priceDrop24h":-0.35,"confidence":0.85,...}
{"id":"evt_123456790_WIF","token":"WIF","pair":"WIF/SOL","label":"NORMALVOLATILITY","priceDrop24h":-0.05,"confidence":0.90,...}
```

**Partitionierung:** Nach Tag und Token
**Komprimierung:** zstd

### Gesamtgeschätzter Aufwand

- Phase 1-3 (Data + Auto-Labeling): ~40 Stunden
- Phase 4 (Manual Review + QA): ~28 Stunden
- Phase 5 (Backtesting Setup): ~4 Stunden

**GESAMT: ~72 Stunden (2 Wochen Vollzeit)**

---

## ANHANG F) EVALUATION FRAMEWORK STATUS

### Was ist fertig (INFRASTRUKTUR)

| Komponente | Status | Dateien |
|------------|--------|---------|
| Label Schema | ✅ FERTIG | `src/labels/schema.ts` |
| Label Generator | ✅ FERTIG | `src/labels/generator.ts` |
| Ground Truth Plan | ✅ FERTIG | `src/labels/ground-truth-plan.ts` |
| Labeling Workflow | ✅ FERTIG | `src/labels/labeling-workflow.ts` |
| Baseline B1-B5 | ✅ FERTIG | `src/baselines/baselines.ts` |
| Backtesting Engine | ✅ FERTIG | `src/backtest/engine.ts` |
| Evaluations Metriken | ✅ FERTIG | `src/eval/metrics.ts` |
| CLI Interface | ✅ FERTIG | `src/cli.ts` |
| Dokumentation | ✅ FERTIG | `README.md` |

### Was fehlt (DATA)

| Komponente | Status | Abhängigkeit |
|------------|--------|--------------|
| Ground Truth Dataset | ❌ FEHLT | Nichts |
| Historische Preis-Daten | ❌ FEHLT | Ground Truth |
| Manuelle Labels | ❌ FEHLT | Ground Truth |
| Backtest Results | ❌ FEHLT | Ground Truth |
| Valide Metriken | ❌ FEHLT | Ground Truth |

### Methodisch korrekte Kommunikation

**FALSCH (was wir NICHT sagen sollten):**
- "Unsere Precision beträgt X%"
- "KASPA schlägt Baseline B5 um Y%"
- "Das Modell hat eine FPR von Z%"
- "Wir haben das Evaluation Framework abgeschlossen"

**KORREKT (was wir sagen sollten):**
- "Wir haben die INFRASTRUKTUR für Evaluation gebaut"
- "Sobald Ground Truth existiert, können wir Precision/FPR/Ranking messen"
- "Die CLI führt DRY-RUNS mit synthetischen Daten durch"
- "Alle Metriken sind aktuell HYPOTHETISCH"

---

## ZUSAMMENFASSUNG

| Status | Bedeutung |
|--------|-----------|
| ✅ INFRASTRUKTUR FERTIG | Code, Schema, CLI sind funktionsfähig |
| ❌ KEINE GROUND TRUTH | Keine empirischen Daten vorhanden |
| ⚠️ ALLE METRIKEN HYPOTHETISCH | Keine validierten Aussagen möglich |
| ⏳ NÄCHSTER SCHRITT: | Ground Truth Dataset aufbauen |

**Erst wenn Ground Truth existiert:**
- Precision messbar
- FPR messbar
- Modell-Rankings valide
- Backtesting möglich
- Reale Aussagen über System-Performance möglich

---

## Arbeitsregel

**Ab jetzt gilt: Jede Änderung muss messbar etwas verbessern.**

Solange keine Ground Truth existiert, dürfen keine Leistungsbehauptungen über Precision, FPR, Ranking oder Modellüberlegenheit als valide dargestellt werden.

---

## Anhänge

### A) Liste aller aktuell nur hypothetischen Metriken

| Metrik | Grund für Hypothetisch |
|--------|------------------------|
| Precision (alle Modelle) | Kein Ground Truth Dataset |
| Recall (alle Modelle) | Kein Ground Truth Dataset |
| F1-Score (alle Modelle) | Kein Ground Truth Dataset |
| FPR (alle Modelle) | Kein Ground Truth Dataset |
| Lead Time | Keine gelabelten Events |
| Win Rate | Keine echten Trades |
| PnL | Kein Ground Truth |
| Sharpe Ratio | Kein Ground Truth |
| Modell-Rankings | Keine validierten Daten |
| "KASPA > B5" Behauptung | Nicht empirisch validiert |

### B) Was bereits echt möglich ist (ohne Ground Truth)

| Aufgabe | Status | Einschränkung |
|--------|--------|---------------|
| CLI ausführen | ✅ | Nur Dry-Runs, keine empirischen Aussagen |
| Code kompilieren | ✅ | Kein Ground Truth nötig |
| Schema validieren | ✅ | Kein Ground Truth nötig |
| Baseline-Signale generieren | ✅ | Nur synthetische Testdaten |
| Backtesting Engine Code testen | ✅ | Keine echten Events |

### C) Was NICHT möglich ist ohne Ground Truth

| Aufgabe | Warum nicht |
|---------|-------------|
| Precision messen | Kein Ground Truth |
| FPR messen | Kein Ground Truth |
| Modellvergleich | Kein Ground Truth |
| Lead Time berechnen | Keine gelabelten Events |
| Backtest durchführen | Keine Ground Truth für Resolution |
| Validierte Aussagen | Kein Ground Truth |

---

## ANHANG D) METRIK-STATUS: HYPOTHETISCH vs. REAL

### Vollständige Liste aller Metriken

**Status-Legende:**
- ✅ **EMPIRISCH MESSBAR** = Ground Truth vorhanden, Metrik ist valide
- ⚠️ **INFRASTRUKTUR VORHANDEN** = Code exists, aber keine Daten
- ❌ **HYPOTHETISCH** = Kein Ground Truth, keine empirische Aussagekraft

#### Signal Quality Metriken

| Metrik | Status | Ground Truth nötig | Aktuelle Aussagekraft |
|--------|--------|---------------------|------------------------|
| Precision | ⚠️ | JA | Keine (keine Daten) |
| Recall | ⚠️ | JA | Keine (keine Daten) |
| F1-Score | ⚠️ | JA | Keine (keine Daten) |
| False Positive Rate | ⚠️ | JA | Keine (keine Daten) |
| False Negative Rate | ⚠️ | JA | Keine (keine Daten) |
| Specificity | ⚠️ | JA | Keine (keine Daten) |
| Accuracy | ⚠️ | JA | Keine (keine Daten) |
| Prevalence | ⚠️ | JA | Keine (keine Daten) |

#### Lead Time Metriken

| Metrik | Status | Ground Truth nötig | Aktuelle Aussagekraft |
|--------|--------|---------------------|------------------------|
| Mean Lead Time | ⚠️ | JA | Keine (keine gelabelten Events) |
| Median Lead Time | ⚠️ | JA | Keine (keine gelabelten Events) |
| Min Lead Time | ⚠️ | JA | Keine (keine gelabelten Events) |
| Max Lead Time | ⚠️ | JA | Keine (keine gelabelten Events) |
| Lead Time Distribution | ⚠️ | JA | Keine (keine gelabelten Events) |

#### Trading Quality Metriken

| Metrik | Status | Ground Truth nötig | Aktuelle Aussagekraft |
|--------|--------|---------------------|------------------------|
| Win Rate | ⚠️ | JA | Keine (keine echten Trades) |
| Average PnL % | ⚠️ | JA | Keine (keine echten Trades) |
| Total PnL | ⚠️ | JA | Keine (keine echten Trades) |
| Median PnL | ⚠️ | JA | Keine (keine echten Trades) |
| Best Trade % | ⚠️ | JA | Keine (keine echten Trades) |
| Worst Trade % | ⚠️ | JA | Keine (keine echten Trades) |
| Sharpe Ratio | ⚠️ | JA | Keine (keine echten Trades) |
| Sortino Ratio | ⚠️ | JA | Keine (keine echten Trades) |
| Profit Factor | ⚠️ | JA | Keine (keine echten Trades) |

#### Risk Quality Metriken

| Metrik | Status | Ground Truth nötig | Aktuelle Aussagekraft |
|--------|--------|---------------------|------------------------|
| Max Drawdown % | ⚠️ | JA | Keine (keine echten Trades) |
| Max Drawdown Duration | ⚠️ | JA | Keine (keine echten Trades) |
| Calmar Ratio | ⚠️ | JA | Keine (keine echten Trades) |
| Volatility Daily | ⚠️ | JA | Keine (keine echten Trades) |
| Volatility Annualized | ⚠️ | JA | Keine (keine echten Trades) |
| Max Positions Held | ⚠️ | JA | Keine (keine echten Trades) |
| Consecutive Losses | ⚠️ | JA | Keine (keine echten Trades) |

### Was bereits echt möglich ist (ohne Ground Truth)

| Aufgabe | Status | Einschränkung |
|--------|--------|---------------|
| CLI ausführen | ✅ | Nur Dry-Runs, keine empirischen Aussagen |
| Code kompilieren | ✅ | Kein Ground Truth nötig |
| Schema validieren | ✅ | Kein Ground Truth nötig |
| Baseline-Signale generieren | ✅ | Nur synthetische Testdaten |
| Backtesting Engine Code testen | ✅ | Keine echten Events |
| Label-Schema definieren | ✅ | Kein Ground Truth nötig |
| Heuristiken definieren | ✅ | Kein Ground Truth nötig |
| Datenstrukturen erstellen | ✅ | Kein Ground Truth nötig |