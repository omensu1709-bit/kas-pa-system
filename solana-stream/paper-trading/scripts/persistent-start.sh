#!/bin/bash
# KAS PA Persistent Start Script
# Läuft auch nach Cursor-Schließen

LOG_DIR="/data/trinity_apex/solana-stream/paper-trading/logs/24h-test"
mkdir -p "$LOG_DIR"

echo "[$(date)] Persistent Start - Backend + Dashboard"

# Backend starten falls nicht aktiv
if ! ss -tlnp | grep -q 8080; then
  echo "[$(date)] Starting Backend..."
  cd /data/trinity_apex/solana-stream/paper-trading
  nohup stdbuf -oL -eL npx tsx src/live-paper-trading-v4.ts >> "$LOG_DIR/backend-persistent.log" 2>&1 &
else
  echo "[$(date)] Backend already running on 8080"
fi

# Dashboard starten falls nicht aktiv  
if ! ss -tlnp | grep -q 5173; then
  echo "[$(date)] Starting Dashboard..."
  cd /data/trinity_apex/solana-stream/dashboard
  nohup npx serve -s dist -l 5173 -n >> /dev/null 2>&1 &
else
  echo "[$(date)] Dashboard already running on 5173"
fi

echo "[$(date)] Persistent Start Complete"
