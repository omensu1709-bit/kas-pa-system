import { PermutationEntropyMetric } from './src/metrics/entropy.js';

const entropy = new PermutationEntropyMetric();

// Simuliere 20 Preise mit kleinem Noise (wie im echten System)
const basePrice = 0.000002;

for (let i = 0; i < 20; i++) {
  const noiseMultiplier = 1 + (Math.random() * 0.0001);
  const price = basePrice * noiseMultiplier;
  entropy.addPrice(price);
}

console.log("prices.length:", (entropy as any).prices.length);
console.log("prices:", (entropy as any).prices.slice(-5).map(p => p.toFixed(10)));

const result = entropy.compute();
console.log("\nnormalizedEntropy:", result.normalizedEntropy);
console.log("metadata:", JSON.stringify(result.metadata, null, 2));
