# Data Infrastructure - Wochen 1-2

## Überblick

Dieses Modul implementiert die Data Infrastructure für das SPL Token Crash Prediction System.

## Architektur

```
data/
├── src/
│   ├── index.ts              # Main exports
│   ├── metrics/              # 9 Crash Detection Metrics
│   │   ├── hawkes.ts         # Hawkes branching ratio (n)
│   │   ├── entropy.ts        # Permutation entropy (PE)
│   │   ├── graph.ts          # Molloy-Reed ratio (κ) + Fragmentation (S₂/S₁)
│   │   ├── epidemic.ts       # Epidemic R_t
│   │   ├── seismic.ts        # Gutenberg-Richter b-value
│   │   ├── transfer.ts       # Transfer entropy clustering (C_TE)
│   │   ├── superspreader.ts  # Superspreader activation (SSI)
│   │   ├── liquidity.ts      # Liquidity impact deviation (LFI)
│   │   └── index.ts          # Metric registry + crash probability formula
│   ├── storage/              # Storage Layer
│   │   ├── arrow-storage.ts  # Apache Arrow for time-series
│   │   └── redis-metrics-store.ts  # Redis Streams integration
│   └── validation/           # Validation Dataset
│       └── loader.ts         # 6 crash events (TRUMP, LIBRA, SOL, OM, MEMECAP, WIF)
├── package.json
└── tsconfig.json
```

## 9 Crash Detection Metrics

| # | Metrik | Symbol | Was es erfasst | Normalisierung |
|---|--------|-------|----------------|---------------|
| 1 | Hawkes branching ratio | n | Selbst-Existierung in Transaktionsstream | n→1 = kritisch |
| 2 | Permutation entropy | PE | Information regime shifts | PE drop = gefährlich |
| 3 | Molloy-Reed ratio | κ | Netzwerk-strukturelle Stabilität | κ→2 = gefährlich |
| 4 | Giant component fragmentation | S₂/S₁ | Perkolations-Phasenübergang | Rising = gefährlich |
| 5 | Epidemic R_t | R_t | Kontagions-Dynamik | R_t > 1 = superkritisch |
| 6 | Gutenberg-Richter b | b | Stress-Akkumulation | b < 1 = gefährlich |
| 7 | Transfer entropy clustering | C_TE | Herding-Verhalten | Rising = gefährlich |
| 8 | Superspreader activation | SSI | Wal-Aktivierung | SSI spike = gefährlich |
| 9 | Liquidity impact deviation | LFI | Liquidity Evaporation | Rising = gefährlich |

## Crash Probability Formula

```
z(t) = β₀ + β₁·κ̃ + β₂·R̃t + β₃·P̃E + β₄·C̃TE + β₅·b̃f + β₆·ñ + β₇·(S̃₂/S₁) + β₈·S̃SI + β₉·L̃FI
       + γ₁·κ̃·ñ + γ₂·P̃E·(S̃₂/S₁) + γ₃·L̃FI·S̃SI

P(crash_3pct_24h) = 1 / (1 + exp(-z(t)))
```

## Validation Events

Die 6 wichtigsten Crash-Events für Backtesting:

1. **TRUMP-2025-01**: TRUMP Memecoin Crash (Jan 17-19, 2025) - 85%+ Rückgang
2. **LIBRA-2025-02**: LIBRA Token Skandal (Feb 14, 2025) - 97% Crash, $107M Insider Cash-Out
3. **SOL-2025-Q1**: SOL 64% Korrektur (Jan-Apr 2025) - $294 → $105
4. **OM-2025-04**: Mantra OM Collapse (Apr 2025) - $5.6B verdampft
5. **MEMECAP-2024-2025**: Memecoin Market Cap Collapse - $150.6B → $38B
6. **WIF-BONK-POPCAT-2024**: WIF/BONK/POPCAT Crashes - 80-91% von ATHs

## Installation

```bash
npm install
```

## Testing

```bash
npx tsc --noEmit  # Type-check
```

## Nächste Schritte

- Woche 3-4: Metric Reconstruction für alle Validation Events
- Woche 5-6: CPCV Backtesting (PBO, Deflated Sharpe)
- Woche 7-8: Walk-Forward Analysis
- Woche 9-11: Paper Trading
- Woche 12: Go/No-Go Decision
