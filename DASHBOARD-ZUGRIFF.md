# Dashboard Zugriff - Flexible Optionen

## Schnellstart (Lokaler PC)

### Option 1: Bash Script (Empfohlen)
```bash
cd /data/trinity_apex
./start-dashboard.sh
```
- Startet Dashboard auf `http://localhost:5173`
- Läuft im Hintergrund
- Logs in `/data/trinity_apex/logs/dashboard.log`

### Option 2: Manuell mit npm
```bash
cd /data/trinity_apex/solana-stream/dashboard
npm run dev
```
- Zugriff: `http://localhost:5173`

### Option 3: Produktion (Nginx/Vercel)
```bash
cd /data/trinity_apex/solana-stream/dashboard
npm run build
# Ergebnis in dist/ - deploybar auf любой static host
```

---

## Fernzugriff (anderer PC/Handy im LAN)

### 1. LAN IP herausfinden
```bash
hostname -I | awk '{print $1}'
# z.B. 192.168.1.100
```

### 2. Vite für LAN freigeben
Bearbeite `vite.config.ts`:
```typescript
server: {
  host: '0.0.0.0',  // LAN Zugriff erlauben
  port: 5173,
}
```

### 3. Dann Zugriff von anderem Gerät
```
http://192.168.1.100:5173
```

---

## Fernzugriff (Internet - überall)

### Option A: Cloudflare Tunnel (SOTA - kostenlos)
```bash
# Installation
npm install -g cloudflared

# Tunnel starten
cloudflared tunnel --url http://localhost:5173

# Ausgabe enthält public URL wie:
# https://xxxx.trycloudflare.com
```
→ Zugriff von überall auf der Welt!

### Option B: ngrok (einfach)
```bash
# Installation
npm install -g ngrok

# Start
ngrok http 5173

# Output:
# Forwarding  https://abc123.ngrok.io -> http://localhost:5173
```

### Option C: Tailscale (VPN-artig, sicher)
```bash
# Install tailscale auf Server und Client
curl -fsSL https://tailscale.com/install.sh | sh

# Login und verbinden
tailscale up

# Dann Zugriff über tailnet name:
tailscale serve --bg
# Oder: curl https://your-server.tail123.ts.net:5173
```

---

## Docker Deployment (Server)

### Dockerfile
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY solana-stream/dashboard .
RUN npm install && npm run build
EXPOSE 5173
CMD ["npx", "serve", "dist", "-l", "5173"]
```

### Starten
```bash
docker build -t kas-pa-dashboard .
docker run -d -p 5173:5173 --name kas-pa-dashboard kas-pa-dashboard
```

---

## PM2 (Production Process Manager)

### Installation
```bash
npm install -g pm2
```

### Start
```bash
cd /data/trinity_apex/solana-stream/dashboard
pm2 start npm --name "kas-pa-dashboard" -- start "run dev"
pm2 startup  # Auto-restart nach Reboot
```

### Commands
```bash
pm2 list              # Status
pm2 logs kas-pa-dashboard    # Logs
pm2 restart kas-pa-dashboard # Neustart
pm2 stop kas-pa-dashboard   # Stop
pm2 monit             # Live Monitoring
```

---

## Mobile Zugriff (iOS/Android)

1. **Im gleichen WLAN**: Einfach `http://[SERVER-IP]:5173` öffnen
2. **Unterwegs**: Cloudflare Tunnel oder ngrok nutzen

---

## Architektur Überblick

```
┌─────────────────────────────────────────────────────────┐
│                    DEIN BROWSER                         │
│                  (Beliebiges Gerät)                     │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP/WebSocket
┌─────────────────────▼───────────────────────────────────┐
│                  KAS PA SYSTEM                          │
│                                                         │
│   ┌─────────────────────────────────────────────────┐   │
│   │  Dashboard (React/Vite/Tailwind)                │   │
│   │  Port: 5173                                     │   │
│   │  → Real-time Charts                            │   │
│   │  → Bot Detection                               │   │
│   │  → Performance Metrics                         │   │
│   └─────────────────────────────────────────────────┘   │
│                         ↕ WebSocket                     │
│   ┌─────────────────────────────────────────────────┐   │
│   │  Live Paper Trading (TypeScript)               │   │
│   │  Port: 8080 (WebSocket)                        │   │
│   │  → Crash Prediction                            │   │
│   │  → Bot Detection                               │   │
│   │  → Paper Trading Engine                       │   │
│   └─────────────────────────────────────────────────┘   │
│                         ↕                                │
│   ┌─────────────────────────────────────────────────┐   │
│   │  Datenquellen                                   │   │
│   │  → Chainstack REST                             │   │
│   │  → Jupiter Price API                           │   │
│   │  → Helius (optional)                           │   │
│   └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## WebSocket Verbindung

Das Dashboard verbindet sich automatisch mit dem Paper Trading System:

```typescript
const ws = new WebSocket('ws://localhost:8080');
```

Für Remote-Zugriff muss der Paper Trading Server ebenfalls remote erreichbar sein:

```bash
# Mit cloudflared (WebSocket Support!)
cloudflared tunnel --url ws://localhost:8080

# Oder zweiter tunnel für port 8080
```

---

## Troubleshooting

### Dashboard lädt nicht
```bash
# Prüfe ob Port frei
lsof -i :5173

# Logs ansehen
tail -f /data/trinity_apex/logs/dashboard.log
```

### WebSocket Verbindung fehlgeschlagen
```bash
# Prüfe Paper Trading läuft
curl http://localhost:8080

# Oder prüfe WebSocket
wscat -c ws://localhost:8080
```

### Performance Probleme
```bash
# Production Build nutzen (schneller)
cd /data/trinity_apex/solana-stream/dashboard
npm run build
npx serve dist -l 5173
```
