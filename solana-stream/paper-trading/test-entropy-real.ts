import { PermutationEntropyMetric } from './src/metrics/entropy.js';

const entropy = new PermutationEntropyMetric();

// ZUFÄLLIGE Preise (realistischer für Memecoins)
const testPrices = [];
for (let i = 0; i < 19; i++) {
  testPrices.push(0.000002 + (Math.random() - 0.5) * 0.000001);
}

console.log("Test prices:", testPrices.map(p => p.toFixed(7)).join(', '));

for (const price of testPrices) {
  entropy.addPrice(price);
}

console.log("prices.length:", (entropy as any).prices.length);

const result = entropy.compute();
console.log("\nResult:", JSON.stringify(result, null, 2));
console.log("\nnormalizedEntropy:", result.normalizedEntropy);
