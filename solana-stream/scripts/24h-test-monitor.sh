#!/bin/bash
# KAS PA 24h Test Monitor
# Startet Backend wenn es abstuerzt

LOG_FILE="/data/trinity_apex/solana-stream/paper-trading/logs/24h-test/backend-fixed.log"
PID_FILE="/tmp/kaspa_backend.pid"
MAX_RESTARTS=100
RESTART_COUNT=0

echo "=== KAS PA 24H TEST MONITOR ==="
echo "Start: $(date)"
echo "Log: $LOG_FILE"
echo ""

while [ $RESTART_COUNT -lt $MAX_RESTARTS ]; do
    # Check if backend is running
    if pgrep -f "tsx src/live-paper-trading-v4.ts" > /dev/null 2>&1; then
        if [ $((RESTART_COUNT % 60)) -eq 0 ]; then
            echo "[$(date '+%H:%M:%S')] Backend laeuft (Restart #$RESTART_COUNT)"
        fi
        sleep 60
    else
        RESTART_COUNT=$((RESTART_COUNT + 1))
        echo "[$(date '+%H:%M:%S')] Backend gestoppt! Neustart #$RESTART_COUNT..."
        
        cd /data/trinity_apex/solana-stream/paper-trading
        rm -f $LOG_FILE
        nohup stdbuf -oL -eL npx tsx src/live-paper-trading-v4.ts > $LOG_FILE 2>&1 &
        echo $! > $PID_FILE
        
        sleep 10
        
        if pgrep -f "tsx src/live-paper-trading-v4.ts" > /dev/null 2>&1; then
            echo "[$(date '+%H:%M:%S')] Neustart erfolgreich!"
        else
            echo "[$(date '+%H:%M:%S')] Neustart fehlgeschlagen!"
        fi
    fi
done

echo "=== MONITOR BEENDET ==="
echo "Grund: Max Restarts ($MAX_RESTARTS) erreicht oder manuell gestoppt"
