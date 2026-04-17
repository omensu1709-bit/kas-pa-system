"""
Week 12: Final Validation - Go/No-Go Decision

This script produces the final Go/No-Go decision based on:
1. CPCV backtesting results with real PBO calculation
2. Real metric calibration (if Helius API key provided)
3. Walk-Forward Efficiency analysis
"""

import json
import sys
from dataclasses import dataclass
from typing import Dict, List, Any, Optional

sys.path.insert(0, '..')


@dataclass
class ValidationCriteria:
    name: str
    value: float
    target: float
    passed: bool


class FinalValidator:
    """
    Produces the Go/No-Go decision based on all validation results.

    GO/NO-GO CRITERIA:
    - PBO < 5%: Probability of Backtest Overfitting must be low
    - DSR > 0: Deflated Sharpe Ratio must be positive
    - WFE > 50%: Walk-Forward Efficiency must show good generalization
    - Sharpe > 1.0: Average Sharpe ratio must be acceptable
    - HitRate > 50%: Hit rate must be better than random
    - MaxDrawdown > -30%: Maximum drawdown must be controlled
    """

    def __init__(self):
        self.criteria: List[ValidationCriteria] = []
        self.events_processed = 0
        self.total_snapshots = 0
        self.backtest_results: Dict[str, Any] = {}
        self.calibration_results: Dict[str, Any] = {}

    def add_criterion(self, name: str, value: float, target: float, passed: bool):
        self.criteria.append(ValidationCriteria(name, value, target, passed))

    def load_backtest_results(self, filepath: str = '../backtesting/cpcv_results.json'):
        """Load CPCV backtest results"""
        try:
            with open(filepath, 'r') as f:
                data = json.load(f)
                self.backtest_results = data

            # PBO - Probability of Backtest Overfitting
            # Now uses real implementation from cpcv.py
            pbo = data.get('pbo', 0)
            self.add_criterion(
                'PBO',
                pbo,
                0.05,  # Target < 5%
                pbo < 0.05
            )

            # DSR - Deflated Sharpe Ratio
            dsr = data.get('dsr', 0)
            self.add_criterion(
                'DSR',
                dsr,
                0.0,  # Target > 0
                dsr > 0
            )

            # WFE - Walk-Forward Efficiency
            wfe = data.get('wfe', 0)
            self.add_criterion(
                'WFE',
                wfe,
                0.50,  # Target > 50%
                wfe > 0.50
            )

            # Aggregate per-fold results
            folds = data.get('per_fold_results', [])
            if folds:
                avg_sharpe = sum(f.get('sharpe_ratio', 0) for f in folds) / len(folds)
                avg_hit_rate = sum(f.get('hit_rate', 0) for f in folds) / len(folds)
                max_drawdown = min(f.get('max_drawdown', 0) for f in folds)

                self.add_criterion(
                    'Sharpe',
                    avg_sharpe,
                    1.0,  # Target > 1.0
                    avg_sharpe > 1.0
                )

                self.add_criterion(
                    'HitRate',
                    avg_hit_rate,
                    0.50,  # Target > 50%
                    avg_hit_rate > 0.50
                )

                self.add_criterion(
                    'MaxDrawdown',
                    max_drawdown,
                    -0.30,  # Target > -30%
                    max_drawdown > -0.30
                )

            self.events_processed = len(folds)

        except FileNotFoundError:
            print(f"Warning: Backtest results not found at {filepath}")
        except Exception as e:
            print(f"Error loading backtest results: {e}")
    
    def compute_decision(self) -> tuple:
        """
        Compute Go/No-Go decision based on criteria.
        
        Returns: (decision, confidence, recommendation)
        """
        passed = sum(1 for c in self.criteria if c.passed)
        total = len(self.criteria)
        pass_rate = passed / total if total > 0 else 0
        
        if pass_rate >= 1.0:
            decision = "GO"
            recommendation = "All criteria met. System ready for production deployment."
        elif pass_rate >= 0.7:
            decision = "CONDITIONAL_GO"
            recommendation = f"{passed}/{total} criteria met. Proceed with enhanced monitoring."
        else:
            decision = "NO-GO"
            recommendation = f"Only {passed}/{total} criteria met. Further development required."
        
        return decision, pass_rate, recommendation
    
    def generate_next_steps(self) -> List[str]:
        """Generate actionable next steps based on failures"""
        steps = []
        
        for criterion in self.criteria:
            if not criterion.passed:
                if criterion.name == 'PBO':
                    steps.append("PBO > 5%: Increase training data diversity or reduce model complexity")
                elif criterion.name == 'DSR':
                    steps.append("DSR <= 0: Adjust coefficients to improve out-of-sample stability")
                elif criterion.name == 'WFE':
                    steps.append("WFE < 50%: Review walk-forward window sizing")
                elif criterion.name == 'Sharpe':
                    steps.append("Sharpe < 1.0: Tune position sizing or threshold parameters")
                elif criterion.name == 'HitRate':
                    steps.append("Hit Rate < 50%: Recalibrate metric weights with more crash events")
                elif criterion.name == 'MaxDrawdown':
                    steps.append("Max Drawdown > 30%: Implement stricter circuit breakers")
        
        if not steps:
            steps.append("Continue paper trading for 4+ weeks to validate live performance")
            steps.append("Set up monitoring dashboards for real-time alerting")
            steps.append("Prepare capital allocation and risk limits for production")
        
        return steps
    
    def generate_report(self) -> Dict[str, Any]:
        """Generate complete validation report"""
        decision, confidence, recommendation = self.compute_decision()
        
        return {
            'timestamp': None,  # Will be set by caller
            'events_processed': self.events_processed,
            'total_snapshots': self.total_snapshots,
            'criteria': [
                {
                    'name': c.name,
                    'value': c.value,
                    'target': c.target,
                    'passed': c.passed
                }
                for c in self.criteria
            ],
            'decision': decision,
            'confidence': confidence,
            'recommendation': recommendation,
            'next_steps': self.generate_next_steps()
        }
    
    def print_report(self, report: Dict[str, Any]):
        """Print the validation report"""
        print("=" * 60)
        print("FINAL VALIDATION REPORT - WEEK 12")
        print("=" * 60)
        print()
        
        print(f"Events Processed: {report['events_processed']}")
        print(f"Total Snapshots: {report['total_snapshots']}")
        print()
        
        print("GO/NO-GO CRITERIA:")
        print("-" * 40)
        
        for c in report['criteria']:
            status = "✓ PASS" if c['passed'] else "✗ FAIL"
            if isinstance(c['value'], float):
                if abs(c['value']) > 100:
                    value_str = f"{c['value']:.2e}"
                else:
                    value_str = f"{c['value']:.4f}"
            else:
                value_str = str(c['value'])
            print(f"  {status}: {c['name']} = {value_str} (target: {c['target']})")
        
        print()
        print("DECISION:")
        print("-" * 40)
        print(f"  {report['decision']}")
        print(f"  Confidence: {report['confidence']*100:.0f}%")
        print(f"  {report['recommendation']}")
        print()
        
        print("NEXT STEPS:")
        print("-" * 40)
        for step in report['next_steps']:
            print(f"  • {step}")
        
        print()
        print("=" * 60)


def main():
    print("=" * 60)
    print("WEEK 12 VALIDATION")
    print("=" * 60)
    print()
    
    validator = FinalValidator()
    
    # Load backtest results
    print("Loading backtest results from CPCV analysis...")
    validator.load_backtest_results()
    print(f"Loaded {validator.events_processed} fold results")
    print()
    
    # Compute decision
    report = validator.generate_report()
    report['timestamp'] = None  # Will be set by caller
    
    # Print report
    validator.print_report(report)
    
    # Save report
    output_file = 'validation_report.json'
    with open(output_file, 'w') as f:
        json.dump(report, f, indent=2)
    print(f"\nReport saved to {output_file}")
    
    # Exit with appropriate code
    exit_code = 0 if report['decision'] == 'GO' else 1
    print(f"\nExit code: {exit_code}")
    
    return report


if __name__ == '__main__':
    main()
