#!/bin/bash
# =============================================================================
# KAS PA v4.2 - 24h Test Supervisor
# Stellt sicher dass System 24h laeuft
# =============================================================================

LOG_DIR="/data/trinity_apex/solana-stream/paper-trading/logs/24h-test"
mkdir -p "$LOG_DIR"

BACKEND_LOG="$LOG_DIR/backend.log"
UNIFIED_LOG="$LOG_DIR/unified.log"
STATUS_FILE="$LOG_DIR/status.json"

MAX_RUNTIME=86400  # 24 hours in seconds
START_TIME=$(date +%s)
END_TIME=$((START_TIME + MAX_RUNTIME))

# Farben
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

check_backend() {
    curl -s http://localhost:3000/latest > /dev/null 2>&1
    return $?
}

check_unified() {
    curl -s http://localhost:3000/health > /dev/null 2>&1
    return $?
}

start_backend() {
    log "${GREEN}Starte Backend...${NC}"
    cd /data/trinity_apex/solana-stream/paper-trading
    nohup stdbuf -oL -eL npx tsx src/live-paper-trading-v4.ts >> "$BACKEND_LOG" 2>&1 &
    BACKEND_PID=$!
    echo "BACKEND_PID=$BACKEND_PID" > "$STATUS_FILE"
    log "Backend gestartet mit PID: $BACKEND_PID"
    sleep 5
}

start_unified() {
    log "${GREEN}Starte Unified Status Server...${NC}"
    cd /data/trinity_apex/solana-stream/paper-trading
    nohup stdbuf -oL -eL npx tsx src/unified-status-server.ts >> "$UNIFIED_LOG" 2>&1 &
    UNIFIED_PID=$!
    echo "UNIFIED_PID=$UNIFIED_PID" >> "$STATUS_FILE"
    log "Unified gestartet mit PID: $UNIFIED_PID"
    sleep 3
}

stop_all() {
    log "${YELLOW}Stoppe alle Prozesse...${NC}"
    pkill -f "tsx src/live-paper-trading-v4" 2>/dev/null
    pkill -f "tsx src/unified-status-server" 2>/dev/null
    sleep 2
}

update_status() {
    local elapsed=$(($(date +%s) - START_TIME))
    local hours=$((elapsed / 3600))
    local mins=$(((elapsed % 3600) / 60))
    local secs=$((elapsed % 60))
    local runtime_str=$(printf "%02d:%02d:%02d" $hours $mins $secs)

    # Hole aktuelle Daten
    local data=$(curl -s http://localhost:3000/latest 2>/dev/null)
    if [ -n "$data" ]; then
        local uptime=$(echo "$data" | python3 -c "import sys,json; d=json.load(sys.stdin); print(int(d.get('backendHealth',{}).get('uptimeSeconds',0)//60))" 2>/dev/null || echo "?")
        local cycles=$(echo "$data" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('backendHealth',{}).get('cycleNumber','?'))" 2>/dev/null || echo "?")
        local crash=$(echo "$data" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"{(d.get('latestPrediction',{}).get('crashProbability',0)*100):.1f}\")" 2>/dev/null || echo "?")
        local zone=$(echo "$data" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('latestPrediction',{}).get('zone','?'))" 2>/dev/null || echo "?")
        local capital=$(echo "$data" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"{d.get('performance',{}).get('currentCapital',0):.2f}\")" 2>/dev/null || echo "?")
        local pos=$(echo "$data" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('performance',{}).get('openPositions',0))" 2>/dev/null || echo "?")
        local prop=$(echo "$data" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"{d.get('telemetry',{}).get('propagationTimeMs',0):.1f}\")" 2>/dev/null || echo "?")

        echo ""
        echo "╔════════════════════════════════════════════════════════════════════╗"
        echo "║           KAS PA v4.2 - 24h TEST SUPERVISOR                      ║"
        echo "╠════════════════════════════════════════════════════════════════════╣"
        echo "║ Runtime: $runtime_str / 24:00:00                                      ║"
        echo "╠════════════════════════════════════════════════════════════════════╣"
        echo "║ Backend Status                                                      ║"
        echo "║   Uptime: ${uptime}min | Cycles: ${cycles} | Propagation: ${prop}ms              ║"
        echo "║   CrashProb: ${crash}% | Zone: ${zone}                               ║"
        echo "║   Capital: ${capital} SOL | Positions: ${pos}                            ║"
        echo "╚════════════════════════════════════════════════════════════════════╝"
    else
        echo ""
        echo "╔════════════════════════════════════════════════════════════════════╗"
        echo "║           KAS PA v4.2 - 24h TEST SUPERVISOR                      ║"
        echo "╠════════════════════════════════════════════════════════════════════╣"
        echo "║ Runtime: $runtime_str / 24:00:00                                      ║"
        echo "╠════════════════════════════════════════════════════════════════════╣"
        echo "║ ${RED}SYSTEM OFFLINE - Starte neu...${NC}                                   ║"
        echo "╚════════════════════════════════════════════════════════════════════╝"
    fi
}

# Stoppe alle vorhandenen Prozesse
stop_all

log "=========================================="
log "KAS PA v4.2 - 24h TEST GESTARTET"
log "=========================================="
log "Startzeit: $(date)"
log "Endzeit: $(date -d @$END_TIME)"
log "=========================================="

# Starte System
start_backend
start_unified

# Warte 10 Sekunden und prüfe ob alles läuft
sleep 10

if ! check_backend || ! check_unified; then
    log "${RED}FEHLER: System start fehlgeschlagen${NC}"
    stop_all
    exit 1
fi

log "${GREEN}System erfolgreich gestartet${NC}"

# Hauptloop
RESTART_COUNT=0
while [ $(date +%s) -lt $END_TIME ]; do
    update_status

    # Prüfe Backend
    if ! check_backend; then
        log "${YELLOW}Backend nicht erreichbar - Neustart...${NC}"
        stop_all
        sleep 3
        start_backend
        start_unified
        RESTART_COUNT=$((RESTART_COUNT + 1))
        log "Restart #${RESTART_COUNT}"
    fi

    # Prüfe Unified Server
    if ! check_unified; then
        log "${YELLOW}Unified Server nicht erreichbar - Neustart...${NC}"
        pkill -f "tsx src/unified-status-server" 2>/dev/null
        sleep 3
        start_unified
        RESTART_COUNT=$((RESTART_COUNT + 1))
        log "Restart #${RESTART_COUNT}"
    fi

    sleep 30
done

# 24h erreicht
log ""
log "=========================================="
log "24h TEST ABGESCHLOSSEN!"
log "=========================================="
log "Restarts: $RESTART_COUNT"
log "Final Status:"
curl -s http://localhost:3000/latest | python3 -m json.tool 2>/dev/null | head -20

stop_all
log "System gestoppt"

exit 0