#!/bin/bash
cd /data/trinity_apex/solana-stream/paper-trading
rm -f logs/24h-test/data/*.csv
exec node /data/trinity_apex/node_modules/.bin/tsx ../scripts/24h-production-test.ts
