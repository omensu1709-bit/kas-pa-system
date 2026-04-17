#!/bin/bash
# Solana Stream Health Check Script
# Usage: ./health-check.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
REDIS_HOST=${REDIS_HOST:-localhost}
REDIS_PORT=${REDIS_PORT:-6379}
HELIUS_API_KEY=${HELIUS_API_KEY:-}
CHAINSTACK_ENDPOINT=${CHAINSTACK_ENDPOINT:-}

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_redis() {
    log_info "Checking Redis..."
    if command -v redis-cli &> /dev/null; then
        if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping | grep -q PONG; then
            log_info "Redis: OK"

            # Get memory info
            redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" INFO memory | grep -E "used_memory_human|max_memory" | while read line; do
                echo "  Redis $line"
            done
            return 0
        else
            log_error "Redis: FAILED"
            return 1
        fi
    else
        log_warn "redis-cli not found, skipping Redis check"
        return 0
    fi
}

check_docker() {
    log_info "Checking Docker containers..."

    containers=("solana-redis" "solana-ingestor" "solana-ranker" "solana-analyzer")

    for container in "${containers[@]}"; do
        if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
            status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "no-healthcheck")
            if [ "$status" = "healthy" ] || [ "$status" = "no-healthcheck" ]; then
                log_info "  $container: RUNNING ($status)"
            else
                log_warn "  $container: $status"
            fi
        else
            log_error "  $container: NOT RUNNING"
        fi
    done
}

check_network_latency() {
    log_info "Checking network latency..."

    # Helius endpoint
    if [ -n "$HELIUS_API_KEY" ]; then
        ping_result=$(ping -c 3 laserstream-mainnet-ewr.helius-rpc.com 2>/dev/null | tail -1 | awk '{print $4}' | cut -d'/' -f2)
        if [ -n "$ping_result" ]; then
            log_info "  Helius latency: ${ping_result}ms"
        else
            log_warn "  Helius: Could not measure latency"
        fi
    fi

    # Chainstack endpoint
    if [ -n "$CHAINSTACK_ENDPOINT" ]; then
        ping_result=$(ping -c 3 "$CHAINSTACK_ENDPOINT" 2>/dev/null | tail -1 | awk '{print $4}' | cut -d'/' -f2)
        if [ -n "$ping_result" ]; then
            log_info "  Chainstack latency: ${ping_result}ms"
        else
            log_warn "  Chainstack: Could not measure latency"
        fi
    fi
}

check_slot_sync() {
    log_info "Checking slot synchronization..."

    # Query ingestor health endpoint
    if command -v curl &> /dev/null; then
        health_json=$(curl -s http://localhost:8080/health 2>/dev/null || echo "{}")

        helius_slot=$(echo "$health_json" | grep -o '"lastSlot":[0-9]*' | head -1 | cut -d':' -f2)
        chainstack_slot=$(echo "$health_json" | grep -o '"lastSlot":[0-9]*' | tail -1 | cut -d':' -f2)

        if [ -n "$helius_slot" ]; then
            log_info "  Helius slot: $helius_slot"
        fi
        if [ -n "$chainstack_slot" ]; then
            log_info "  Chainstack slot: $chainstack_slot"
        fi

        # Check slot lag
        if [ -n "$helius_slot" ] && [ -n "$chainstack_slot" ]; then
            slot_diff=$((helius_slot - chainstack_slot))
            if [ ${slot_diff#-} -gt 5 ]; then
                log_warn "  Slot lag detected: $slot_diff slots"
            else
                log_info "  Slot sync: OK (diff: $slot_diff)"
            fi
        fi
    else
        log_warn "curl not found, skipping health endpoint check"
    fi
}

check_bandwidth() {
    log_info "Checking bandwidth..."

    # Check network interface stats
    if [ -f /proc/net/dev ]; then
        echo "  Network stats (eth0):"
        grep eth0 /proc/net/dev | awk '{print "    Received: " $2 " bytes, Sent: " $10 " bytes"}'
    fi

    # Docker network stats
    if command -v docker &> /dev/null; then
        docker stats --no-stream --format "table {{.Name}}\t{{.NetInput}}\t{{.NetOutput}}" 2>/dev/null | grep solana || true
    fi
}

check_logs() {
    log_info "Checking recent errors..."

    if command -v docker &> /dev/null; then
        # Check ingestor logs for errors
        error_count=$(docker logs solana-ingestor --tail 100 2>&1 | grep -i "error" | wc -l || echo "0")
        if [ "$error_count" -gt 0 ]; then
            log_warn "  Ingestor errors in last 100 lines: $error_count"
        else
            log_info "  Ingestor: No recent errors"
        fi
    fi
}

print_summary() {
    echo ""
    echo "========================================"
    echo "          HEALTH CHECK SUMMARY          "
    echo "========================================"
    echo ""
    echo "Time: $(date)"
    echo ""

    # Overall status
    if [ $# -eq 0 ]; then
        log_info "All checks completed"
    fi
}

# Main execution
main() {
    echo ""
    echo "========================================"
    echo "     SOLANA STREAM HEALTH CHECK         "
    echo "========================================"
    echo ""

    check_redis
    echo ""

    if command -v docker &> /dev/null; then
        check_docker
        echo ""
    fi

    check_network_latency
    echo ""

    check_slot_sync
    echo ""

    check_bandwidth
    echo ""

    check_logs
    echo ""

    print_summary
}

# Run
main "$@"
