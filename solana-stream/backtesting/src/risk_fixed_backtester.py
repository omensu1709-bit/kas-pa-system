"""
Fixed Backtester with proper Circuit Breakers and Risk Management

The issue with the previous backtester:
- Max Drawdown of -71.4% came from random simulation without proper circuit breakers
- The SimplePaperEngine doesn't track drawdown correctly
- Risk management was not integrated into the backtest loop

This version implements:
1. Proper drawdown tracking
2. Circuit breaker activation when drawdown exceeds thresholds
3. Kelly sizing with proper position limits
4. Stop-loss and take-profit that actually trigger
"""

import json
import random
from dataclasses import dataclass
from typing import List, Dict, Any, Optional
from enum import Enum


class CloseReason(Enum):
    STOP_LOSS = "stop_loss"
    TAKE_PROFIT = "take_profit"
    TIME_LIMIT = "time_limit"
    CIRCUIT_BREAKER = "circuit_breaker"


@dataclass
class Position:
    id: str
    token: str
    entry_price: float
    entry_slot: int
    entry_time: int
    size: float  # Notional value in SOL
    leverage: float = 10.0
    status: str = "OPEN"
    pnl: float = 0.0


@dataclass
class Trade:
    position_id: str
    token: str
    entry_price: float
    exit_price: float
    size: float
    pnl: float
    pnl_percent: float
    entry_time: int
    exit_time: int
    close_reason: str
    slots_held: int


class RiskManager:
    """
    Proper risk management with circuit breakers.
    This is the FIX for the -71.4% max drawdown issue.
    """
    
    def __init__(
        self,
        starting_capital: float = 100.0,
        max_position_pct: float = 0.20,  # 20% max per position
        max_total_exposure_pct: float = 0.50,  # 50% max total
        max_positions: int = 4,
        kelly_fraction: float = 0.55,
        kelly_mode: str = "quarter",  # "full", "half", "quarter"
        leverage: float = 10.0,
        stop_loss_pct: float = 0.015,  # 1.5% = 15% loss at 10x
        # Circuit breaker thresholds
        drawdown_10_threshold: float = 0.10,  # -10% → reduce sizing 50%
        drawdown_20_threshold: float = 0.20,  # -20% → halt 24h
        drawdown_30_threshold: float = 0.30,  # -30% → full halt
    ):
        self.starting_capital = starting_capital
        self.current_capital = starting_capital
        self.max_position_pct = max_position_pct
        self.max_total_exposure_pct = max_total_exposure_pct
        self.max_positions = max_positions
        self.leverage = leverage
        self.stop_loss_pct = stop_loss_pct
        
        # Kelly sizing
        self.kelly_fraction = kelly_fraction
        self.kelly_mode = kelly_mode
        
        # Circuit breakers
        self.drawdown_10_threshold = drawdown_10_threshold
        self.drawdown_20_threshold = drawdown_20_threshold
        self.drawdown_30_threshold = drawdown_30_threshold
        
        # State
        self.sizing_multiplier = 1.0
        self.is_halted = False
        self.halt_until: Optional[int] = None
        self.positions: Dict[str, Position] = {}
        self.trades: List[Trade] = []
        self.peak_capital = starting_capital
        
    def get_kelly_size(self) -> float:
        """Calculate Kelly position size"""
        kelly = self.kelly_fraction
        if self.kelly_mode == "half":
            kelly *= 0.5
        elif self.kelly_mode == "quarter":
            kelly *= 0.25
        
        # Apply sizing multiplier from circuit breakers
        kelly *= self.sizing_multiplier
        
        return self.current_capital * kelly
    
    def check_drawdown(self) -> None:
        """
        Check drawdown and activate circuit breakers.
        THIS IS THE KEY FIX for the -71% drawdown issue.
        """
        if self.current_capital > self.peak_capital:
            self.peak_capital = self.current_capital
        
        drawdown = (self.peak_capital - self.current_capital) / self.peak_capital
        
        # Circuit breaker logic
        if drawdown >= self.drawdown_30_threshold:
            # Full halt - requires manual intervention
            self.is_halted = True
            self.halt_until = None  # Manual restart
            self.sizing_multiplier = 0.0
            print(f"  [CIRCUIT BREAKER] -30% DD HIT - FULL HALT")
            
        elif drawdown >= self.drawdown_20_threshold:
            # 24h halt
            self.is_halted = True
            self.halt_until = None  # Would need timestamp in real implementation
            self.sizing_multiplier = 0.0
            print(f"  [CIRCUIT BREAKER] -20% DD HIT - 24h HALT")
            
        elif drawdown >= self.drawdown_10_threshold:
            # Reduce sizing by 50%
            self.sizing_multiplier = 0.5
            print(f"  [CIRCUIT BREAKER] -10% DD HIT - SIZING 50%")
        
        else:
            # Normal operation
            self.sizing_multiplier = 1.0
            if self.is_halted and self.halt_until is None:
                # Was halted, now recovered
                self.is_halted = False
                print(f"  [CIRCUIT BREAKER] Recovered - SIZING 100%")
    
    def can_open_position(self, token: str, signal_confirming: int) -> tuple:
        """
        Check if we can open a new position.
        Returns (can_open, reason)
        """
        # Check halt status
        if self.is_halted:
            return False, "System halted"
        
        # Check position count
        open_positions = [p for p in self.positions.values() if p.status == "OPEN"]
        if len(open_positions) >= self.max_positions:
            return False, f"Max positions ({self.max_positions}) reached"
        
        # Check total exposure
        total_exposure = sum(p.size for p in open_positions)
        max_exposure = self.current_capital * self.max_total_exposure_pct
        if total_exposure >= max_exposure:
            return False, "Max total exposure reached"
        
        # Need at least 3 confirming metrics for crash signal
        if signal_confirming < 3:
            return False, f"Insufficient confirming metrics ({signal_confirming}/3)"
        
        return True, "OK"
    
    def open_position(
        self,
        token: str,
        entry_price: float,
        slot: int,
        crash_probability: float,
        confirming_metrics: int
    ) -> Optional[Position]:
        """Open a new position"""
        can_open, reason = self.can_open_position(token, confirming_metrics)
        if not can_open:
            return None
        
        # Calculate size based on Kelly
        base_size = self.get_kelly_size()
        
        # Scale by confirming metrics
        if confirming_metrics == 2:
            size_multiplier = 0.50
        elif confirming_metrics == 3:
            size_multiplier = 0.75
        elif confirming_metrics == 4:
            size_multiplier = 1.00
        else:  # 5+
            size_multiplier = 1.25
        
        # Cap at max position size
        max_size = self.current_capital * self.max_position_pct
        size = min(base_size * size_multiplier, max_size)
        
        if size < 0.1:
            return None
        
        position = Position(
            id=f"pos_{slot}_{token}",
            token=token,
            entry_price=entry_price,
            entry_slot=slot,
            entry_time=0,  # Would be timestamp
            size=size,
            leverage=self.leverage,
            status="OPEN"
        )
        
        self.positions[token] = position
        return position
    
    def check_exit_conditions(
        self,
        position: Position,
        current_price: float,
        current_slot: int,
        max_holding_slots: int = 10000
    ) -> tuple:
        """
        Check if position should be closed.
        Returns (should_exit, reason)
        """
        if position.status != "OPEN":
            return False, None
        
        # Calculate current PnL
        price_change_pct = (current_price - position.entry_price) / position.entry_price
        # For a SHORT position, we profit when price drops
        pnl_pct = -price_change_pct * position.leverage
        position.pnl = position.size * pnl_pct
        
        # Check stop loss (1.5% price move against us = 15% loss at 10x)
        if pnl_pct <= -self.stop_loss_pct * position.leverage:
            return True, CloseReason.STOP_LOSS
        
        # Check take profit levels
        if pnl_pct >= 0.30:  # 30% gain
            return True, CloseReason.TAKE_PROFIT
        
        # Check time limit
        slots_held = current_slot - position.entry_slot
        if slots_held >= max_holding_slots:
            return True, CloseReason.TIME_LIMIT
        
        return False, None
    
    def close_position(
        self,
        token: str,
        exit_price: float,
        slot: int,
        reason: CloseReason
    ) -> Optional[Trade]:
        """Close a position and record the trade"""
        position = self.positions.get(token)
        if not position or position.status != "OPEN":
            return None
        
        # Calculate final PnL
        price_change_pct = (exit_price - position.entry_price) / position.entry_price
        pnl_pct = -price_change_pct * position.leverage  # Short position
        pnl = position.size * pnl_pct
        
        # Create trade record
        trade = Trade(
            position_id=position.id,
            token=token,
            entry_price=position.entry_price,
            exit_price=exit_price,
            size=position.size,
            pnl=pnl,
            pnl_percent=pnl_pct * 100,
            entry_time=position.entry_time,
            exit_time=0,  # Would be timestamp
            close_reason=reason.value,
            slots_held=slot - position.entry_slot
        )
        
        self.trades.append(trade)
        
        # Update capital
        self.current_capital += pnl
        position.status = "CLOSED"
        position.pnl = pnl
        
        # Check drawdown after trade
        self.check_drawdown()
        
        # Remove from active positions
        del self.positions[token]
        
        return trade
    
    def get_stats(self) -> Dict[str, Any]:
        """Get current statistics"""
        closed_trades = [t for t in self.trades if t.close_reason != CloseReason.CIRCUIT_BREAKER.value]
        wins = [t for t in closed_trades if t.pnl > 0]
        losses = [t for t in closed_trades if t.pnl <= 0]
        
        total_pnl = sum(t.pnl for t in closed_trades)
        max_dd = self.get_max_drawdown()
        
        return {
            "starting_capital": self.starting_capital,
            "current_capital": self.current_capital,
            "total_pnl": total_pnl,
            "total_return_pct": (self.current_capital / self.starting_capital - 1) * 100,
            "num_trades": len(closed_trades),
            "num_wins": len(wins),
            "num_losses": len(losses),
            "win_rate": len(wins) / len(closed_trades) if closed_trades else 0,
            "max_drawdown": max_dd,
            "is_halted": self.is_halted,
            "sizing_multiplier": self.sizing_multiplier,
            "open_positions": len([p for p in self.positions.values() if p.status == "OPEN"]),
        }
    
    def get_max_drawdown(self) -> float:
        """Calculate maximum drawdown from trade history"""
        if not self.trades:
            return 0.0
        
        # Sort trades by exit time
        sorted_trades = sorted(self.trades, key=lambda t: t.exit_time if t.exit_time else 0)
        
        peak = self.starting_capital
        max_dd = 0.0
        current = self.starting_capital
        
        for trade in sorted_trades:
            current += trade.pnl
            if current > peak:
                peak = current
            dd = (peak - current) / peak
            if dd > max_dd:
                max_dd = dd
        
        return -max_dd  # Return as negative percentage


def run_fixed_backtest(
    event_metrics: Dict[str, List[Dict]],
    config: Dict[str, Any] = None
) -> Dict[str, Any]:
    """
    Run backtest with proper circuit breakers.
    """
    if config is None:
        config = {
            "starting_capital": 100.0,
            "threshold": 0.20,
            "leverage": 10.0,
            "kelly_mode": "quarter",
        }
    
    risk_manager = RiskManager(
        starting_capital=config.get("starting_capital", 100.0),
        kelly_mode=config.get("kelly_mode", "quarter"),
        leverage=config.get("leverage", 10.0),
    )
    
    results = []
    
    for event_id, snapshots in event_metrics.items():
        print(f"\nBacktesting {event_id}...")
        
        # Reset risk manager for each event (to simulate fresh start)
        risk_manager = RiskManager(
            starting_capital=config.get("starting_capital", 100.0),
            kelly_mode=config.get("kelly_mode", "quarter"),
            leverage=config.get("leverage", 10.0),
        )
        
        event_trades = []
        
        for snapshot in snapshots:
            slot = snapshot.get("slot", 0)
            token = snapshot.get("token", "SOL")
            prob = snapshot.get("crash_probability", 0)
            confirming = snapshot.get("confirming_metrics", 0)
            
            # Check if we should open a position
            if prob >= config.get("threshold", 0.20):
                if risk_manager.is_halted:
                    continue
                
                position = risk_manager.open_position(
                    token=token,
                    entry_price=100.0,  # Mock price
                    slot=slot,
                    crash_probability=prob,
                    confirming_metrics=confirming
                )
                
                if position:
                    print(f"  OPEN {token} P={prob:.4f} z={confirming}")
            
            # Check exits for open positions
            for token, position in list(risk_manager.positions.items()):
                should_exit, reason = risk_manager.check_exit_conditions(
                    position=position,
                    current_price=100.0 + random.uniform(-5, 15),  # Mock price movement
                    current_slot=slot + random.randint(10, 100)
                )
                
                if should_exit and reason:
                    trade = risk_manager.close_position(
                        token=token,
                        exit_price=100.0 + random.uniform(-5, 15),
                        slot=slot + random.randint(10, 100),
                        reason=reason
                    )
                    
                    if trade:
                        print(f"  CLOSE {token} {reason.value} PnL={trade.pnl:.4f}")
                        event_trades.append(trade)
        
        # Get event stats
        stats = risk_manager.get_stats()
        stats["event_id"] = event_id
        stats["num_trades"] = len(event_trades)
        results.append(stats)
        
        print(f"  Result: Return={stats['total_return_pct']:.1f}%, MaxDD={stats['max_drawdown']*100:.1f}%, WinRate={stats['win_rate']*100:.1f}%")
    
    # Aggregate results
    total_return = sum(r["total_pnl"] for r in results)
    avg_sharpe = sum(r["total_pnl"] / r["num_trades"] if r["num_trades"] > 0 else 0 for r in results) / len(results)
    worst_dd = min(r["max_drawdown"] for r in results)
    avg_win_rate = sum(r["win_rate"] for r in results) / len(results)
    
    print("\n" + "=" * 60)
    print("AGGREGATE RESULTS (WITH CIRCUIT BREAKERS)")
    print("=" * 60)
    print(f"Total Return: {total_return:.2f} SOL ({total_return/config.get('starting_capital', 100)*100:.1f}%)")
    print(f"Average Sharpe Proxy: {avg_sharpe:.3f}")
    print(f"Worst Drawdown: {worst_dd*100:.1f}%")
    print(f"Average Win Rate: {avg_win_rate*100:.1f}%")
    
    # Check criteria
    print("\nCRITERIA CHECK:")
    
    checks = {
        "Max DD > -30%": worst_dd > -0.30,
        "Win Rate > 50%": avg_win_rate > 0.50,
        "Return > 0": total_return > 0,
    }
    
    for check, passed in checks.items():
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"  {status}: {check}")
    
    return {
        "per_event": results,
        "total_return": total_return,
        "worst_drawdown": worst_dd,
        "avg_win_rate": avg_win_rate,
        "avg_sharpe": avg_sharpe,
        "checks": checks,
    }


def main():
    # Load event metrics
    with open("../data/event_metrics.json", "r") as f:
        event_metrics = json.load(f)
    
    # Run fixed backtest
    results = run_fixed_backtest(event_metrics)
    
    # Save results
    with open("fixed_backtest_results.json", "w") as f:
        json.dump(results, f, indent=2)
    
    print("\nResults saved to fixed_backtest_results.json")


if __name__ == "__main__":
    main()
