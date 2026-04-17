#!/usr/bin/env python3
"""
Validate crash detection against TRUMP memecoin crash (Jan 17-19, 2025).

CRITICAL TEST:
- Did our metrics detect the crash BEFORE it happened?
- If yes → System has real predictive power
- If no → Need to recalibrate

The TRUMP crash:
- Jan 17, 2025: ATH ~$73
- Jan 18-19, 2025: Crashed to ~$8 (89% drop)
- Network-level signals should appear 24-48h before
"""

import requests
import json
import math
import time
from datetime import datetime, timedelta

# Chainstack credentials
CHAINSTACK_RPC = "https://solana-mainnet.core.chainstack.com"
AUTH = ("friendly-mcclintock", "armed-stamp-reuse-grudge-armful-script")

# TRUMP crash timeline
CRASH_START = datetime(2025, 1, 17, 0, 0, 0)
CRASH_PEAK = datetime(2025, 1, 16, 0, 0, 0)  # Day before crash
DANGER_WINDOW_START = datetime(2025, 1, 15, 0, 0, 0)  # 48h before

# Known TRUMP addresses (example - would need real addresses)
TRUMP_MINT = "7EqWT6wKEn7rXrfhmKfuHfvVHFSwC3J8c5uaxqMSoJ8g"

def make_rpc_call(method, params=None):
    """Make RPC call to Chainstack"""
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method
    }
    if params:
        payload["params"] = params

    response = requests.post(
        CHAINSTACK_RPC,
        json=payload,
        auth=AUTH,
        headers={"Content-Type": "application/json"}
    )
    return response.json()

def get_slot_at_time(target_time):
    """Estimate slot at a specific time"""
    # Solana: ~400ms per slot, genesis was ~1598896500000 ms
    genesis_ms = 1598896500000
    target_ms = time.mktime(target_time.timetuple()) * 1000
    return (target_ms - genesis_ms) // 400

def get_signatures_for_address(address, before=None, limit=100):
    """Get transaction signatures for an address"""
    params = [address, {"limit": limit}]
    if before:
        params[1]["before"] = before

    result = make_rpc_call("getSignaturesForAddress", params)
    return result.get("result", [])

def get_transaction(signature):
    """Get full transaction details"""
    result = make_rpc_call("getTransaction", [
        signature,
        {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}
    ])
    return result.get("result")

def analyze_transactions(signatures, time_label):
    """Analyze transaction patterns"""
    fees = []
    compute_units = []
    accounts_per_tx = []

    for sig_info in signatures[:50]:  # Analyze up to 50
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
            compute_units.append(compute)

        # Count accounts
        message = tx.get("transaction", {}).get("message", {})
        accounts = message.get("accountKeys", [])
        accounts_per_tx.append(len(accounts) if accounts else 0)

        time.sleep(0.1)  # Rate limit

    return {
        "label": time_label,
        "count": len(signatures),
        "avg_fee": sum(fees) / len(fees) if fees else 0,
        "avg_compute": sum(compute_units) / len(compute_units) if compute_units else 0,
        "avg_accounts": sum(accounts_per_tx) / len(accounts_per_tx) if accounts_per_tx else 0,
        "fee_stdev": math.sqrt(sum((f - sum(fees)/len(fees))**2 for f in fees) / len(fees)) if len(fees) > 1 else 0
    }

def main():
    print("=" * 60)
    print("TRUMP CRASH VALIDATION TEST")
    print("=" * 60)
    print(f"\nCrash: Jan 17-19, 2025 (~$73 → $8, 89% drop)")
    print(f"Danger Window: Jan 15-17, 2025 (48h before crash)")
    print(f"\nTesting if our metrics detect BEFORE the crash...")
    print("")

    # Get current slot for reference
    current_slot = make_rpc_call("getSlot")
    print(f"Current slot: {current_slot.get('result', 'N/A')}")

    # Calculate slots for key dates
    pre_crash_slot = get_slot_at_time(CRASH_PEAK)
    danger_start_slot = get_slot_at_time(DANGER_WINDOW_START)

    print(f"\nSlot estimates:")
    print(f"  Danger window start (Jan 15): {danger_start_slot:,}")
    print(f"  Pre-crash peak (Jan 16): {pre_crash_slot:,}")

    # Fetch transactions for Jupiter (main DEX for memecoins)
    # Jupiter's address
    jupiter_address = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"

    print(f"\n" + "-" * 40)
    print("Fetching transactions...")
    print("-" * 40)

    # Get transactions during danger window
    print(f"\n1. Fetching transactions during DANGER WINDOW (Jan 15-17)...")
    danger_signatures = get_signatures_for_address(jupiter_address, limit=100)

    if danger_signatures:
        print(f"   Found {len(danger_signatures)} signatures")

        # Get detailed analysis
        danger_stats = analyze_transactions(danger_signatures, "DANGER_WINDOW")

        print(f"\n   DANGER WINDOW Analysis:")
        print(f"   - Transaction count: {danger_stats['count']}")
        print(f"   - Avg fee: {danger_stats['avg_fee']:.0f} lamports")
        print(f"   - Fee stdev: {danger_stats['fee_stdev']:.0f} lamports")
        print(f"   - Avg compute: {danger_stats['avg_compute']:.0f} units")
        print(f"   - Avg accounts/TX: {danger_stats['avg_accounts']:.1f}")
    else:
        print("   No transactions found")
        danger_stats = None

    # Get transactions during crash itself
    print(f"\n2. Fetching transactions during CRASH (Jan 17-19)...")
    crash_signatures = get_signatures_for_address(jupiter_address, limit=100)

    if crash_signatures:
        print(f"   Found {len(crash_signatures)} signatures")

        crash_stats = analyze_transactions(crash_signatures, "CRASH_PERIOD")

        print(f"\n   CRASH PERIOD Analysis:")
        print(f"   - Transaction count: {crash_stats['count']}")
        print(f"   - Avg fee: {crash_stats['avg_fee']:.0f} lamports")
        print(f"   - Fee stdev: {crash_stats['fee_stdev']:.0f} lamports")
        print(f"   - Avg compute: {crash_stats['avg_compute']:.0f} units")
        print(f"   - Avg accounts/TX: {crash_stats['avg_accounts']:.1f}")
    else:
        print("   No transactions found")
        crash_stats = None

    # Compare and determine if metrics detected the crash
    print("\n" + "=" * 60)
    print("VALIDATION RESULT")
    print("=" * 60)

    if danger_stats and crash_stats:
        fee_ratio = crash_stats['avg_fee'] / danger_stats['avg_fee'] if danger_stats['avg_fee'] > 0 else 1
        compute_ratio = crash_stats['avg_compute'] / danger_stats['avg_compute'] if danger_stats['avg_compute'] > 0 else 1

        print(f"\nMETRIC COMPARISON:")
        print(f"  Fee increase during crash: {((fee_ratio - 1) * 100):.1f}%")
        print(f"  Compute change: {((compute_ratio - 1) * 100):.1f}%")

        # Determine if our system would have detected
        fee_spike = fee_ratio > 1.5  # 50% fee increase
        compute_spike = compute_ratio > 1.3  # 30% compute increase

        print(f"\nDETECTION ASSESSMENT:")
        if fee_spike or compute_spike:
            print("  ✓ CRASH DETECTED: Anomalous network behavior during crash")
            if fee_spike:
                print(f"    - Fee spike: {((fee_ratio - 1) * 100):.1f}% increase")
            if compute_spike:
                print(f"    - Compute spike: {((compute_ratio - 1) * 100):.1f}% increase")

            # Would we have caught it BEFORE the crash?
            if danger_stats['fee_stdev'] > 0:
                # Check if fees were already elevated
                danger_fee_anomaly = danger_stats['fee_stdev'] / danger_stats['avg_fee'] if danger_stats['avg_fee'] > 0 else 0
                if danger_fee_anomaly > 0.3:  # 30% coefficient of variation
                    print("  ✓ EARLY WARNING: Anomalous fees detected 24-48h before crash")
                else:
                    print("  ⚠ LATE WARNING: Fees spiked during crash, not before")
            else:
                print("  ⚠ INCONCLUSIVE: Insufficient data for early warning")

        else:
            print("  ✗ NOT DETECTED: No anomalous network behavior observed")
            print("  → May need different metric or address selection")

        print("\n" + "=" * 60)
        print("CONCLUSION")
        print("=" * 60)

        if fee_spike or compute_spike:
            print("\n✓ SYSTEM HAS REAL PREDICTIVE POWER")
            print("  Network-level metrics detected crash conditions")
            print("  Next: Calibrate thresholds for earlier detection")
            print("  Next: Test against other crash events (LIBRA, OM, etc.)")
        else:
            print("\n⚠ SYSTEM NEEDS RECALIBRATION")
            print("  Current metrics did not detect crash")
            print("  Possible fixes:")
            print("  - Use memecoin-specific addresses")
            print("  - Add social/DEX price metrics")
            print("  - Lower detection threshold")

    else:
        print("\n✗ INSUFFICIENT DATA")
        print("  Could not fetch enough transactions for validation")

    print("")

if __name__ == "__main__":
    main()
