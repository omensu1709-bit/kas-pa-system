# Solana Stream - Hybrid Helius + ChainStack Streaming System

Maximaleffiziente SOTA-Lösung für Solana-Streaming mit dual-stream Architektur.

## Architektur

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        HETZNER AX-42 (Debian/Ubuntu)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    DOCKER COMPOSE STACK                               │   │
│  │                                                                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐ │   │
│  │  │  ingestor   │  │   redis     │  │  ranker     │  │ analyzer  │ │   │
│  │  │  (Node.js)  │◄─┤  (Buffer)   │◄─┤  (Python)   │◄─┤  (Python) │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                     EXTERNAL SERVICES                                    │ │
│  │                                                                        │ │
│  │   HELIUS LASERSTREAM (TIER 1)          CHAINSTACK (TIER 2)           │ │
│  │   • 10M Accounts                       • 50 Accounts/Stream           │ │
│  │   • 24h Replay                         • Unlimited Events              │ │
│  │   • Multi-Region Failover               • Jito ShredStream Enabled     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Services

### 1. Ingestor (Node.js/TypeScript)
- Verbindet zu Helius LaserStream und ChainStack Yellowstone
- Dedupliziert Events (30s Window)
- Schreibt zu Redis mit Batch-Processing

### 2. Ranker (Python)
- Berechnet Scoring für jeden Market (0-100)
- Synchronisiert TIER-Zuordnungen alle 30s
- TIER1 (Helius): Top 10 Markets
- TIER2 (Chainstack): Top 30 Markets
- TIER3 (Polling): Alle anderen

### 3. Analyzer (Python)
- Short-Squeeze Detection
- Accumulation Phase Recognition
- Liquidity Risk Assessment
- Alert-Generierung

### 4. Redis
- Event Buffer (48GB maxmemory)
- Market Metrics Storage
- Alert Storage

## Voraussetzungen

### Hardware
- Hetzner AX42 oder ähnlich
- 64GB RAM
- 512GB NVMe SSD (minimum)

### Software
- Docker & Docker Compose
- Redis 7+
- Node.js 20+
- Python 3.11+

## Installation

### 1. Server Setup

```bash
# Server login
ssh root@YOUR_AX42_IP

# Redis installieren (Host-basiert für Performance)
apt update && apt install -y redis-server

# Redis konfigurieren
cat > /etc/redis/redis.conf << 'EOF'
maxmemory 48gb
maxmemory-policy allkeys-lru
save ""
appendonly no
activedefrag yes
lazyfree-lazy-eviction yes
EOF

systemctl restart redis-server
```

### 2. Projekt klonen

```bash
mkdir -p /opt/solana-stream && cd /opt/solana-stream
git init
# (Copy all project files here)
```

### 3. Environment konfigurieren

```bash
cp .env.example .env
nano .env
```

Fülle folgende Variablen:
- `HELIUS_API_KEY`: Dein Helius API Key
- `CHAINSTACK_ENDPOINT`: ChainStack gRPC Endpoint
- `CHAINSTACK_TOKEN`: ChainStack Token

### 4. Docker starten

```bash
docker-compose build
docker-compose up -d

# Logs beobachten
docker-compose logs -f
```

### 5. Health Check

```bash
# Verbindungstests
./scripts/test-connections.sh

# Health Monitoring
./scripts/health-check.sh

# Ingestor Status
curl http://localhost:8080/health
```

## API Endpoints

### Ingestor (Port 8080)

| Endpoint | Methode | Beschreibung |
|----------|---------|--------------|
| `/health` | GET | Health Status |
| `/metrics` | GET | Detaillierte Metrics |

### Analyzer Alerts

```bash
# Alerts Verzeichnis
ls -la /opt/solana-stream/alerts/

# Latest Alert
cat /opt/solana-stream/alerts/latest.json
```

## Konfiguration

### TIER Limits (AX42 optimiert)

| TIER | Provider | Max Accounts | Kosten/Monat |
|------|----------|--------------|--------------|
| TIER1 | Helius | 10 | $499+ |
| TIER2 | Chainstack | 30 | $98 |
| TIER3 | Polling | Unlimited | $0 |

### Signal Thresholds

Edit `config/thresholds.json`:

```json
{
  "signals": {
    "volume_spike_multiplier": 3.0,
    "liquidity_imbalance_threshold": 0.7,
    "bot_probability_max": 0.3,
    "crash_probability_alert": 0.75
  }
}
```

## Troubleshooting

### "Resource Exhausted" von Helius
1. Filter einschränken (weniger Accounts)
2. ZSTD-Kompression prüfen
3. Latenz messen

### Redis OOM
1. `maxmemory` prüfen
2. `redis-cli INFO memory`
3. Eviction Policy: allkeys-lru

### Keine Daten in Redis
1. Health Check: `curl http://localhost:8080/health`
2. Logs: `docker-compose logs ingestor`
3. TIER Assignments: `redis-cli GET tiers:tier1`

## Monitoring

### Prometheus Metrics (optional)

```bash
# Metrics abrufen
curl http://localhost:8080/metrics | jq
```

### Log Analysis

```bash
# Fehler in Logs finden
docker-compose logs | grep ERROR

# Slot-Lag prüfen
docker exec solana-ingestor node -e "
  const http = require('http');
  http.get('http://localhost:8080/health', (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => console.log(data));
  });
"
```

## Kosten

| Komponente | Kosten/Monat |
|------------|--------------|
| Hetzner AX42 | ~€55 |
| Helius Business | $499+ |
| ChainStack Growth | $49 |
| ChainStack gRPC | $49 |
| **Total** | **~$650-1000+** |

## Nächste Schritte

1. **Devnet Testing**: Mit Helius Developer Plan auf Devnet testen
2. **Mainnet Evaluation**: ChainStack deployen
3. **Parameter Tuning**: Thresholds optimieren
4. **Alert Integration**: Telegram/Slack Webhooks

## Support

Bei Fragen oder Problemen:
- GitHub Issues
- Discord: Helius / ChainStack Communities
