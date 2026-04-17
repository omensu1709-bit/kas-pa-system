#!/bin/bash
# ============================================================================
# KAS PA - 24H PRODUCTION TEST STARTER
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================================"
echo "  KAS PA - 24 STUNDEN PRODUCTION TEST"
echo "============================================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo -e "${RED}ERROR: Node.js is not installed${NC}"
    exit 1
fi

# Check if ts-node is available
if ! command -v npx &> /dev/null; then
    echo -e "${RED}ERROR: npx is not available${NC}"
    exit 1
fi

echo -e "${GREEN}[1/4]${NC} Checking system readiness..."
npx ts-node scripts/system-ready-check.ts
RESULT=$?

if [ $RESULT -ne 0 ]; then
    echo ""
    echo -e "${RED}============================================================"
    echo -e "  SYSTEM NOT READY"
    echo -e "============================================================${NC}"
    echo ""
    echo "Please ensure:"
    echo "  1. Backend is running: npx ts-node paper-trading/src/live-paper-trading.ts"
    echo "  2. Dashboard is running: cd dashboard && npm run dev"
    echo ""
    exit 1
fi

echo ""
echo -e "${GREEN}[2/4]${NC} Starting backend (if not already running)..."
echo "Press Ctrl+C to stop the test"
echo ""

# Create logs directory
mkdir -p logs/24h-test/{data,reports}

# Trap Ctrl+C
cleanup() {
    echo ""
    echo -e "${YELLOW}============================================================"
    echo -e "  SHUTDOWN REQUESTED"
    echo -e "============================================================${NC}"
    echo "Stopping test..."
    pkill -f "24h-production-test" 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT

echo -e "${GREEN}[3/4]${NC} Starting 24-hour production test..."
echo ""

# Run the 24h test
npx ts-node scripts/24h-production-test.ts

echo ""
echo -e "${GREEN}============================================================"
echo -e "  TEST COMPLETED"
echo -e "============================================================${NC}"
echo ""
echo "Results saved to:"
echo "  logs/24h-test/"
echo ""
