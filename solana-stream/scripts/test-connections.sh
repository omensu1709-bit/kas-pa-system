#!/bin/bash
# Test Connections Script
# Tests connectivity to Helius and ChainStack endpoints

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo ""
echo "========================================"
echo "     CONNECTION TESTS                  "
echo "========================================"
echo ""

# Test 1: Redis
log_info "Test 1: Redis Connection..."
if redis-cli ping > /dev/null 2>&1; then
    log_info "Redis: OK"
else
    log_error "Redis: FAILED"
fi
echo ""

# Test 2: Helius API Key
log_info "Test 2: Helius API Key..."
if [ -n "$HELIUS_API_KEY" ]; then
    log_info "HELIUS_API_KEY: Set (${HELIUS_API_KEY:0:8}...)"

    # Test Helius API endpoint
    if command -v curl &> /dev/null; then
        response=$(curl -s -o /dev/null -w "%{http_code}" "https://api.helius.xyz/v0/health?api-key=$HELIUS_API_KEY" 2>/dev/null || echo "000")
        if [ "$response" = "200" ]; then
            log_info "Helius API: OK (HTTP $response)"
        else
            log_warn "Helius API: HTTP $response"
        fi
    fi
else
    log_warn "HELIUS_API_KEY: Not set"
fi
echo ""

# Test 3: ChainStack Endpoint
log_info "Test 3: ChainStack Connection..."
if [ -n "$CHAINSTACK_ENDPOINT" ]; then
    log_info "CHAINSTACK_ENDPOINT: Set"

    # Test gRPC connectivity
    if command -v nc &> /dev/null; then
        host=$(echo "$CHAINSTACK_ENDPOINT" | cut -d':' -f1)
        port=$(echo "$CHAINSTACK_ENDPOINT" | cut -d':' -f2 || echo "443")

        if nc -z -w5 "$host" "$port" 2>/dev/null; then
            log_info "ChainStack gRPC port: OPEN"
        else
            log_error "ChainStack gRPC port: CLOSED or BLOCKED"
        fi
    fi
else
    log_warn "CHAINSTACK_ENDPOINT: Not set"
fi
echo ""

# Test 4: Network Latency
log_info "Test 4: Network Latency..."

if command -v ping &> /dev/null; then
    # Helius
    if [ -n "$HELIUS_API_KEY" ]; then
        latency=$(ping -c 3 laserstream-mainnet-ewr.helius-rpc.com 2>/dev/null | tail -1 | awk -F'/' '{print $5}' | cut -d'.' -f1 || echo "FAILED")
        if [ "$latency" != "FAILED" ]; then
            log_info "Helius latency: ${latency}ms"
            if [ "$latency" -gt 100 ]; then
                log_warn "Latency > 100ms: ZSTD compression recommended"
            fi
        else
            log_error "Helius: Cannot reach endpoint"
        fi
    fi
fi
echo ""

# Test 5: Docker
log_info "Test 5: Docker..."
if command -v docker &> /dev/null; then
    log_info "Docker: Available"

    if docker ps &> /dev/null; then
        log_info "Docker daemon: Running"
    else
        log_error "Docker daemon: Not accessible"
    fi
else
    log_error "Docker: Not installed"
fi
echo ""

# Test 6: Project Files
log_info "Test 6: Project Files..."
files=(
    "/opt/solana-stream/docker-compose.yml"
    "/opt/solana-stream/ingestor/Dockerfile"
    "/opt/solana-stream/ranker/Dockerfile"
    "/opt/solana-stream/analyzer/Dockerfile"
)

all_present=true
for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        log_info "  $(basename $file): OK"
    else
        log_warn "  $(basename $file): MISSING"
        all_present=false
    fi
done
echo ""

echo "========================================"
echo "          TEST SUMMARY                 "
echo "========================================"
echo ""
echo "Run './scripts/health-check.sh' for detailed health monitoring"
echo "Run 'docker-compose up -d' to start all services"
echo ""
