/**
 * Crash Detection Metrics - Complete 9-Metric System
 * 
 * Each metric captures a different failure mode in the Solana ecosystem:
 * 
 * 1. Hawkes branching ratio (n) - Self-excitation in transaction stream
 * 2. Permutation entropy (PE) - Information regime shifts
 * 3. Molloy-Reed ratio (κ) - Network structural stability
 * 4. Giant component fragmentation (S₂/S₁) - Percolation phase transitions
 * 5. Epidemic R_t - Contagion dynamics
 * 6. Gutenberg-Richter b-value - Stress buildup detection
 * 7. Transfer entropy clustering (C_TE) - Herding behavior
 * 8. Superspreader activation (SSI) - Whale activity
 * 9. Liquidity impact deviation (LFI) - Liquidity evaporation
 */

export { HawkesMetric } from './hawkes.ts';
export { PermutationEntropyMetric } from './entropy.ts';
export { GraphMetric } from './graph.ts';
export { EpidemicMetric } from './epidemic.ts';
export { GutenbergRichterMetric } from './seismic.ts';
export { TransferEntropyMetric } from './transfer.ts';
export { SuperspreaderMetric } from './superspreader.ts';
export { LiquidityImpactMetric } from './liquidity.ts';

export interface MetricResult {
  name: string;
  value: number;
  zScore: number;
  raw: any;
  timestamp: number;
  slot: number;
}

export interface CrashMetrics {
  // Raw metric values
  n: number;           // Hawkes branching ratio
  PE: number;          // Permutation entropy
  kappa: number;       // Molloy-Reed ratio
  fragmentation: number; // S₂/S₁
  rt: number;          // Epidemic R_t
  bValue: number;      // Gutenberg-Richter b
  CTE: number;         // Transfer entropy clustering
  SSI: number;         // Superspreader activation
  LFI: number;         // Liquidity impact deviation
  
  // Z-scores (normalized)
  z_n: number;
  z_PE: number;
  z_kappa: number;
  z_fragmentation: number;
  z_rt: number;
  z_bValue: number;
  z_CTE: number;
  z_SSI: number;
  z_LFI: number;
  
  // Crash probability
  crashProbability: number;
  confirmingMetrics: number;
  
  // Metadata
  slot: number;
  timestamp: number;
}

/**
 * The crash probability formula from the research:
 * 
 * z(t) = β₀ + β₁·κ̃ + β₂·R̃t + β₃·P̃E + β₄·C̃TE + β₅·b̃f + β₆·ñ + β₇·(S̃₂/S₁) + β₈·S̃SI + β₉·L̃FI
 *       + γ₁·κ̃·ñ + γ₂·P̃E·(S̃₂/S₁) + γ₃·L̃FI·S̃SI
 *
 * P(crash_3pct_24h) = 1 / (1 + exp(-z(t)))
 */

// Initial coefficient estimates (must be refined through backtesting)
export const METRIC_COEFFICIENTS = {
  // Main effects (β)
  beta0: -4.50,    // Bias
  beta1_kappa: -1.75,   // κ - negative because declining κ is dangerous
  beta2_rt: 1.75,       // R_t - positive because rising is dangerous
  beta3_PE: -2.25,      // PE - negative because declining PE is dangerous
  beta4_CTE: 1.25,      // C_TE - positive because rising is dangerous
  beta5_bValue: -1.75,  // b - negative because declining is dangerous
  beta6_n: 2.75,        // n - positive because n→1 is dangerous
  beta7_fragmentation: 2.25, // S₂/S₁ - positive because rising is dangerous
  beta8_SSI: 1.25,      // SSI - positive because rising is dangerous
  beta9_LFI: 1.75,      // LFI - positive because rising is dangerous
  
  // Interaction terms (γ)
  gamma1_kappa_n: 1.00,     // κ × n
  gamma2_PE_fragmentation: 0.75, // PE × S₂/S₁
  gamma3_LFI_SSI: 0.75,     // LFI × SSI
};

/**
 * Compute crash probability from z-scores
 */
export function computeCrashProbability(z: {
  n: number;
  PE: number;
  kappa: number;
  fragmentation: number;
  rt: number;
  bValue: number;
  CTE: number;
  SSI: number;
  LFI: number;
}): { probability: number; confirmingMetrics: string[] } {
  const c = METRIC_COEFFICIENTS;
  
  const z_n = z.n;
  const z_PE = z.PE;
  const z_kappa = z.kappa;
  const z_frag = z.fragmentation;
  const z_rt = z.rt;
  const z_bValue = z.bValue;
  const z_CTE = z.CTE;
  const z_SSI = z.SSI;
  const z_LFI = z.LFI;
  
  // Compute linear predictor
  const linearPredictor = 
    c.beta0 +
    c.beta1_kappa * z_kappa +
    c.beta2_rt * z_rt +
    c.beta3_PE * z_PE +
    c.beta4_CTE * z_CTE +
    c.beta5_bValue * z_bValue +
    c.beta6_n * z_n +
    c.beta7_fragmentation * z_frag +
    c.beta8_SSI * z_SSI +
    c.beta9_LFI * z_LFI +
    c.gamma1_kappa_n * z_kappa * z_n +
    c.gamma2_PE_fragmentation * z_PE * z_frag +
    c.gamma3_LFI_SSI * z_LFI * z_SSI;
  
  // Sigmoid
  const probability = 1 / (1 + Math.exp(-linearPredictor));
  
  // Count confirming metrics (|z| > 1.5 typically indicates danger)
  const confirmingMetrics: string[] = [];
  if (z_n > 1.5) confirmingMetrics.push('n');
  if (z_PE < -1.5) confirmingMetrics.push('PE');
  if (z_kappa < -1.5) confirmingMetrics.push('kappa');
  if (z_frag > 1.5) confirmingMetrics.push('fragmentation');
  if (z_rt > 1.5) confirmingMetrics.push('rt');
  if (z_bValue < -1.5) confirmingMetrics.push('bValue');
  if (z_CTE > 1.5) confirmingMetrics.push('CTE');
  if (z_SSI > 1.5) confirmingMetrics.push('SSI');
  if (z_LFI > 1.5) confirmingMetrics.push('LFI');
  
  return { probability, confirmingMetrics };
}
