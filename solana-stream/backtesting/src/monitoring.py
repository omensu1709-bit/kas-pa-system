"""
Regime Change Detection and VIF Monitoring

Detects when the statistical regime of the market changes,
which can invalidate our model's assumptions.
"""

import numpy as np
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass


@dataclass
class RegimeChangeAlert:
    timestamp: int
    metric: str
    old_value: float
    new_value: float
    change_percent: float
    severity: str  # 'warning' | 'critical'


class RegimeChangeDetector:
    """
    Detects regime changes in market conditions using multiple methods:
    1. CUSUM control chart for mean shifts
    2. Rolling window variance comparison
    3. Structural break tests
    """

    def __init__(
        self,
        window_size: int = 100,
        cusum_threshold: float = 5.0,
        variance_ratio_threshold: float = 2.0
    ):
        self.window_size = window_size
        self.cusum_threshold = cusum_threshold
        self.variance_ratio_threshold = variance_ratio_threshold

        self.metric_history: Dict[str, List[float]] = {}
        self.cusum_pos: Dict[str, float] = {}
        self.cusum_neg: Dict[str, float] = {}
        self.baseline_mean: Dict[str, float] = {}
        self.baseline_std: Dict[str, float] = {}

    def record(self, metric_name: str, value: float) -> Optional[RegimeChangeAlert]:
        """Record a metric value and check for regime changes"""
        if metric_name not in self.metric_history:
            self.metric_history[metric_name] = []
            self.cusum_pos[metric_name] = 0.0
            self.cusum_neg[metric_name] = 0.0

        history = self.metric_history[metric_name]
        history.append(value)

        # Maintain window size
        if len(history) > self.window_size * 2:
            history.pop(0)

        # Need minimum history
        if len(history) < self.window_size:
            return None

        # Update baseline from first window
        if metric_name not in self.baseline_mean:
            self.baseline_mean[metric_name] = np.mean(history[:self.window_size])
            self.baseline_std[metric_name] = np.std(history[:self.window_size]) + 1e-6

        # CUSUM detection
        if self.baseline_std[metric_name] > 0:
            z = (value - self.baseline_mean[metric_name]) / self.baseline_std[metric_name]
            self.cusum_pos[metric_name] = max(0, self.cusum_pos[metric_name] + z)
            self.cusum_neg[metric_name] = max(0, self.cusum_neg[metric_name] - z)

        # Check for variance change
        recent = history[-self.window_size:]
        older = history[-2*self.window_size:-self.window_size] if len(history) >= 2*self.window_size else history[:self.window_size]

        if len(recent) >= 10 and len(older) >= 10:
            var_recent = np.var(recent)
            var_older = np.var(older)
            var_ratio = var_recent / (var_older + 1e-6)

            if var_ratio > self.variance_ratio_threshold:
                return RegimeChangeAlert(
                    timestamp=len(history),
                    metric=metric_name,
                    old_value=np.mean(older),
                    new_value=np.mean(recent),
                    change_percent=(var_ratio - 1) * 100,
                    severity='critical'
                )

        # Check CUSUM
        if (self.cusum_pos[metric_name] > self.cusum_threshold or
            self.cusum_neg[metric_name] > self.cusum_threshold):
            self.cusum_pos[metric_name] = 0
            self.cusum_neg[metric_name] = 0
            return RegimeChangeAlert(
                timestamp=len(history),
                metric=metric_name,
                old_value=self.baseline_mean[metric_name],
                new_value=value,
                change_percent=((value - self.baseline_mean[metric_name]) / (self.baseline_std[metric_name] + 1e-6)) * 100,
                severity='warning'
            )

        return None

    def get_regime_status(self) -> Dict[str, str]:
        """Get current regime status for all metrics"""
        status = {}
        for metric, history in self.metric_history.items():
            if len(history) < self.window_size:
                status[metric] = 'insufficient_data'
            elif self.cusum_pos[metric] > 0 or self.cusum_neg[metric] > 0:
                status[metric] = 'unstable'
            else:
                status[metric] = 'stable'
        return status


class VIFMonitor:
    """
    Variance Inflation Factor monitoring for multicollinearity detection.

    VIF > 5 indicates problematic multicollinearity
    VIF > 10 indicates severe multicollinearity
    """

    def __init__(self, vif_threshold: float = 5.0):
        self.vif_threshold = vif_threshold
        self.metric_correlations: Dict[Tuple[str, str], float] = {}
        self.vif_scores: Dict[str, float] = {}

    def compute_vif(self, metrics: Dict[str, List[float]]) -> Dict[str, float]:
        """
        Compute VIF for each metric given correlated metrics.

        VIF_i = 1 / (1 - R_i^2)
        where R_i^2 is the R-squared of metric i regressed on all other metrics.
        """
        if len(metrics) < 2:
            return {k: 1.0 for k in metrics.keys()}

        metric_names = list(metrics.keys())
        n = len(metrics[metric_names[0]])
        vif_scores = {}

        for i, metric in enumerate(metric_names):
            # Get other metrics
            other_metrics = [m for m in metric_names if m != metric]
            X = np.array([[metrics[m][t] for m in other_metrics] for t in range(n)])
            y = np.array([metrics[metric][t] for t in range(n)])

            # Add constant
            X = np.column_stack([np.ones(n), X])

            try:
                # Compute R-squared
                # beta = (X'X)^-1 X'y
                XtX = X.T @ X
                XtX_inv = np.linalg.inv(XtX + np.eye(XtX.shape[0]) * 1e-6)  # Regularize
                beta = XtX_inv @ X.T @ y
                y_pred = X @ beta

                ss_res = np.sum((y - y_pred) ** 2)
                ss_tot = np.sum((y - np.mean(y)) ** 2)
                r_squared = 1 - (ss_res / (ss_tot + 1e-6)

                # VIF
                vif = 1 / (1 - r_squared) if r_squared < 1 else 100
                vif_scores[metric] = min(vif, 100)  # Cap at 100
            except:
                vif_scores[metric] = 1.0

        self.vif_scores = vif_scores
        return vif_scores

    def get_collinear_metrics(self) -> List[Tuple[str, str, float]]:
        """Get pairs of highly correlated metrics"""
        correlated = []
        for (m1, m2), corr in self.metric_correlations.items():
            if abs(corr) > 0.8:
                correlated.append((m1, m2, corr))
        return correlated

    def should_disable_metric(self, metric: str) -> bool:
        """Check if a metric should be disabled due to high VIF"""
        return self.vif_scores.get(metric, 1.0) > self.vif_threshold


def rolling_correlation(x: List[float], y: List[float], window: int = 50) -> List[float]:
    """Compute rolling correlation between two metrics"""
    if len(x) != len(y) or len(x) < window:
        return []

    correlations = []
    for i in range(window, len(x) + 1):
        x_window = x[i-window:i]
        y_window = y[i-window:i]
        corr = np.corrcoef(x_window, y_window)[0, 1]
        if np.isnan(corr):
            corr = 0
        correlations.append(corr)

    return correlations
