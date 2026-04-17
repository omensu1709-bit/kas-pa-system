#!/bin/bash
# ============================================================================
# KAS PA - 24H SUPERVISOR (Auto-Restart)
# ============================================================================

set -e

PAPER_TRADING_DIR="/data/trinity_apex/solana-stream/paper-trading"
LOGS_DIR="$PAPER_TRADING_DIR/logs/24h-supervisor"
TSX_BIN="/data/trinity_apex/node_modules/.bin/tsx"
mkdir -p "$LOGS_DIR"

MAX_RESTARTS=10
RESTART_WINDOW=3600
CHECK_INTERVAL=30

# PID files
BACKEND_PID_FILE="$LOGS_DIR/backend.pid"
TEST_PID_FILE="$LOGS_DIR/test24.pid"
WATCHDOG_PID_FILE="$LOGS_DIR/watchdog.pid"

# Restart tracking
declare -A restart_times

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOGS_DIR/supervisor.log"; }
alert() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ALERT: $1" | tee -a "$LOGS_DIR/alerts.log"; }

is_running() { kill -0 "$1" 2>/dev/null; }
get_pid() { [ -f "$1" ] && cat "$1" || echo ""; }
save_pid() { echo "$2" > "$1"; }

start_backend() {
    log "Starting backend V4..."
    pkill -f "live-paper-trading" 2>/dev/null || true
    sleep 2
    cd "$PAPER_TRADING_DIR"
    nohup "$TSX_BIN" src/live-paper-trading-v4.ts >> "$LOGS_DIR/backend.log" 2>&1 &
    local pid=$!
    save_pid "$BACKEND_PID_FILE" $pid
    sleep 5
    if is_running $pid; then
        log "Backend V4 started (PID: $pid)"
        return 0
    fi
    log "ERROR: Backend V4 failed to start"
    return 1
}

start_test() {
    log "Starting 24h test..."
    pkill -f "24h-production-test" 2>/dev/null || true
    sleep 2
    cd "$PAPER_TRADING_DIR"
    nohup "$TSX_BIN" ../scripts/24h-production-test.ts >> "$LOGS_DIR/test24.log" 2>&1 &
    local pid=$!
    save_pid "$TEST_PID_FILE" $pid
    sleep 5
    if is_running $pid; then
        log "24h Test started (PID: $pid)"
        return 0
    fi
    log "ERROR: 24h Test failed to start"
    return 1
}

start_watchdog() {
    log "Starting watchdog..."
    pkill -f "24h-watchdog" 2>/dev/null || true
    sleep 2
    cd "$PAPER_TRADING_DIR"
    nohup "$TSX_BIN" ../scripts/24h-watchdog.ts >> "$LOGS_DIR/watchdog.log" 2>&1 &
    local pid=$!
    save_pid "$WATCHDOG_PID_FILE" $pid
    sleep 5
    if is_running $pid; then
        log "Watchdog started (PID: $pid)"
        return 0
    fi
    log "ERROR: Watchdog failed to start"
    return 1
}

should_restart() {
    local name=$1
    local now=$(date +%s)
    local key="${name}_times"
    local times="${restart_times[$key]}"
    local recent=0
    for t in $times; do
        if [ $((now - t)) -lt $RESTART_WINDOW ]; then
            ((recent++))
        fi
    done
    if [ $recent -ge $MAX_RESTARTS ]; then
        log "ERROR: $name exceeded max restarts ($recent in 1h)"
        alert "CRITICAL: $name max restarts reached!"
        return 1
    fi
    return 0
}

record_restart() {
    local name=$1
    local key="${name}_times"
    restart_times[$key]="$(date +%s) ${restart_times[$key]}"
}

restart_process() {
    local name=$1
    local start_fn=$2
    log "Restarting $name..."
    pkill -f "$name" 2>/dev/null || true
    sleep 2
    if $start_fn; then
        record_restart $name
        log "SUCCESS: $name restarted"
        return 0
    fi
    alert "FAILED: $name restart failed"
    return 1
}

monitor() {
    while true; do
        local ts=$(date '+%Y-%m-%d %H:%M:%S')

        # Check Backend
        local bp=$(get_pid "$BACKEND_PID_FILE")
        if ! is_running $bp; then
            log "[$ts] Backend DOWN (PID: $bp)"
            restart_process "live-paper" start_backend
        fi

        # Check Test
        local tp=$(get_pid "$TEST_PID_FILE")
        if ! is_running $tp; then
            log "[$ts] 24h Test DOWN (PID: $tp)"
            restart_process "24h-production" start_test
        fi

        # Check Watchdog
        local wp=$(get_pid "$WATCHDOG_PID_FILE")
        if ! is_running $wp; then
            log "[$ts] Watchdog DOWN (PID: $wp)"
            restart_process "watchdog" start_watchdog
        fi

        # Hourly status report
        if [ $(date +%M) -eq 0 ] && [ $(date +%S) -lt 60 ]; then
            log "=== STATUS $(date) ==="
            log "  Backend:  $(is_running $bp && echo 'RUNNING' || echo 'DOWN') (PID: $bp)"
            log "  24h Test: $(is_running $tp && echo 'RUNNING' || echo 'DOWN') (PID: $tp)"
            log "  Watchdog: $(is_running $wp && echo 'RUNNING' || echo 'DOWN') (PID: $wp)"
            log "========================"
        fi

        sleep $CHECK_INTERVAL
    done
}

cleanup() {
    log "SHUTDOWN - stopping all processes..."
    pkill -f "live-paper" 2>/dev/null || true
    pkill -f "24h-production" 2>/dev/null || true
    pkill -f "24h-watchdog" 2>/dev/null || true
    log "Cleanup complete"
    exit 0
}

trap cleanup SIGINT SIGTERM

main() {
    log "============================================================"
    log "  KAS PA - 24H SUPERVISOR"
    log "============================================================"
    log "Started: $(date)"
    log "Max restarts/hour: $MAX_RESTARTS"
    log "Check interval: ${CHECK_INTERVAL}s"
    log "Logs: $LOGS_DIR"
    log "============================================================"

    start_backend && sleep 3
    start_test && sleep 3
    start_watchdog

    monitor
}

main "$@"
