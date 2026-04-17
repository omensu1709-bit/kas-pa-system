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
export { HawkesMetric } from './hawkes.js';
export { PermutationEntropyMetric } from './entropy.js';
export { GraphMetric } from './graph.js';
export { EpidemicMetric } from './epidemic.js';
export { GutenbergRichterMetric } from './seismic.js';
export { TransferEntropyMetric } from './transfer.js';
export { SuperspreaderMetric } from './superspreader.js';
export { LiquidityImpactMetric } from './liquidity.js';
export interface MetricResult {
    name: string;
    value: number;
    zScore: number;
    raw: any;
    timestamp: number;
    slot: number;
}
export interface CrashMetrics {
    n: number;
    PE: number;
    kappa: number;
    fragmentation: number;
    rt: number;
    bValue: number;
    CTE: number;
    SSI: number;
    LFI: number;
    z_n: number;
    z_PE: number;
    z_kappa: number;
    z_fragmentation: number;
    z_rt: number;
    z_bValue: number;
    z_CTE: number;
    z_SSI: number;
    z_LFI: number;
    crashProbability: number;
    confirmingMetrics: number;
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
export declare const METRIC_COEFFICIENTS: {
    beta0: number;
    beta1_kappa: number;
    beta2_rt: number;
    beta3_PE: number;
    beta4_CTE: number;
    beta5_bValue: number;
    beta6_n: number;
    beta7_fragmentation: number;
    beta8_SSI: number;
    beta9_LFI: number;
    gamma1_kappa_n: number;
    gamma2_PE_fragmentation: number;
    gamma3_LFI_SSI: number;
};
/**
 * Compute crash probability from z-scores
 */
export declare function computeCrashProbability(z: {
    n: number;
    PE: number;
    kappa: number;
    fragmentation: number;
    rt: number;
    bValue: number;
    CTE: number;
    SSI: number;
    LFI: number;
}): {
    probability: number;
    confirmingMetrics: string[];
};
//# sourceMappingURL=index.d.ts.map