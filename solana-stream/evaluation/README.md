# KAS PA v4.3 - Evaluation Framework

## Überblick

Dieses Framework ermöglicht die empirische Validierung des KAS PA Systems durch:

1. **Ground-Truth Labeling** - Definierte Event-Labels für Crash-/Dump-Signale
2. **Baseline-Vergleich** - Vergleich mit einfachen Signalmodelle (B1-B5)
3. **Backtesting-Engine** - Zeitkorrekte Evaluation ohne Lookahead-Bias
4. **Metriken-Berechnung** - Precision, Recall, FPR, Lead Time, PnL

## Reihenfolge der Validierung

```
Ground Truth → Baselines B1-B5 → Backtesting → Event-Level Metriken
     ↓              ↓                  ↓              ↓
  Labels        Benchmark         Zeitkorrekt    messbar
```

## Verzeichnisstruktur

```
evaluation/
├── src/
│   ├── labels/
│   │   ├── schema.ts       # Label-Schema Definition
│   │   └── generator.ts   # Label Generator
│   ├── baselines/
│   │   └── baselines.ts   # B1-B5 Baseline Modelle
│   ├── backtest/
│   │   └── engine.ts      # Backtesting Engine
│   ├── eval/
│   │   └── metrics.ts     # Evaluations Metriken
│   └── cli.ts             # CLI Interface
├── data/
│   ├── labels/            # Ground Truth Labels
│   ├── signals/          # Backtest Signale
│   └── results/           # Evaluation Ergebnisse
├── package.json
└── README.md
```

## Installation

```bash
cd evaluation
npm install
```

## CLI Usage

```bash
# Alle Baselines ausführen
npx tsx src/cli.ts run --baselines=B1,B2,B3,B4,B5

# Einzelnes Modell evaluieren
npx tsx src/cli.ts eval --model=B5

# Alle Modelle vergleichen
npx tsx src/cli.ts compare

# Hilfe anzeigen
npx tsx src/cli.ts help
```

## Label-Schema

### Event-Typen

| Label | Beschreibung |
|-------|-------------|
| `MASSIVEDUMP` | Preisverlust >= 30% in 24h |
| `NORMALVOLATILITY` | Normale Marktbewegung |
| `ILLIQUIDRANDOMMOVE` | Illiquider Einmal-Move |
| `WHALESELLNOCASCADE` | Einzelner Whale-Exit |
| `BOTACTIVITYNOPRICEIMPACT` | Bot-Aktivität ohne Preiseffekt |

### Event-Schema

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

## Baseline Modelle

| Baseline | Beschreibung | Erwartete Precision |
|----------|-------------|---------------------|
| B1 | Random Classifier | ~1% |
| B2 | SMA/Price Momentum | ~5-10% |
| B3 | Volume Spike | ~8-15% |
| B4 | Bot-Only | ~10-15% |
| B5 | Heuristic 3/5 | ~15-20% |
| KASPA | Unser System | >25% (Ziel) |

## Evaluations-Metriken

### Signal Quality
- Precision: TP / (TP + FP)
- Recall: TP / (TP + FN)
- F1-Score
- False Positive Rate
- False Negative Rate

### Lead Time
- Mean Lead Time
- Median Lead Time
- Distribution (<15min, 15-30min, 30-60min, 1-2h, 2-4h, >4h)

### Trading Quality
- Win Rate
- Average PnL %
- Sharpe Ratio
- Profit Factor

### Risk Quality
- Max Drawdown
- Calmar Ratio
- Volatility

## Offene Datenlücken

⚠️ **KRITISCH:** Ground-Truth Dataset muss noch aufgebaut werden.

Benötigt:
1. Historische Dump-Events manuell gelabelt
2. Preisverlust-Daten für mehrere Time-Windows
3. Bot-Aktivität-Daten für Korrelationsanalyse

## Nächste Schritte

1. [ ] Ground-Truth Dataset aufbauen (7 Tage historische Daten)
2. [ ] Baseline B1-B5 mit echten Daten testen
3. [ ] Backtesting-Engine mit zeitkorrekten Cutoffs
4. [ ] Metriken-Berechnung pro Event validieren

## Prioritätsregel

Ab jetzt gilt: **Jede Änderung muss mindestens eines verbessern:**
- Precision
- False Positive Rate
- Lead Time
- Stabilität über Marktregime
- Nachvollziehbarkeit pro Signal

Wenn eine Änderung nur "konzeptionell schöner" ist, ist sie nachrangig.