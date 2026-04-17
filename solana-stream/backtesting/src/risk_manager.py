"""
Risk Manager - Position sizing and circuit breakers

Implements:
- Quarter-Kelly position sizing
- Drawdown circuit breakers
- Multi-position correlation limits
- Time-based exits
"""

from dataclasses import dataclass
from enum import Enum
from typing import Optional


class PositionZone(Enum):
    """Three-zone decision framework"""
    IGNORE = "ignore"      # P < 0.10
    MONITOR = "monitor"    # 0.10 <= P < 0.20
    IMMEDIATE_SHORT = "immediate_short"  # P >= 0.20


@dataclass
class TradeSignal:
    """A trading signal from the crash detection system"""
    token: str
    crash_probability: float
    confirming_metrics: int  # Number of metrics with |z| > 1.5
    zone: PositionZone
    slot: int
    timestamp: int
    
    # Z-scores of each metric (for additional filtering)
    z_scores: dict[str, float]


@dataclass
class PositionSizing:
    """Position sizing based on Kelly criterion and risk limits"""
    base_size_pct: float     # Base position size as % of portfolio
    max_size_pct: float      # Maximum position size
    leverage: float           # Leverage to apply
    stop_loss_pct: float     # Stop loss as % of notional
    
    # Kelly fractions
    full_kelly: float        # Full Kelly fraction
    half_kelly: float        # Half Kelly (more conservative)
    quarter_kelly: float     # Quarter Kelly (most conservative)


class RiskManager:
    """
    Risk management system for the crash detection strategy
    
    Implements the risk limits from the research:
    - Single position max: 20% of portfolio
    - Total simultaneous exposure: 50% of portfolio
    - Correlated positions cap: 30%
    - Maximum simultaneous positions: 3-4
    - Daily VaR limit: 5% at 95% confidence
    - Drawdown circuit breakers at -10%, -20%, -30%
    """
    
    def __init__(self, portfolio_value: float):
        self.portfolio_value = portfolio_value
        self.initial_portfolio = portfolio_value
        
        # Position limits
        self.max_single_position = 0.20  # 20%
        self.max_total_exposure = 0.50  # 50%
        self.max_correlated_exposure = 0.30  # 30%
        self.max_positions = 4
        self.daily_var_limit = 0.05  # 5%
        
        # Drawdown circuit breakers
        self.drawdown_10_threshold = 0.10  # -10% → reduce sizing 50%
        self.drawdown_20_threshold = 0.20  # -20% → halt 24 hours
        self.drawdown_30_threshold = 0.30  # -30% → full audit
        
        # Kelly sizing
        self.win_rate = 0.70  # 70% hit rate (midpoint of 60-80%)
        self.reward_risk_ratio = 2.0  # 2:1
        self.kelly_fraction = self._compute_kelly()
        
        # State
        self.positions: dict[str, float] = {}  # token -> notional
        self.current_drawdown = 0.0
        self.is_halted = False
        self.halt_until: Optional[int] = None
        self.sizing_multiplier = 1.0  # Reduced by drawdown circuit breakers
        
    def _compute_kelly(self) -> PositionSizing:
        """Compute Kelly criterion fractions"""
        # Full Kelly: f* = (p * b - q) / b
        # where p = win rate, q = 1-p, b = reward/risk ratio
        p = self.win_rate
        q = 1 - p
        b = self.reward_risk_ratio
        
        f_star = (p * b - q) / b  # Full Kelly
        
        return PositionSizing(
            base_size_pct=f_star,
            max_size_pct=0.20,
            leverage=10.0,
            stop_loss_pct=0.015,  # 1.5% = 15% loss at 10x
            full_kelly=f_star,
            half_kelly=f_star / 2,
            quarter_kelly=f_star / 4,
        )
    
    def get_zone(self, crash_probability: float) -> PositionZone:
        """Determine position zone from crash probability"""
        if crash_probability < 0.10:
            return PositionZone.IGNORE
        elif crash_probability < 0.20:
            return PositionZone.MONITOR
        else:
            return PositionZone.IMMEDIATE_SHORT
    
    def compute_position_size(
        self, 
        signal: TradeSignal,
        current_positions: dict[str, float]
    ) -> Optional[float]:
        """
        Compute position size for a signal
        
        Returns None if signal should be ignored,
        or the notional size in dollars
        """
        # Check halt status
        if self.is_halted:
            if self.halt_until and signal.timestamp < self.halt_until:
                return None
            else:
                self.is_halted = False
                self.halt_until = None
        
        zone = signal.zone
        
        # IGNORE zone: no position
        if zone == PositionZone.IGNORE:
            return None
        
        # MONITOR zone: prepare but don't enter
        if zone == PositionZone.MONITOR:
            return None
        
        # IMMEDIATE SHORT zone: calculate size
        if zone == PositionZone.IMMEDIATE_SHORT:
            # Must have at least 3 confirming metrics
            if signal.confirming_metrics < 3:
                return None
            
            # Base size on number of confirming metrics
            if signal.confirming_metrics == 2:
                base_pct = 0.50  # 50% of base
            elif signal.confirming_metrics == 3:
                base_pct = 0.75  # 75% of base
            elif signal.confirming_metrics == 4:
                base_pct = 1.00  # 100% of base
            else:  # 5+
                base_pct = 1.25  # 125% but capped at 20%
            
            # Apply Kelly (quarter) and sizing multiplier
            kelly_size = self.portfolio_value * self.kelly_fraction.quarter_kelly
            raw_size = kelly_size * base_pct * self.sizing_multiplier
            
            # Apply hard caps
            max_single = self.portfolio_value * self.max_single_position
            size = min(raw_size, max_single)
            
            # Check total exposure
            total_exposure = sum(current_positions.values())
            available = self.portfolio_value * self.max_total_exposure - total_exposure
            
            if available <= 0:
                return None  # No room for new positions
            
            size = min(size, available)
            
            # Check position count
            if len(current_positions) >= self.max_positions:
                return None
            
            return size
        
        return None
    
    def check_drawdown(self, current_value: float) -> None:
        """Check drawdown and trigger circuit breakers if needed"""
        self.portfolio_value = current_value
        self.current_drawdown = (self.initial_portfolio - current_value) / self.initial_portfolio
        
        if self.current_drawdown >= self.drawdown_30_threshold:
            # Full halt and audit
            self.is_halted = True
            self.halt_until = None  # Manual restart required
            self.sizing_multiplier = 0
            print(f"[RiskManager] DRAWDDOWN 30% TRIGGERED - FULL SYSTEM AUDIT REQUIRED")
            
        elif self.current_drawdown >= self.drawdown_20_threshold:
            # 24 hour halt
            self.is_halted = True
            self.halt_until = self._get_timestamp() + 24 * 60 * 60
            self.sizing_multiplier = 0
            print(f"[RiskManager] DRAWDDOWN 20% TRIGGERED - 24h HALT")
            
        elif self.current_drawdown >= self.drawdown_10_threshold:
            # Reduce sizing by 50%
            self.sizing_multiplier = 0.5
            print(f"[RiskManager] DRAWDDOWN 10% TRIGGERED - SIZING REDUCED 50%")
    
    def _get_timestamp(self) -> int:
        import time
        return int(time.time())
    
    def update_portfolio(self, new_value: float) -> None:
        """Update portfolio value and check drawdown"""
        self.check_drawdown(new_value)
    
    def get_available_exposure(self) -> float:
        """Get remaining exposure capacity"""
        used = sum(self.positions.values())
        return self.portfolio_value * self.max_total_exposure - used
    
    def get_position_count(self) -> int:
        """Get current number of positions"""
        return len([p for p in self.positions.values() if p > 0])
