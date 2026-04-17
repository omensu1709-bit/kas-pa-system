#!/usr/bin/env python3
"""
Fetch real Solana data from Chainstack REST API.
This bypasses the gRPC connection issue.
"""

import requests
import json
import time
from datetime import datetime, timedelta

# Chainstack credentials
CHAINSTACK_RPC = "https://solana-mainnet.core.chainstack.com"
CHAINSTACK_AUTH = ("friendly-mcclintock", "armed-stamp-reuse-grudge-armful-script")

def get_current_slot():
    """Get current Solana slot"""
    response = requests.post(
        CHAINSTACK_RPC,
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getSlot"
        },
        auth=CHAINSTACK_AUTH
    )
    return response.json()["result"]

def get_block(slot):
    """Get block by slot"""
    response = requests.post(
        CHAINSTACK_RPC,
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getBlock",
            "params": [
                slot,
                {
                    "encoding": "json",
                    "maxSupportedTransactionVersion": 0
                }
            ]
        },
        auth=CHAINSTACK_AUTH
    )
    return response.json()

def get_signatures_for_address(address, limit=100):
    """Get transaction signatures for an address"""
    response = requests.post(
        CHAINSTACK_RPC,
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getSignaturesForAddress",
            "params": [
                address,
                {"limit": limit}
            ]
        },
        auth=CHAINSTACK_AUTH
    )
    return response.json()

def get_transaction(signature):
    """Get transaction details"""
    response = requests.post(
        CHAINSTACK_RPC,
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getTransaction",
            "params": [
                signature,
                {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}
            ]
        },
        auth=CHAINSTACK_AUTH
    )
    return response.json()

def fetch_recent_transactions(count=100):
    """Fetch recent transactions from Solana"""
    print("=" * 60)
    print("CHAINSTACK REST API - REAL SOLANA DATA")
    print("=" * 60)
    
    # Get current slot
    current_slot = get_current_slot()
    print(f"\nCurrent Slot: {current_slot}")
    
    # Key addresses to monitor
    addresses = [
        "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",  # Jupiter
        "675kPX9MHTjS2zt1qfr1NYLvze7sX1K3s8wVQfTRuBA",  # Raydium
        "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963wkxs",  # Serum
    ]
    
    all_transactions = []
    
    for address in addresses:
        print(f"\nFetching transactions for {address[:20]}...")
        try:
            sigs = get_signatures_for_address(address, limit=count)
            if "result" in sigs and sigs["result"]:
                print(f"  Found {len(sigs['result'])} transactions")
                for sig_info in sigs["result"][:10]:  # First 10
                    sig = sig_info["signature"]
                    # Get full transaction
                    tx = get_transaction(sig)
                    if "result" in tx and tx["result"]:
                        all_transactions.append(tx["result"])
            else:
                print(f"  No transactions found")
        except Exception as e:
            print(f"  Error: {e}")
    
    print(f"\nTotal transactions fetched: {len(all_transactions)}")
    
    # Analyze transaction characteristics
    if all_transactions:
        fees = []
        compute_units = []
        accounts = set()
        
        for tx in all_transactions:
            if tx and "meta" in tx and tx["meta"]:
                if "fee" in tx["meta"]:
                    fees.append(tx["meta"]["fee"])
                if "computeUnitsConsumed" in tx["meta"]:
                    compute_units.append(tx["meta"]["computeUnitsConsumed"])
            
            if tx and "transaction" in tx and tx["transaction"]:
                if "message" in tx["transaction"]:
                    for acc in tx["transaction"]["message"].get("accountKeys", []):
                        if isinstance(acc, dict) and "pubkey" in acc:
                            accounts.add(acc["pubkey"])
        
        print("\n" + "=" * 60)
        print("TRANSACTION ANALYSIS")
        print("=" * 60)
        
        if fees:
            avg_fee = sum(fees) / len(fees)
            print(f"\nFees:")
            print(f"  Count: {len(fees)}")
            print(f"  Average: {avg_fee:.0f} lamports ({avg_fee/1e9:.6f} SOL)")
            print(f"  Min: {min(fees):.0f} lamports")
            print(f"  Max: {max(fees):.0f} lamports")
        
        if compute_units:
            avg_compute = sum(compute_units) / len(compute_units)
            print(f"\nCompute Units:")
            print(f"  Count: {len(compute_units)}")
            print(f"  Average: {avg_compute:.0f}")
        
        print(f"\nUnique Accounts: {len(accounts)}")
        
        # This is REAL DATA we can use for calibration
        print("\n" + "=" * 60)
        print("✓ SUCCESS: Using REAL Solana network data")
        print("  This data can calibrate the crash detection system")
        print("=" * 60)
        
        return all_transactions
    
    return []

def main():
    """Main entry point"""
    print("\nFetching real Solana data from Chainstack...")
    
    try:
        transactions = fetch_recent_transactions(count=50)
        
        if transactions:
            # Save to file for further analysis
            with open("real_solana_transactions.json", "w") as f:
                json.dump(transactions, f, indent=2)
            print(f"\nSaved {len(transactions)} transactions to real_solana_transactions.json")
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
