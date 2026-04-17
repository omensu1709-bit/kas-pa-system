#!/bin/bash
# Emergency Recovery Script
# Führt alle notwendigen Schritte aus um System neu zu starten

LOG_DIR="/data/trinity_apex/solana-stream/paper-trading/logs/24h-test"
mkdir -p "$LOG_DIR"

echo "[$(date)] EMERGENCY RECOVERY START" >> "$LOG_DIR/emergency.log"

# Backend
cd /data/trinity_apex/solana-stream/paper-trading
pkill -f "tsx.*live-paper" 2>/dev/null
fuser -k 8080/tcp 2>/dev/null
sleep 2
nohup stdbuf -oL -eL npx tsx src/live-paper-trading-v4.ts >> "$LOG_DIR/backend-emergency.log" 2>&1 &
echo "[$(date)] Backend gestartet PID: $!" >> "$LOG_DIR/emergency.log"

# Dashboard
cd /data/trinity_apex/solana-stream/dashboard
pkill -f "serve.*5173" 2>/dev/null
fuser -k 5173/tcp 2>/dev/null
sleep 2
nohup npx serve -s dist -l 5173 -n >> /dev/null 2>&1 &
echo "[$(date)] Dashboard gestartet" >> "$LOG_DIR/emergency.log"

echo "[$(date)] EMERGENCY RECOVERY COMPLETE" >> "$LOG_DIR/emergency.log"
