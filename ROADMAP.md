# KAS PA - 8-Wochen Production Readiness Roadmap

## Ziel
**System für Echtgeld-Einsatz vorbereiten** durch systematische Daten Sammlung, Training und Validierung.

---

## Phasen Overview

```
Woche 1-2: Data Collection
├── Bug Fixes (TypeScript)
├── Training Mode aktivieren
├── 24h Test durchführen
└── 7 Tage Paper Trading Daten sammeln

Woche 3-4: Model Training
├── LightGBM Training Pipeline
├── Hyperparameter Tuning
├── Shadow Mode: ML vs Bayesian
└── Modell Evaluation

Woche 5-6: Backtesting
├── Historische Crash-Daten
├── Sharpe/Sortino Ratio
├── Maximum Drawdown Analysis
└── Regime Detection Validation

Woche 7: Stress Testing
├── Monte Carlo Simulation
├── Worst Case Szenarien
├── Liquidity Shock Tests
└── Korrelationsanalyse

Woche 8: Production Prep
├── Production Modell Deployment
├── Alerting konfigurieren
├── Rollback Procedure
└── Final Validation
```

---

## Meilensteine

### M1: Data Pipeline Fix ✓ (Status: IN_PROGRESS)
**Deadline:** 2026-04-18
**Tasks:**
- [ ] TypeScript Fehler in ml/lightgbm-training-logger.ts beheben
- [ ] TypeScript Fehler in ml/zscore-normalizer.ts beheben
- [ ] Training Mode in live-paper-trading-v4.ts aktivieren
- [ ] Backend Neustart und Verifikation
- [ ] LightGBM Logs werden geschrieben

**Verantwortlich:** Cursor Agent

---

### M2: 24h Test durchführen
**Deadline:** 2026-04-19
**Tasks:**
- [ ] System Readiness Check
- [ ] Backend starten (Training Mode)
- [ ] Nach 2h: LightGBM Daten prüfen
- [ ] Nach 24h: Ergebnisse analysieren
- [ ] Erste Training Data Summary erstellen

**Kriterien für Erfolg:**
- Min. 2.000 Cycles geloggt
- Alle 9 Metriken + Z-Scores vorhanden
- Bot Detection Features vollständig
- Keine Runtime Errors

---

### M3: 7 Tage Data Collection
**Deadline:** 2026-04-24
**Tasks:**
- [ ] System kontinuierlich laufen lassen
- [ ] Täglich: Daten-Backup erstellen
- [ ] Täglich: Log-Rotation konfigurieren
- [ ] Nach 7 Tagen: Dataset Export
- [ ] Data Quality Check

**Kriterien für Erfolg:**
- Min. 10.000 Cycles gesammelt
- Min. 100 Trade-Results mit echten Labels
- Verifizierte Crash-Labels vorhanden

---

### M4: LightGBM Training Pipeline
**Deadline:** 2026-04-28
**Tasks:**
- [ ] Training Script erstellen (train_lightgbm.py)
- [ ] Feature Engineering finalisieren
- [ ] Time Series Cross-Validation
- [ ] Hyperparameter Tuning (GPU wenn verfügbar)
- [ ] Modell Evaluation (Precision, Recall, F1)

**Kriterien für Erfolg:**
- Modell Accuracy > 65%
- Precision > 60%
- Recall > 55%

---

### M5: Shadow Mode Integration
**Deadline:** 2026-05-01
**Tasks:**
- [ ] ML Predictions parallel zu Bayesian loggen
- [ ] Vergleichs-Dashboard erstellen
- [ ] Disagreements analysieren
- [ ] Ensemble-Strategie definieren

**Kriterien für Erfolg:**
- Beide Systeme treffen Entscheidungen
- ML und Bayesian mindestens 80% Agreement
- Disagreements dokumentiert

---

### M6: Backtesting durchführen
**Deadline:** 2026-05-08
**Tasks:**
- [ ] Historische Daten beschaffen (COVID, Terra, FTX)
- [ ] Backtesting Framework aufsetzen
- [ ] Sharpe Ratio berechnen
- [ ] Sortino Ratio berechnen
- [ ] Maximum Drawdown analysieren

**Kriterien für Erfolg:**
- Sharpe Ratio > 1.5
- Max Drawdown < 20%
- Win Rate > 55%

---

### M7: Stress Testing
**Deadline:** 2026-05-15
**Tasks:**
- [ ] Monte Carlo Simulation (1000 Runs)
- [ ] Worst Case Szenarien definieren
- [ ] Liquidity Shock Tests
- [ ] Edge Case Testing
- [ ] Risk Limits kalibrieren

**Kriterien für Erfolg:**
- 95th Percentile Drawdown < 25%
- Kein Totalverlust in Simulationen
- Liquidity bei 99% der Trades gewährleistet

---

### M8: Production Ready
**Deadline:** 2026-05-22
**Tasks:**
- [ ] Finales Modell deployen
- [ ] Alerting konfigurieren (Slack/Email)
- [ ] Rollback Procedure dokumentieren
- [ ] Runbook erstellen
- [ ] Final Validation

**Kriterien für Erfolg:**
- Alle 7 vorherigen Meilensteine erfüllt
- Dokumentation vollständig
- Team kann System betreiben
- Echtgeld Deployment freigegeben

---

## Aktuelle Meilensteine Status

| Meilenstein | Status | Deadline | Fortschritt |
|-------------|--------|----------|-------------|
| M1: Data Pipeline Fix | 🔴 IN_PROGRESS | 2026-04-18 | 60% |
| M2: 24h Test | ⏳ PENDING | 2026-04-19 | 0% |
| M3: 7 Tage Collection | ⏳ PENDING | 2026-04-24 | 0% |
| M4: LightGBM Training | ⏳ PENDING | 2026-04-28 | 0% |
| M5: Shadow Mode | ⏳ PENDING | 2026-05-01 | 0% |
| M6: Backtesting | ⏳ PENDING | 2026-05-08 | 0% |
| M7: Stress Testing | ⏳ PENDING | 2026-05-15 | 0% |
| M8: Production Ready | ⏳ PENDING | 2026-05-22 | 0% |

---

## Automatisiertes Tracking

Dieser Plan wird automatisch getrackt via:
- `.github/workflows/roadmap-tracker.yml` - Wöchentlicher Report
- `.github/workflows/milestone-check.yml` - Deadline Alerts
- `.github/workflows/stagnation-alert.yml` - Verzögerungs-Alerts

---

## Letzte Aktualisierung
**Datum:** 2026-04-17
**Version:** 1.0
**Status:** ACTIVE
