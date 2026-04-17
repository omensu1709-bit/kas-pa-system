# KAS PA - 24 STUNDEN PRODUKTIONSTEST

## STARTUP ANLEITUNG

### VORAUSSETZUNGEN

1. **Backend muss laufen** auf Port 8080
2. **Dashboard optional** für visuelle Überwachung
3. **Alle APIs verbunden** (Chainstack, Helius, Jupiter)

---

## SCHRITT 1: SYSTEM VALIDIERUNG

```bash
cd /data/trinity_apex/solana-stream

# System-Check ausführen
npx ts-node scripts/system-ready-check.ts
```

**Erwartete Ausgabe:**
```
============================================================
KAS PA - SYSTEM READY CHECK
============================================================

Testing backend connectivity...

[PASS] Chainstack RPC Connection
[PASS] Jupiter Price API
[PASS] WebSocket Connection

Testing data flow...

[PASS] WebSocket Data Flow
[PASS] Prediction Data Structure
[PASS] Ranking Data Structure
[PASS] Bot Metrics Structure

VERDICT: READY FOR 24H TEST
```

---

## SCHRITT 2: BACKEND STARTEN (falls nicht bereits gestartet)

```bash
cd /data/trinity_apex/solana-stream
npx ts-node paper-trading/src/live-paper-trading.ts
```

**Output sollte sein:**
```
============================================================
LIVE PAPER TRADING - INFINITE MODE
============================================================
Data Source: Chainstack REST API
RPC: https://solana-mainnet.core.chainstack.com
Update Interval: 30s
Press Ctrl+C to stop
```

---

## SCHRITT 3: 24-STUNDEN TEST STARTEN

```bash
cd /data/trinity_apex/solana-stream
npx ts-node scripts/24h-production-test.ts
```

**ODER mit Starter-Script:**

```bash
chmod +x start-24h-test.sh
./start-24h-test.sh
```

---

## MONITORING WÄHREND DES TESTS

### Dashboard öffnen (optional)
```
http://localhost:5173
```

### Logs ansehen
```bash
# Live Logs
tail -f logs/24h-test/data/predictions_*.csv

# Reports
ls -la logs/24h-test/reports/
```

---

## 24H TEST PARAMETER

| Parameter | Wert |
|-----------|------|
| **Dauer** | 24 Stunden |
| **Check-Intervall** | 10 Sekunden |
| **Report-Intervall** | 1 Stunde |
| **CSV-Speicherung** | Jede Stunde |
| **Alert-Schwelle (Crash)** | > 20% |
| **Alert-Schwelle (Bot)** | > 75% |
| **Alert-Schwelle (Latenz)** | > 30 Sekunden |

---

## QUALITÄTS-KRITERIEN (PASS/FAIL)

| Kriterium | Schwellwert |
|-----------|-------------|
| Connection Retention | > 95% |
| Max Latency | < 120 Sekunden |
| IGNORE Zone | > 30% |
| Keine kritischen Errors | - |

---

## OUTPUT FILES

Nach dem Test finden sich alle Daten in:

```
logs/24h-test/
├── data/
│   ├── predictions_<timestamp>.csv    # Alle Predictions
│   └── metrics_<timestamp>.csv        # Metriken
├── reports/
│   ├── report_<timestamp>.txt         # Stündliche Reports
│   └── FINAL_REPORT.txt               # Finaler Report
└── critical_alerts.txt                # Kritische Alerts
```

---

## BEENDEN DES TESTS

```bash
# Ctrl+C im Terminal
# ODER
pkill -f "24h-production-test"
```

---

## TROUBLESHOOTING

### "Connection refused" Fehler
- Backend läuft nicht → `npx ts-node paper-trading/src/live-paper-trading.ts` starten

### "No data received"
- WebSocket nicht verbunden → Backend neustarten

### Hohe Latenz
- Chainstack Rate-Limit erreicht → Warten oder API-Key erneuern

---

## ERFOLGREICHER TEST

Ein erfolgreicher 24h-Test produziert:

1. **Final Report** mit PASS/FAIL Status
2. **CSV-Dateien** mit allen Predictions
3. **Metrics** für weitere Analyse
4. **Alerts** falls kritische Events auftraten
