# KAS PA - 24-Stunden Produktionstest Plan

## Zielsetzung

Der 24-Stunden Produktionstest validiert die **Langzeitstabilität** und **Aussagekraft** des KAS PA Systems unter realen Bedingungen. Dieser Test ist der finale Schritt vor einer möglichen Monetarisierung.

---

## Testzeitraum

| Parameter | Wert |
|-----------|------|
| **Start** | 11.04.2026 12:00 UTC |
| **Ende** | 12.04.2026 12:00 UTC |
| **Dauer** | 24 Stunden |
| **Check-Intervall** | 60 Sekunden |

---

## Voraussetzungen

### System-Status (erfüllt)
- [x] Chainstack RPC Verbindung ✅
- [x] Jupiter Price API ✅
- [x] Helius Enhanced API ✅
- [x] Bot Detection ✅
- [x] 9 Metriken System ✅
- [x] WebSocket Datenübertragung ✅
- [x] Dashboard erreichbar ✅
- [x] 30-Minuten Stabilitätstest bestanden ✅

### Technische Anforderungen
- [x] Backend läuft auf Hetzner Server
- [x] Dashboard erreichbar unter http://localhost:5173
- [x] WebSocket Backend auf ws://localhost:8080
- [x] Logs werden gespeichert in /data/trinity_apex/logs/

---

## Monitoring-Komponenten

### 1. Live Metriken (alle 60s)
| Metrik | Beschreibung | Erwarteter Bereich |
|--------|-------------|-------------------|
| `crashProbability` | Crash-Wahrscheinlichkeit | 0 - 1.0 |
| `price` | SOL Preis (Jupiter) | $20 - $500 |
| `slot` | Aktueller Solana Slot | > 400M |
| `latency` | WebSocket Latenz | < 60.000ms |
| `botProbability` | Bot-Erkennung | 0 - 1.0 |
| `zone` | IGNORE/MONITOR/SHORT | Enum |
| `capital` | Paper Trading Kapital | 0 - ∞ |

### 2. System-Gesundheit
| Check | Beschreibung | Kritisch wenn |
|-------|---------------|---------------|
| Verbindung | WebSocket verbunden | > 5% Ausfall |
| API-Response | Chainstack antwortet | Timeout > 10s |
| Preis-Update | SOL Preis aktualisiert | Kein Update > 5min |
| Zone-Wechsel | Regime-Änderungen | > 20 Wechsel/Stunde |

### 3. Paper Trading Performance
| Metrik | Beschreibung |
|--------|-------------|
| `totalTrades` | Anzahl aller Trades |
| `winningTrades` | Gewinnende Trades |
| `losingTrades` | Verlierende Trades |
| `winRate` | Gewinnrate (%) |
| `currentCapital` | Aktuelles Kapital |
| `maxDrawdown` | Maximaler Drawdown |

---

## Kritische Schwellenwerte (Alerts)

### Warning-Level
| Metrik | Schwellwert | Aktion |
|--------|-------------|--------|
| Latenz | > 30.000ms | Log entry |
| Zone-Wechsel | > 10/Stunde | Log entry |
| Bot Probability | > 0.75 | Log entry |

### Critical-Level
| Metrik | Schwellwert | Aktion |
|--------|-------------|--------|
| Verbindungsausfall | > 5% | Alert Banner |
| Crash Probability | > 0.20 | SMS/Email Alert |
| Drawdown | > 20% | Trading stoppen |
| API Timeout | > 60s | Neustart |

---

## Datenanalyse nach Testende

### Quantitative Metriken
1. **Connection Retention**: > 99% erforderlich
2. **Average Latency**: < 10.000ms Zielwert
3. **Max Latency**: < 60.000ms akzeptabel
4. **Prediction Count**: ~2880 (24h × 60min × 2 checks)

### Qualitative Analyse
1. **False Positive Rate**: Wie viele SHORT-Signale waren falsch?
2. **True Positive Rate**: Wurden reale Crashes erkannt?
3. **Bot Detection Accuracy**: Stimmen Bot-Signale mit realen Bots überein?

### Validierungskriterien
| Kriterium | Zielwert | Akzeptabel |
|-----------|----------|------------|
| Connection Retention | > 99% | > 95% |
| Avg Latency | < 10s | < 30s |
| Max Latency | < 60s | < 120s |
| False Positive Rate | < 30% | < 50% |
| Zone Distribution | IGNORE dominant | ANY |

---

## Fail-Safes

### Automatische Reaktionen

1. **Connection Loss > 5min**
   - Backend neustarten
   - Alert senden
   - Log: "Auto-restart due to connection loss"

2. **API Timeout > 60s**
   - Chainstack Endpoint wechseln
   - Fallback auf sekundären RPC
   - Log: "Using fallback RPC"

3. **Memory Leak Detection**
   - RAM > 2GB: Heap Dump erstellen
   - Restart bei > 3GB

4. **Crash Signal > 0.50**
   - Sofort SHORT position
   - Alert an User
   - Log: "CRITICAL: High crash probability detected"

---

## Berichterstattung

### Während des Tests (stündlich)
```
[12:00] Hour 1 Complete: 60 checks, 0 disconnects, Avg Latency: 12450ms
[13:00] Hour 2 Complete: 60 checks, 0 disconnects, Avg Latency: 11230ms
...
```

### Nach Testende
1. **JSON Report**: `/data/trinity_apex/logs/24h-test-report.json`
2. **CSV Data**: `/data/trinity_apex/logs/24h-metrics.csv`
3. **Performance Summary**: WinRate, Trades, Kapital
4. **Anomalien**: Liste aller ungewöhnlichen Events

---

## Start-Prozedur

### 1. Pre-Test Checks (11.04.2026 11:50 UTC)
```bash
# 1. Backend Status prüfen
ps aux | grep live-paper

# 2. WebSocket Test
npx tsx scripts/100-percent-check.ts

# 3. Logs bereinigen
rm /data/trinity_apex/logs/24h-*.json
rm /data/trinity_apex/logs/24h-*.csv

# 4. Dashboard prüfen
curl http://localhost:5173
```

### 2. Test starten (11.04.2026 12:00 UTC)
```bash
cd /data/trinity_apex/solana-stream
nohup npx tsx scripts/24h-production-test.ts > /data/trinity_apex/logs/24h-test.log 2>&1 &

# Verifikation
sleep 5
tail /data/trinity_apex/logs/24h-test.log
```

### 3. Monitoring während des Tests
```bash
# Live Status
tail -f /data/trinity_apex/logs/24h-test.log

# Metrics CSV
tail -f /data/trinity_apex/logs/24h-metrics.csv

# System Resources
htop
```

---

## Erfolgsindikatoren

### Must-Have (für "GO" nach 24h)
- [ ] Connection Retention > 95%
- [ ] Max Latency < 120s
- [ ] Keine Memory Leaks
- [ ] Paper Trading läuft durchgehend
- [ ] Zone-Verteilung plausibel (IGNORE > 80%)

### Nice-to-Have
- [ ] Connection Retention > 99%
- [ ] Avg Latency < 10s
- [ ] Mindestens 1 erfolgreich erkannter Crash
- [ ] WinRate > 40%

---

## Nächste Schritte nach erfolgreichem Test

1. **Dokumentation**: Ergebnisse in KAS_PA_AKTIONSPROTOKOLL.md aktualisieren
2. **Backtesting**: CPCV Validierung mit 24h Daten
3. **Parameter-Tuning**: Falls nötig, Schwellenwerte anpassen
4. **Monetarisierung**: Strategy für Live-Trading entwickeln

---

## Kontakte während des Tests

| Rolle | Verantwortlich | Backup |
|-------|----------------|--------|
| System-Monitoring | Auto (Script) | - |
| Alert-Empfänger | User | - |
| Incident Response | User | - |

---

*Letztes Update: 11.04.2026 10:30 UTC*
