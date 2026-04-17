#!/bin/bash
# =============================================================================
# KAS PA v4.2 - Quick Start Script
# Startet Backend + Unified Status Server
# =============================================================================

cd /data/trinity_apex/solana-stream/paper-trading

# Ports pruefen
echo "[KAS PA] Pruefe Ports..."
ss -tlnp | grep -E "8080|3000" && echo "[WARN] Ports bereits in Verwendung!" && exit 1

# Backend starten
echo "[KAS PA] Starte Backend (Port 8080)..."
nohup npx tsx src/live-paper-trading-v4.ts > logs/kaspa-backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

sleep 3

# Unified Status Server starten
echo "[KAS PA] Starte Unified Status Server (Port 3000)..."
nohup npx tsx src/unified-status-server.ts > logs/kaspa-unified.log 2>&1 &
UNIFIED_PID=$!
echo "Unified PID: $UNIFIED_PID"

sleep 2

# Status pruefen
echo ""
echo "[KAS PA] Status Check:"
curl -s http://localhost:3000/health | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Backend: {d.get(\"backend\",\"?\")} | Unified: {d.get(\"unified\",\"?\")}')" 2>/dev/null || echo "Health Check fehlgeschlagen"

echo ""
echo "[KAS PA] URLs:"
echo "  Backend WS:  ws://localhost:8080"
echo "  Dashboard:   http://localhost:3000/simple"
echo "  Prometheus:  http://localhost:3000/metrics"
echo ""
echo "[KAS PA] Logs:"
echo "  Backend:  tail -f /data/trinity_apex/solana-stream/paper-trading/logs/kaspa-backend.log"
echo "  Unified:  tail -f /data/trinity_apex/solana-stream/paper-trading/logs/kaspa-unified.log"