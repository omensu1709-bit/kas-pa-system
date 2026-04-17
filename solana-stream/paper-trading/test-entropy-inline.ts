import { PermutationEntropyMetric } from './src/metrics/entropy.js';

// Test mit 19 Preisen (wie im echten System)
const entropy = new PermutationEntropyMetric();

// Simuliere 19 Preise hinzufügen
const testPrices = [
  0.0000028, 0.0000027, 0.0000026, 0.0000025, 0.0000024,
  0.0000023, 0.0000022, 0.0000021, 0.0000020, 0.0000019,
  0.0000018, 0.0000017, 0.0000016, 0.0000015, 0.0000014,
  0.0000013, 0.0000012, 0.0000011, 0.0000010
];

console.log("Test prices length:", testPrices.length);

for (const price of testPrices) {
  entropy.addPrice(price);
}

console.log("prices.length:", (entropy as any).prices.length);

console.log("\n=== COMPUTE RESULT ===");
const result = entropy.compute();
console.log("Result:", JSON.stringify(result, null, 2));
console.log("\nnormalizedEntropy:", result.normalizedEntropy);
