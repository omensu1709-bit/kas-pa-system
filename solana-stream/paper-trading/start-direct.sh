#!/bin/bash
cd /data/trinity_apex/solana-stream/paper-trading
echo "[$(date -Iseconds)] START DIRECT" > logs/24h-test/backend.log
npx tsx src/live-paper-trading-v4.ts >> logs/24h-test/backend.log 2>&1