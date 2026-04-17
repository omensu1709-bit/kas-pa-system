#!/bin/bash
cd /data/trinity_apex/solana-stream/paper-trading

# Kill old processes
pkill -9 -f 'live-paper-trading-v4' 2>/dev/null
fuser -k 8080/tcp 2>/dev/null

sleep 3

# Start backend
nohup npx tsx src/live-paper-trading-v4.ts >> logs/24h-test/backend.log 2>&1 &

echo "Backend started. PID: $!"
sleep 5

# Check status
ps aux | grep 'live-paper-trading-v4' | grep -v grep | head -2
ss -tlnp | grep 8080
