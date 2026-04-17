#!/bin/bash
# 24H TEST MONITOR - Läuft im Hintergrund
# Schickt Benachrichtigungen wenn Prozesse stoppen

LOG_DIR="/data/trinity_apex/solana-stream/paper-trading/logs/24h-test"
ALERT_EMAIL="your@email.com"  # Optional

while true; do
    # Prüfe Backend
    if ! pgrep -f "tsx.*live-paper" > /dev/null; then
        echo "[$(date)] CRITICAL: Backend gestoppt! Neustart..." >> "$LOG_DIR/monitor-alert.log"
        cd /data/trinity_apex/solana-stream/paper-trading
        nohup stdbuf -oL -eL npx tsx src/live-paper-trading-v4.ts >> "$LOG_DIR/backend-recovery.log" 2>&1 &
    fi
    
    # Prüfe Dashboard
    if ! pgrep -f "serve.*5173" > /dev/null; then
        echo "[$(date)] CRITICAL: Dashboard gestoppt! Neustart..." >> "$LOG_DIR/monitor-alert.log"
        cd /data/trinity_apex/solana-stream/dashboard
        nohup npx serve -s dist -l 5173 -n >> /dev/null 2>&1 &
    fi
    
    # Log Statistik alle 5min
    CYCLES=$(wc -l < "$LOG_DIR/cycles.jsonl" 2>/dev/null || echo 0)
    SIGNALS=$(wc -l < "$LOG_DIR/signals.jsonl" 2>/dev/null || echo 0)
    TRADES=$(wc -l < "$LOG_DIR/trades.jsonl" 2>/dev/null || echo 0)
    
    if [ $(( $(date +%M) % 5 == 0 )) ]; then
        echo "[$(date)] Cycles: $CYCLES | Signals: $SIGNALS | Trades: $TRADES" >> "$LOG_DIR/monitor-stats.log"
    fi
    
    sleep 30
done
