#!/bin/bash
# ============================================================================
# KAS PA - META WATCHDOG (Supervisor Supervisor)
# ============================================================================
# Dieser Script wird per Cron alle 5 Minuten ausgeführt
# Er stellt sicher, dass der 24h-Supervisor läuft

SUPERVISOR_SCRIPT="/data/trinity_apex/solana-stream/scripts/24h-supervisor.sh"
SUPERVISOR_NAME="24h-supervisor.sh"
LOG_FILE="/tmp/meta-watchdog.log"

# Prüfe ob Supervisor läuft
if pgrep -f "$SUPERVISOR_NAME" > /dev/null; then
    echo "[$(date)] OK - Supervisor running" >> "$LOG_FILE"
    exit 0
else
    echo "[$(date)] ALERT - Supervisor not running! Restarting..." >> "$LOG_FILE"

    # Starte Supervisor neu
    cd /data/trinity_apex/solana-stream/paper-trading
    nohup bash "$SUPERVISOR_SCRIPT" > /tmp/supervisor.log 2>&1 &

    echo "[$(date)] Supervisor restarted" >> "$LOG_FILE"
    exit 0
fi
