# NODE B INTEGRITY CHECKLIST
## Prompt zur Überprüfung der gRPC/Shred Stream Datenintegrität

---

## 1. QUELLEN-VERIFIZIERUNG

### 1.1 Yellowstone gRPC Endpoint
```
ENDPOINT: yellowstone-solana-mainnet.core.chainstack.com:443
TOKEN: ac8087135c7768aba464e0d8a24bfba9
COMMITMENT: PROCESSED

PRÜFUNG:
□ Verbindung erreichbar (HTTP 200/401)
□ Token authentisch
□ Subscription aktiv
□ Keine Timeouts
```

### 1.2 Chainstack Token Status
```
PRÜFUNG:
□ Token nicht abgelaufen
□ Guthaben ausreichend
□ Rate-Limits eingehalten
□ Keine 403/429 Errors
```

---

## 2. SHREDSTREAM EMPFANG

### 2.1 Core0 Multiplexer (Node A Seite)
```
METRIKEN ZU ÜBERWACHEN:
□ processed: Zähler der empfangenen Transaktionen
□ grpc_errors: Kumulativer gRPC Fehlerzähler
□ hw_ts: Hardware-Timestamp (CLOCK_MONOTONIC)

WARNUNGSSCHWELLEN:
⚠️ grpc_errors > 100 in 1 Stunde = KRITISCH
⚠️ processed stagniert > 30 Sekunden = VERBINDUNG VERLOREN
⚠️ hw_ts Lücken > 1 Sekunde = TIMESTAMP ANOMALIE
```

### 2.2 Datenformat Prüfung
```
SHRED HEADER (21 bytes):
□ timestamp_ns: uint64 (CLOCK_MONOTONIC)
□ slot: uint64
□ shred_index: uint32
□ is_spent: bool (1 byte)

VALIDIERUNG:
□ timestamp_ns monoton steigend
□ slot innerhalb erwartetem Bereich
□ shred_index < 32 (typisch für Solana)
□ Keine NULL/Werte
```

---

## 3. ZEROZERO IPC INTEGRITÄT

### 3.1 Socket Status
```
SOCKET: /tmp/kas_grpc_stream.ipc
TYP: ZMQ PUB/SUB
PID: 1194378 (Core0 Publisher)

PRÜFUNG:
□ Socket existiert
□ Socket Typ korrekt (socket: 0x...)
□ Prozess aktiv (PID existiert)
□ Keine ZMQ Errors in Logs
```

### 3.2 Message Throughput
```
BERECHNUNG:
Throughput = messages / zeit

WARNUNGSSCHWELLEN:
⚠️ Throughput < 500 tx/sec = UNTERLAST
⚠️ Throughput = 0 = KRITISCH (Stream unterbrochen)
⚠️ Durchschnittliche Zyklus-Differenz < 5000 msgs = ANOMALIE
```

---

## 4. CORE2 HOTPATH VERARBEITUNG

### 4.1 Feature Extraction Status
```
METRIKEN ZU ÜBERWACHEN:
□ received: Empfangene Nachrichten von IPC
□ computed: Erfolgreich berechnete Feature-Vektoren
□ errors: Verarbeitungsfehler

WARNUNGSSCHWELLEN:
⚠️ errors > 0 pro Minute = FEHLER IN VERARBEITUNG
⚠️ computed < received = DATENVERLUST
⚠️ received = 0 für > 10 Sekunden = IPC PROBLEM
```

### 4.2 Feature Vector Validierung
```
FORMAT: 40 x float64 = 320 bytes

FEATURE KATEGORIEN:
Index 0-3:   VPIN (roh, MA5, MA20, STD)
Index 4-6:   OFI (best_bid, best_ask, net)
Index 7-9:   Liquidity (depth_50bps, depth_200bps, imbalance)
Index 10-13: Volume (1m, 5m, 1h, volatility)
Index 14-17: Price (mid, deviation, momentum, impact)
Index 18-21: Microstructure (spread, resiliency, queue_imbalance)
Index 22-24: MEV-Jito (tip_amount, tip_count, priority_fee_avg)
Index 25-27: MEV-Activity (bundle_ratio, sandwich_ratio, arb_ratio)
Index 28-31: Leader-Info (leader_slot, leader_reputation, slot_density)
Index 32-35: Bot-Activity (bot_density, bot_volume, bot_similarity)
Index 36-39: Signal-Composite (vulnerability_score, short_prob, confidence)

VALIDIERUNG:
□ Alle Werte im gültigen Bereich (z.B. nicht NaN, nicht Inf)
□ VPIN zwischen 0 und 1
□ Preise positiv
□ Timestamps monoton
□ Feature-History konsistent
```

---

## 5. SHARED MEMORY INTEGRITÄT

### 5.1 SHM Segment Status
```
DATEI: /dev/shm/kas_pa_features
GRÖSSE: 369 bytes
LAYOUT:
  Offset 0-7:    MAGIC (0xDEADBEEFCAFEBABE)
  Offset 8-15:   Head Pointer
  Offset 16-19:  Version (1)
  Offset 20-31:  Padding
  Offset 32-39:  Timestamp (float64)
  Offset 40-47:  Slot (uint64)
  Offset 48:     Valid Flag (1 byte)
  Offset 49-368: Features (40 x float64)

PRÜFUNG:
□ MAGIC Header korrekt (0xDEADBEEFCAFEBABE)
□ Version = 1
□ Timestamp aktuell (< 5 Sekunden alt)
□ Slot fortlaufend (keine Lücken > 100 Slots)
□ Valid Flag = true
```

---

## 6. CORE5 VLAN TRANSMISSION

### 6.1 Send Status
```
METRIKEN ZU ÜBERWACHEN:
□ sent: Anzahl gesendeter VLAN-Pakete
□ bytes: Gesamtbytes gesendet
□ errors: Sendefehler

WARNUNGSSCHWELLEN:
⚠️ errors > 0 = NETZWERKPROBLEM
⚠️ sent Stagnation = VLAN NICHT FUNKTIONSFÄHIG
⚠️ bytes/s < 1000 = UNTERLAST
```

### 6.2 VLAN Paket Validierung
```
FORMAT:
  Header:  Slot (8) + Timestamp (8) + Valid (1) + Features (320) = 337 bytes
  UDP:     ~8 bytes
  IP:      ~20 bytes
  Total:   ~365 bytes (unter MTU 1400)

PRÜFUNG:
□ Paketgröße konstant (~365 bytes)
□ Ziel-IP: 10.0.1.2
□ Ziel-Port: 8002
□ Quell-IP: 10.0.1.1
□ Keine Fragmentierung
```

---

## 7. NODE B EMPFANG

### 7.1 Empfangs-Status
```
VON: Node A (10.0.1.1:8002)
AN: Node B (10.0.1.2:8002)

PRÜFUNG:
□ UDP Port 8002 offen und empfangsbereit
□ Empfangene Pakete pro Sekunde
□ Paket-Verlust-Rate
□ Latenz (Round-Trip-Time)
□ Jitter (Varianz der Latenz)

WARNUNGSSCHWELLEN:
⚠️ Empfang < 5 Pakete/sec = SEVERE UNTERLAST
⚠️ Paketverlust > 1% = NETZWERKPROBLEM
⚠️ Latenz > 100ms = VERZÖGERUNG
⚠️ Jitter > 50ms = UNSTABILE VERBINDUNG
```

### 7.2 Feature Vector Empfangs-Validierung
```
CHECKLISTE:
□ 40 Features pro Paket
□ Alle Werte numerisch (keine NaN/Inf)
□ Features im erwarteten Wertebereich
□ Timestamp aktuell
□ Slot nummer fortlaufend
□ Sequence nicht gebrochen (Lücken erkennen)
```

---

## 8. DATENINTEGRITÄTS-METRIKEN

### 8.1 Berechnungsformeln
```
FEHLERRATE:
  gRPC_Error_Rate = grpc_errors / processed * 100

VERARBEITUNGSQUOTE:
  Processing_Rate = computed / received * 100

PUFFER-DIFFERENZ:
  Buffer_Diff = processed - received
  Buffer_Diff_Pct = Buffer_Diff / processed * 100

VLAN SEND EQUOTE:
  VLAN_Success_Rate = sent / computed * 100
```

### 8.2 Schwellenwerte
```
AKZEPTABLE BEREICHE:
  ✓ gRPC Error Rate: < 0.01%
  ✓ Processing Rate: = 100%
  ✓ Buffer Diff: < 0.1%
  ✓ VLAN Success: = 100%

WARNUNGEN:
  ⚠️ gRPC Error Rate: 0.01% - 0.1%
  ⚠️ Buffer Diff: 0.1% - 1%
  ⚠️ Processing Rate: 99% - 100%

KRITISCH:
  🔴 gRPC Error Rate: > 0.1%
  🔴 Buffer Diff: > 1%
  🔴 Processing Rate: < 99%
  🔴 VLAN Success: < 99%
```

---

## 9. AUTOMATISCHE ALERTS

### 9.1 Alert-Kategorien
```
KRITISCH (sofortige Benachrichtigung):
  🔴 gRPC Verbindung verloren
  🔴 ZeroMQ Socket inaktiv
  🔴 Shared Memory MAGIC Header korrupt
  🔴 > 1% Datenverlust

WARNUNG (innnerhalb 1 Minute):
  ⚠️ gRPC Error Rate > 0.01%
  ⚠️ Buffer Diff > 0.1%
  ⚠️ Durchsatz unter 50% des Erwarteten
  ⚠️ VLAN Paketgröße anomal

INFO (periodisch):
  ✓ System Health OK
  ✓ Alle Metriken im grünen Bereich
```

### 9.2 Alert-Kontakte
```
PRIORITÄT 1: Systemadministrator
PRIORITÄT 2: Trading Team Lead
PRIORITÄT 3: On-Call Engineer
```

---

## 10. DASHBOARD METRIKEN

### 10.1 Anzuzeigende Metriken
```
REAL-TIME:
  • gRPC Throughput (tx/sec)
  • gRPC Error Rate (%)
  • Buffer Fill Level
  • VLAN Send Rate (packets/sec)
  • Node B Empfangs-Rate (packets/sec)

HISTORISCH:
  • 24-Stunden Throughput-Trend
  • Error-Rate Verlauf
  • Latenz-Verteilung (p50, p95, p99)
  • Verlust-Quote über Zeit
```

### 10.2 Dashboard Refresh
```
Aktualisierung: Alle 5 Sekunden
History: 24 Stunden
Graph-Typ: Line Chart (Zeitachse)
Alerts: Popup bei Schwellenüberschreitung
```

---

## 11. CHECKLISTE ZUR AUSFÜHRUNG

### Vor dem Start:
```
□ Alle Core-Prozesse aktiv
□ ZeroMQ Socket existiert und verbunden
□ Shared Memory gemountet
□ VLAN Interface konfiguriert
□ Node B UDP Port offen
□ Monitoring aktiviert
```

### Während des Betriebs:
```
□ Alle 5 Minuten: STATS prüfen
□ Alle 15 Minuten: Error-Rate verifizieren
□ Stündlich: Puffer-Differenz prüfen
□ Täglich: Vollständiger Integritäts-Test
```

### Bei Alert:
```
□ Alert-Quelle identifizieren
□ Schweregrad bestimmen
□ Entsprechende Partei benachrichtigen
□ Problem dokumentieren
□ Lösung verifizieren
```

---

## 12. NOTFALL-PROZEDUREN

### Bei Datenverlust:
```
1. Sofort Core0/Core2 Logs prüfen
2. Netzwerk-Verbindung testen
3. gRPC Token verifizieren
4. Bei Bedarf: Neustart der betroffenen Komponente
5. Datenquellen-Altenative prüfen (Fallback RPC)
```

### Bei komplettem Ausfall:
```
1. System-Isolierung durchführen
2. Alert an alle Stakeholder
3. Backup-Datenquelle aktivieren
4. Recovery-Prozedur einleiten
5. Post-Mortem Analyse durchführen
```

---

**ERSTELLT**: 2026-04-07
**VERSION**: 1.0
**STATUS**: AKTIV
**NÄCHSTE REVIEW**: 2026-04-14
