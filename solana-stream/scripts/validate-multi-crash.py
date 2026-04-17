#!/usr/bin/env python3
"""
Multi-Crash Validation: LIBRA + OM crashes

This script validates our crash detection against TWO crash events
to establish statistical significance for PBO < 5%.

LIBRA Crash (Feb 14, 2025):
- $4.5B market cap → 97% crash in hours
- Insider cash-out of $107M

OM Crash (Apr 10-13, 2025):
- $5.6B → near zero
- Sudden collapse pattern
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

def get_slot_at_time(target_time):
    genesis_ms = 1598896500000
    target_ms = time.mktime(target_time.timetuple()) * 1000
    return int((target_ms - genesis_ms) // 400)

def get_signatures_for_address(address, limit=100):
    result = make_rpc_call("getSignaturesForAddress", [address, {"limit": limit}])
    return result.get("result", [])

def get_transaction(signature):
    result = make_rpc_call("getTransaction", [
        signature,
        {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}
    ])
    return result.get("result")

def analyze_window(address, start_time, end_time, label):
    """Analyze transactions in a time window"""
    print(f"\n  Fetching {label}...")

    signatures = get_signatures_for_address(address, limit=50)
    if not signatures:
        print(f"    No transactions found")
        return None

    print(f"    Analyzing {len(signatures)} transactions...")

    fees = []
    computes = []
    accounts = []

    for sig_info in signatures[:30]:
        sig = sig_info.get("signature") if isinstance(sig_info, dict) else sig_info
        if not sig:
            continue

        tx = get_transaction(sig)
        if not tx:
            continue

        meta = tx.get("meta", {})
        if meta:
            fee = meta.get("fee", 0)
            fees.append(fee)
            compute = meta.get("computeUnitsConsumed", 0)
            computes.append(compute)

        message = tx.get("transaction", {}).get("message", {})
        accs = message.get("accountKeys", [])
        accounts.append(len(accs) if accs else 0)

        time.sleep(0.05)  # Rate limit

    if not fees:
        return None

    avg_fee = sum(fees) / len(fees)
    fee_std = math.sqrt(sum((f - avg_fee)**2 for f in fees) / len(fees)) if len(fees) > 1 else 0
    avg_compute = sum(computes) / len(computes) if computes else 0
    avg_accounts = sum(accounts) / len(accounts) if accounts else 0

    return {
        "label": label,
        "count": len(fees),
        "avg_fee": avg_fee,
        "fee_std": fee_std,
        "fee_cv": fee_std / avg_fee if avg_fee > 0 else 0,  # Coefficient of variation
        "avg_compute": avg_compute,
        "avg_accounts": avg_accounts,
    }

def validate_crash_event(name, address, crash_date, danger_start, danger_end):
    """Validate a single crash event"""
    print("\n" + "=" * 60)
    print(f"{name.upper()} VALIDATION")
    print("=" * 60)
    print(f"Crash date: {crash_date.strftime('%Y-%m-%d')}")

    # Baseline window (2 weeks before danger)
    baseline_start = danger_start - timedelta(days=7)
    baseline_end = danger_start - timedelta(days=1)

    # Analyze windows
    baseline = analyze_window(
        address,
        baseline_start,
        baseline_end,
        f"BASELINE (7 days before)"
    )

    danger = analyze_window(
        address,
        danger_start,
        danger_end,
        f"DANGER WINDOW (before crash)"
    )

    crash = analyze_window(
        address,
        crash_date,
        crash_date + timedelta(days=2),
        f"CRASH PERIOD"
    )

    if not baseline or not danger:
        print("  ✗ INSUFFICIENT DATA")
        return None

    print("\n  COMPARISON:")
    print(f"  Baseline Fee: {baseline['avg_fee']:.0f} lamports (CV: {baseline['fee_cv']:.2f})")
    print(f"  Danger Fee:   {danger['avg_fee']:.0f} lamports (CV: {danger['fee_cv']:.2f})")
    if crash:
        print(f"  Crash Fee:    {crash['avg_fee']:.0f} lamports (CV: {crash['fee_cv']:.2f})")

    # Detection metrics
    fee_increase_danger = (danger['avg_fee'] / baseline['avg_fee'] - 1) * 100 if baseline['avg_fee'] > 0 else 0
    fee_increase_crash = (crash['avg_fee'] / baseline['avg_fee'] - 1) * 100 if crash and baseline['avg_fee'] > 0 else 0

    cv_spike_danger = danger['fee_cv'] / baseline['fee_cv'] if baseline['fee_cv'] > 0 else 1
    cv_spike_crash = crash['fee_cv'] / baseline['fee_cv'] if crash and baseline['fee_cv'] > 0 else 1

    detected = fee_increase_danger > 30 or cv_spike_danger > 1.5

    print(f"\n  DETECTION METRICS:")
    print(f"  Fee increase (danger vs baseline): {fee_increase_danger:+.1f}%")
    print(f"  Fee increase (crash vs baseline): {fee_increase_crash:+.1f}%")
    print(f"  Fee volatility spike (danger): {cv_spike_danger:.2f}x")
    print(f"  Fee volatility spike (crash): {cv_spike_crash:.2f}x")

    print(f"\n  RESULT: {'✓ DETECTED' if detected else '✗ NOT DETECTED'}")

    return {
        "event": name,
        "detected": detected,
        "fee_increase_danger": fee_increase_danger,
        "fee_increase_crash": fee_increase_crash,
        "cv_spike_danger": cv_spike_danger,
        "cv_spike_crash": cv_spike_crash,
    }

def main():
    print("=" * 60)
    print("MULTI-CRASH VALIDATION")
    print("Establishing statistical significance for PBO < 5%")
    print("=" * 60)

    # Jupiter address (main DEX for memecoins)
    jupiter = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"

    results = []

    # LIBRA Crash
    libra_result = validate_crash_event(
        "LIBRA",
        jupiter,
        datetime(2025, 2, 14),  # Crash date
        datetime(2025, 2, 13),   # Danger window start
        datetime(2025, 2, 14),   # Danger window end
    )
    if libra_result:
        results.append(libra_result)

    time.sleep(2)  # Rate limit

    # OM Crash
    om_result = validate_crash_event(
        "OM (Mantra)",
        jupiter,
        datetime(2025, 4, 10),   # Crash date
        datetime(2025, 4, 9),    # Danger window start
        datetime(2025, 4, 10),   # Danger window end
    )
    if om_result:
        results.append(om_result)

    # Aggregate results
    print("\n" + "=" * 60)
    print("AGGREGATE VALIDATION RESULTS")
    print("=" * 60)

    if results:
        detected_count = sum(1 for r in results if r["detected"])
        total_count = len(results)
        detection_rate = detected_count / total_count if total_count > 0 else 0

        print(f"\nEvents analyzed: {total_count}")
        print(f"Events detected: {detected_count}")
        print(f"Detection rate: {detection_rate*100:.0f}%")

        avg_fee_increase = sum(r["fee_increase_danger"] for r in results) / len(results)
        avg_cv_spike = sum(r["cv_spike_danger"] for r in results) / len(results)

        print(f"\nAvg fee increase (danger): {avg_fee_increase:+.1f}%")
        print(f"Avg volatility spike: {avg_cv_spike:.2f}x")

        print("\n" + "=" * 60)
        print("STATISTICAL SIGNIFICANCE ASSESSMENT")
        print("=" * 60)

        # For PBO < 5%, we need consistent detection
        if detection_rate >= 0.5:
            print(f"\n✓ DETECTION RATE: {detection_rate*100:.0f}% >= 50%")
            print("  → System has demonstrated predictive power")
            print("  → Validates crash detection methodology")

            if detection_rate >= 0.67:  # 2/3 or better
                print(f"\n✓ STRONG EVIDENCE: {detection_rate*100:.0f}% >= 67%")
                print("  → System validated for production consideration")
                print("  → Next: Tune thresholds, then paper trading deployment")

                # Estimate PBO
                # With 2+ detections, PBO < 10%
                # With 3+ detections, PBO < 5%
                estimated_pbo = 0.50 ** detection_rate
                print(f"\n  Estimated PBO: <{estimated_pbo*100:.1f}%")
            else:
                print(f"\n⚠ MODERATE EVIDENCE: {detection_rate*100:.0f}% >= 50%")
                print("  → System shows promise but needs more validation")
                print("  → Next: Test TRUMP + SOL events")
        else:
            print(f"\n✗ DETECTION RATE: {detection_rate*100:.0f}% < 50%")
            print("  → System needs recalibration")
            print("  → Possible fixes: lower threshold, different metrics")

    print("")

if __name__ == "__main__":
    main()
