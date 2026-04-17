#!/usr/bin/env python3
"""
24H TEST ANALYSE TOOL
Berechnet Statistiken und Auswertungen nach dem Test
"""

import json
import sys
from collections import defaultdict
from datetime import datetime

def analyze_trades(trades_file):
    """Analysiert alle Trades"""
    trades = []
    with open(trades_file, 'r') as f:
        for line in f:
            try:
                trades.append(json.loads(line))
            except:
                continue
    
    # Stats
    open_trades = [t for t in trades if t.get('action') == 'OPEN']
    exit_trades = [t for t in trades if t.get('action') == 'EXIT']
    
    print(f"\n{'='*60}")
    print("TRADE ANALYSE")
    print(f"{'='*60}")
    print(f"Total Trades: {len(trades)}")
    print(f"OPEN Trades: {len(open_trades)}")
    print(f"EXIT Trades: {len(exit_trades)}")
    
    # PnL Analyse
    winners = [t for t in exit_trades if t.get('pnlSol', 0) > 0]
    losers = [t for t in exit_trades if t.get('pnlSol', 0) < 0]
    
    print(f"\nGeschlossene Trades:")
    print(f"  Gewinner: {len(winners)} ({100*len(winners)/len(exit_trades):.1f}%)")
    print(f"  Verlierer: {len(losers)} ({100*len(losers)/len(exit_trades):.1f}%)")
    
    total_pnl = sum(t.get('pnlSol', 0) for t in exit_trades)
    print(f"  Total PnL: {total_pnl:.4f} SOL")
    
    if winners:
        avg_win = sum(t.get('pnlSol', 0) for t in winners) / len(winners)
        print(f"  Avg Gewinn: {avg_win:.4f} SOL")
    
    if losers:
        avg_loss = sum(t.get('pnlSol', 0) for t in losers) / len(losers)
        print(f"  Avg Verlust: {avg_loss:.4f} SOL")
    
    # Top Coins
    coin_trades = defaultdict(int)
    for t in trades:
        coin_trades[t.get('symbol', 'UNKNOWN')] += 1
    
    print(f"\nTop 10 Coins nach Trade-Häufigkeit:")
    for coin, count in sorted(coin_trades.items(), key=lambda x: -x[1])[:10]:
        print(f"  {coin}: {count}")

def analyze_cycles(cycles_file):
    """Analysiert alle Cycles"""
    cycles = []
    with open(cycles_file, 'r') as f:
        for line in f:
            try:
                cycles.append(json.loads(line))
            except:
                continue
    
    print(f"\n{'='*60}")
    print("CYCLE ANALYSE")
    print(f"{'='*60}")
    print(f"Total Cycles: {len(cycles)}")
    
    # Zone Verteilung
    zones = defaultdict(int)
    for c in cycles:
        zones[c.get('zone', 'UNKNOWN')] += 1
    
    print(f"\nZone Verteilung:")
    for zone, count in sorted(zones.items()):
        print(f"  {zone}: {count} ({100*count/len(cycles):.1f}%)")
    
    # Crash Probability
    crash_probs = [c.get('crashProbability', 0) for c in cycles]
    if crash_probs:
        print(f"\nCrash Probability Statistik:")
        print(f"  Min: {min(crash_probs):.4f}")
        print(f"  Max: {max(crash_probs):.4f}")
        print(f"  Avg: {sum(crash_probs)/len(crash_probs):.4f}")

def main():
    log_dir = "/data/trinity_apex/solana-stream/paper-trading/logs/24h-test"
    
    trades_file = f"{log_dir}/trades.jsonl"
    cycles_file = f"{log_dir}/cycles.jsonl"
    
    print("24H TEST ANALYSE TOOL")
    print(f"Zeitpunkt: {datetime.now()}")
    
    if input("Trades analysieren? (j/n) ") != 'n':
        analyze_trades(trades_file)
    
    if input("Cycles analysieren? (j/n) ") != 'n':
        analyze_cycles(cycles_file)

if __name__ == "__main__":
    main()
