#!/bin/bash
# =====================================================
# KAS PA Dashboard Launcher
# Maximal flexibel - Läuft im Hintergrund mit Tailwind UI
# =====================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASHBOARD_DIR="$SCRIPT_DIR/solana-stream/dashboard"
LOG_FILE="$SCRIPT_DIR/logs/dashboard.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARNING:${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%H:%M:%S')] ERROR:${NC} $1"
}

# Create logs directory
mkdir -p "$SCRIPT_DIR/logs"

# Check if already running
if pgrep -f "kas-pa-dashboard" > /dev/null 2>&1; then
    warn "Dashboard läuft bereits!"
    echo "   PID: $(pgrep -f 'kas-pa-dashboard' | head -1)"
    exit 0
fi

# Check if port 5173 is in use
if lsof -i :5173 > /dev/null 2>&1; then
    warn "Port 5173 wird bereits verwendet. Prüfe Prozess..."
    lsof -i :5173 | head -3
    read -p "Port freigeben und neu starten? [j/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Jj]$ ]]; then
        exit 0
    fi
    pkill -f "vite" || true
    sleep 1
fi

# Check dependencies
if [ ! -d "$DASHBOARD_DIR/node_modules" ]; then
    log "Installiere Dependencies..."
    cd "$DASHBOARD_DIR" && npm install
fi

# Start dashboard in background
log "Starte Dashboard auf http://localhost:5173"
log "Dashboard Log: $LOG_FILE"

cd "$DASHBOARD_DIR"
nohup npm run dev > "$LOG_FILE" 2>&1 &
DASHBOARD_PID=$!

echo $DASHBOARD_PID > "$SCRIPT_DIR/pids/kas-pa-dashboard.pid"

sleep 3

# Check if started
if ps -p $DASHBOARD_PID > /dev/null 2>&1; then
    echo ""
    log "✅ Dashboard läuft erfolgreich!"
    echo ""
    echo "   URLs:"
    echo "   • Dashboard:    http://localhost:5173"
    echo "   • WebSocket:    ws://localhost:8080"
    echo ""
    echo "   PIDs:"
    echo "   • Dashboard:   $DASHBOARD_PID"
    echo "   • Paper Trading: $(cat $SCRIPT_DIR/pids/kas-pa-paper.pid 2>/dev/null || echo 'nicht gestartet')"
    echo ""
    echo "   Commands:"
    echo "   • Status:      ./status.sh"
    echo "   • Stop:        ./stop-dashboard.sh"
    echo "   • Logs:        tail -f $LOG_FILE"
    echo ""
else
    error "Dashboard konnte nicht gestartet werden!"
    error "Letzte Logs:"
    tail -20 "$LOG_FILE"
    exit 1
fi
