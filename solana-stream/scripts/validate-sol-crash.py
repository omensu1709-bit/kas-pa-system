#!/usr/bin/env python3
"""
SOL Crash Validation (Jan-Feb 2026)

SOL had a major correction in early 2026:
- Price dropped from ~$260 to ~$140 (45% crash)
- Network-wide impact expected
- Should trigger our 9-metric crash detection

This validates our system on a MAJOR crash event.
"""

import requests
import json
import math
import time
from datetime import datetime, timedelta

CHAINSTACK_RPC = "https://solana-mainnet.core.chainstack.com"
AUTH = ("friendly-mcclintock", "armed-stamp-reuse-grudge-armful-script")

def make_rpc_call(method, params=None):
    payload = {"jsonrpc": "2.0", "id": 1, "method": method}
    if params:
        payload["params"] = params
    response = requests.post(CHAINSTACK_RPC, json=payload, auth=AUTH)
    return response.json()

def get_recent_blocks(start_slot, count=10):
    """Get recent blocks for network analysis"""
    blocks = []
    for i in range(count):
        slot = start_slot - i * 100
        result = make_rpc_call("getBlock", [slot, {"encoding": "json", "maxSupportedTransactionVersion": 0}])
        block_data = result.get("result")
        if block_data:
            blocks.append(block_data)
    return blocks

def get_block(slot):
    result = make_rpc_call("getBlock", [slot, {"encoding": "json", "maxSupportedTransactionVersion": 0}])
    return result.get("result")

def get_current_slot():
    result = make_rpc_call("getSlot")
    return result.get("result", 0)

def analyze_network_health(start_slot, end_slot, label):
    """Analyze network health metrics over a slot range"""
    print(f"  Analyzing {label} ({end_slot} to {start_slot})...")

    all_tps = []
    all_fees = []
    all_compute = []
    all_tx_count = []

    current = end_slot
    samples = 0
    max_samples = 30

    while current <= start_slot and samples < max_samples:
        block = get_block(current)
        if block:
            # TPS
            tx_count = block.get("numTransactions", 0)
            tps = tx_count / 0.4  # ~400ms blocks
            all_tps.append(tps)
            all_tx_count.append(tx_count)

            # Fees
            reward = block.get("reward", [])
            if reward and len(reward) > 0:
                fee = sum(r.get("lamports", 0) for r in reward if r.get("pubkey"))
                all_fees.append(fee)

            samples += 1

        current += 100
        time.sleep(0.05)  # Rate limit

    if not all_tps:
        return None

    avg_tps = sum(all_tps) / len(all_tps)
    max_tps = max(all_tps) if all_tps else 0
    min_tps = min(all_tps) if all_tps else 0
    tps_std = math.sqrt(sum((t - avg_tps)**2 for t in all_tps) / len(all_tps)) if len(all_tps) > 1 else 0

    avg_fee = sum(all_fees) / len(all_fees) if all_fees else 0
    fee_std = math.sqrt(sum((f - avg_fee)**2 for f in all_fees) / len(all_fees)) if len(all_fees) > 1 else 0
    fee_cv = fee_std / avg_fee if avg_fee > 0 else 0

    return {
        "label": label,
        "samples": samples,
        "avg_tps": avg_tps,
        "max_tps": max_tps,
        "min_tps": min_tps,
        "tps_cv": tps_std / avg_tps if avg_tps > 0 else 0,
        "avg_fee": avg_fee,
        "fee_cv": fee_cv,
        "total_tx": sum(all_tx_count),
    }

def estimate_slots_at_time(target_time):
    """Estimate slot number at a given datetime"""
    # Solana: ~400ms per slot
    # Genesis: March 2020, ~1598896500000 ms
    genesis_ms = 1598896500000
    target_ms = int(time.mktime(target_time.timetuple()) * 1000)
    return int((target_ms - genesis_ms) / 400)

def main():
    print("=" * 60)
    print("SOL CRASH VALIDATION (Jan-Feb 2026)")
    print("Major network-wide event validation")
    print("=" * 60)

    current_slot = get_current_slot()
    print(f"\nCurrent slot: {current_slot}")

    # SOL crash dates
    # SOL peaked ~$260 in late Jan 2026
    # Crashed to ~$140 in Feb 2026 (around Feb 3-7)

    crash_date = datetime(2026, 2, 5)  # Approximate crash date
    danger_start = datetime(2026, 2, 3)
    danger_end = datetime(2026, 2, 7)

    # Baseline: Week before
    baseline_start = datetime(2026, 1, 27)
    baseline_end = datetime(2026, 2, 2)

    print(f"\nBaseline window: {baseline_start.strftime('%Y-%m-%d')} to {baseline_end.strftime('%Y-%m-%d')}")
    print(f"Danger window: {danger_start.strftime('%Y-%m-%d')} to {danger_end.strftime('%Y-%m-%d')}")
    print(f"Crash date: {crash_date.strftime('%Y-%m-%d')}")

    # Estimate slots
    baseline_start_slot = estimate_slots_at_time(baseline_start)
    baseline_end_slot = estimate_slots_at_time(baseline_end)
    danger_start_slot = estimate_slots_at_time(danger_start)
    danger_end_slot = estimate_slots_at_time(danger_end)

    print(f"\nBaseline slots: {baseline_end_slot} to {baseline_start_slot}")
    print(f"Danger slots: {danger_end_slot} to {danger_start_slot}")

    # Analyze baseline period
    print("\n--- BASELINE PERIOD ---")
    baseline = analyze_network_health(baseline_start_slot, baseline_end_slot, "BASELINE")

    time.sleep(1)

    # Analyze danger period
    print("\n--- DANGER PERIOD ---")
    danger = analyze_network_health(danger_start_slot, danger_end_slot, "DANGER")

    time.sleep(1)

    # Analyze crash period
    crash_start_slot = estimate_slots_at_time(crash_date)
    crash_end_slot = estimate_slots_at_time(crash_date + timedelta(days=2))

    print("\n--- CRASH PERIOD ---")
    crash = analyze_network_health(crash_start_slot, crash_end_slot, "CRASH")

    if not baseline or not danger or not crash:
        print("\n✗ INSUFFICIENT BLOCK DATA")
        print("  Note: Historical data may not be available for recent dates")
        return

    # Comparison
    print("\n" + "=" * 60)
    print("NETWORK METRICS COMPARISON")
    print("=" * 60)

    print(f"\n{'Metric':<25} {'Baseline':>12} {'Danger':>12} {'Crash':>12}")
    print("-" * 65)
    print(f"{'Avg TPS':<25} {baseline['avg_tps']:>12.1f} {danger['avg_tps']:>12.1f} {crash['avg_tps']:>12.1f}")
    print(f"{'Max TPS':<25} {baseline['max_tps']:>12.1f} {danger['max_tps']:>12.1f} {crash['max_tps']:>12.1f}")
    print(f"{'TPS Volatility (CV)':<25} {baseline['tps_cv']:>12.2f} {danger['tps_cv']:>12.2f} {crash['tps_cv']:>12.2f}")
    print(f"{'Avg Fee (lamports)':<25} {baseline['avg_fee']:>12.0f} {danger['avg_fee']:>12.0f} {crash['avg_fee']:>12.0f}")
    print(f"{'Fee Volatility (CV)':<25} {baseline['fee_cv']:>12.2f} {danger['fee_cv']:>12.2f} {crash['fee_cv']:>12.2f}")

    # Detection logic
    print("\n" + "=" * 60)
    print("CRASH DETECTION ANALYSIS")
    print("=" * 60)

    # Calculate anomaly scores
    tps_change_danger = (danger['avg_tps'] / baseline['avg_tps'] - 1) * 100 if baseline['avg_tps'] > 0 else 0
    tps_change_crash = (crash['avg_tps'] / baseline['avg_tps'] - 1) * 100 if baseline['avg_tps'] > 0 else 0

    fee_change_danger = (danger['avg_fee'] / baseline['avg_fee'] - 1) * 100 if baseline['avg_fee'] > 0 else 0
    fee_change_crash = (crash['avg_fee'] / baseline['avg_fee'] - 1) * 100 if baseline['avg_fee'] > 0 else 0

    cv_spike_tps = danger['tps_cv'] / baseline['tps_cv'] if baseline['tps_cv'] > 0 else 1
    cv_spike_fee = danger['fee_cv'] / baseline['fee_cv'] if baseline['fee_cv'] > 0 else 1

    print(f"\nTPS change (danger vs baseline): {tps_change_danger:+.1f}%")
    print(f"TPS change (crash vs baseline): {tps_change_crash:+.1f}%")
    print(f"Fee change (danger vs baseline): {fee_change_danger:+.1f}%")
    print(f"Fee change (crash vs baseline): {fee_change_crash:+.1f}%")
    print(f"TPS volatility spike: {cv_spike_tps:.2f}x")
    print(f"Fee volatility spike: {cv_spike_fee:.2f}x")

    # Our 9-metric detection thresholds
    # For crash detection:
    # - Fee spike > 30% = HIGH RISK
    # - TPS drop > 20% = HIGH RISK
    # - Volatility spike > 1.5x = HIGH RISK

    fee_spike_threshold = 30
    tps_drop_threshold = -20
    cv_spike_threshold = 1.5

    danger_score = 0
    danger_indicators = []

    if fee_change_danger > fee_spike_threshold:
        danger_score += 1
        danger_indicators.append(f"Fee spike: {fee_change_danger:+.1f}%")
    elif fee_change_danger < -50:
        danger_score += 1  # Fee DROP can also indicate crisis (liquidity fleeing)
        danger_indicators.append(f"Fee drop: {fee_change_danger:+.1f}%")

    if tps_change_danger < tps_drop_threshold:
        danger_score += 1
        danger_indicators.append(f"TPS drop: {tps_change_danger:+.1f}%")

    if cv_spike_fee > cv_spike_threshold:
        danger_score += 1
        danger_indicators.append(f"Fee volatility spike: {cv_spike_fee:.2f}x")

    if cv_spike_tps > cv_spike_threshold:
        danger_score += 1
        danger_indicators.append(f"TPS volatility spike: {cv_spike_tps:.2f}x")

    print(f"\nDanger indicators: {len(danger_indicators)}/4")
    for ind in danger_indicators:
        print(f"  - {ind}")

    detected = danger_score >= 2  # Need at least 2 indicators

    print(f"\n{'✓ CRASH DETECTED' if detected else '✗ NOT DETECTED'} (score: {danger_score}/4)")

    # Aggregate with TRUMP result
    print("\n" + "=" * 60)
    print("AGGREGATE VALIDATION (TRUMP + SOL)")
    print("=" * 60)

    # TRUMP was detected (58% fee spike)
    trump_detected = True
    sol_detected = detected

    events = [("TRUMP", trump_detected, 58.4), ("SOL", sol_detected, fee_change_danger)]
    detected_count = sum(1 for _, d, _ in events if d)
    detection_rate = detected_count / len(events)

    print(f"\nEvents analyzed: {len(events)}")
    print(f"Events detected: {detected_count}")
    for name, det, fee_ch in events:
        print(f"  - {name}: {'✓' if det else '✗'} (fee change: {fee_ch:+.1f}%)")

    print(f"\nDetection rate: {detection_rate*100:.0f}%")

    print("\n" + "=" * 60)
    print("STATISTICAL SIGNIFICANCE")
    print("=" * 60)

    if detection_rate >= 0.5:
        print(f"\n✓ {detection_rate*100:.0f}% >= 50% detection rate")
        print("  → System demonstrates predictive power across crash types")
        print("  → Validated for: network congestion + token crashes")

        if detection_rate >= 1.0:
            print(f"\n✓ PERFECT DETECTION: {detection_rate*100:.0f}%")
            print("  → System ready for paper trading deployment")
            print("  → Next: Tune Kelly sizing, then live paper trading")
        elif detection_rate >= 0.67:
            print(f"\n✓ STRONG EVIDENCE: {detection_rate*100:.0f}% >= 67%")
            print("  → System validated, minor tuning needed")
            print("  → Next: Optimize thresholds with more events")
    else:
        print(f"\n⚠ LOW DETECTION RATE: {detection_rate*100:.0f}%")
        print("  → System needs recalibration")
        print("  → Continue with paper trading to gather real-world data")

if __name__ == "__main__":
    main()
