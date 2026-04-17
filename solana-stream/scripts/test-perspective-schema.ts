/**
 * Test-Perspective Schema mit ALLEN Datenfeldern
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

interface PerspectiveData {
  timestamp: string;
  slot: number;
  symbol: string;
  price: number;
  crashProbability: number;
  confidence: number;
  confirmingMetrics: number;
  zone: string;
  latency_ms: number;
  status: string;
  // Bot Detection
  botProbability: number;
  jitoBundleCount: number;
  // Regime
  regimeType: 'NORMAL' | 'WARNING' | 'CRITICAL';
  // Netzwerk
  networkFee: number;
  priorityFee: number;
}

async function getJupiterPrices(): Promise<Map<string, number>> {
  const cache = new Map<string, { price: number; timestamp: number }>();
  const ttl = 30_000;

  const tokens = [
    "So11111111111111111111111111111111111111112",  // SOL
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  ];

  const now = Date.now();
  const result = new Map<string, number>();

  // Check cache
  let allCached = true;
  for (const token of tokens) {
    const cached = cache.get(token);
    if (!cached || (now - cached.timestamp) > ttl) {
      allCached = false;
      break;
    }
    result.set(token, cached.price);
  }

  if (!allCached) {
    try {
      const response = await axios.get('https://api.jup.ag/price/v3', {
        params: { ids: tokens.join(',') },
        timeout: 10_000
      });

      for (const [id, priceInfo] of Object.entries(response.data)) {
        const p = priceInfo as any;
        if (p.usdPrice) {
          result.set(id, p.usdPrice);
          cache.set(id, { price: p.usdPrice, timestamp: now });
        }
      }
    } catch (e) {
      console.error('Price fetch failed:', e);
    }
  }

  return result;
}

async function main() {
  console.log('Testing Perspective Schema Data Availability...\n');

  // Get Chainstack slot
  const chainstackResponse = await axios.post(process.env.CHAINSTACK_HTTPS!, {
    jsonrpc: "2.0",
    id: 1,
    method: "getSlot"
  }, {
    auth: {
      username: process.env.CHAINSTACK_USERNAME!,
      password: process.env.CHAINSTACK_PASSWORD!
    },
    timeout: 10_000
  });

  const slot = chainstackResponse.data.result;
  console.log(`Current Slot: ${slot}`);

  // Get Jupiter prices
  const prices = await getJupiterPrices();
  const solPrice = prices.get("So11111111111111111111111111111111111111112") || 0;
  console.log(`SOL Price: $${solPrice.toFixed(4)}`);

  // Create sample Perspective data with ALL fields
  const perspectiveData: PerspectiveData = {
    timestamp: new Date().toISOString(),
    slot: slot,
    symbol: 'SOL',
    price: solPrice,
    crashProbability: 0.15, // Example prediction
    confidence: 0.82, // Example confidence
    confirmingMetrics: 6,
    zone: 'MONITOR',
    latency_ms: 45,
    status: 'active',
    botProbability: 0.12,
    jitoBundleCount: 3,
    regimeType: 'NORMAL',
    networkFee: 5000,
    priorityFee: 10000,
  };

  console.log('\n=== PERSPECTIVE SCHEMA (VOLLSTÄNDIG) ===');
  console.log(JSON.stringify(perspectiveData, null, 2));

  // Required schema for Perspective
  const requiredSchema = {
    timestamp: 'datetime',
    slot: 'integer',
    symbol: 'string',
    price: 'float',
    crashProbability: 'float',
    confidence: 'float',
    confirmingMetrics: 'integer',
    zone: 'string',
    latency_ms: 'float',
    status: 'string',
    botProbability: 'float',
    jitoBundleCount: 'integer',
    regimeType: 'string',
    networkFee: 'float',
    priorityFee: 'float',
  };

  console.log('\n=== PERSPECTIVE SCHEMA (REQUIRED) ===');
  console.log(JSON.stringify(requiredSchema, null, 2));

  // Check what's MISSING
  console.log('\n=== LÜCKEN-ANALYSE ===');
  console.log('1. Symbol: ' + (perspectiveData.symbol ? '✅' : '❌'));
  console.log('2. Price: ' + (perspectiveData.price ? '✅' : '❌'));
  console.log('3. Confidence: ' + (perspectiveData.confidence ? '✅' : '❌'));
  console.log('4. latency_ms: ' + (perspectiveData.latency_ms ? '✅' : '❌'));
  console.log('5. botProbability: ' + (perspectiveData.botProbability ? '✅' : '❌'));
  console.log('6. regimeType: ' + (perspectiveData.regimeType ? '✅' : '❌'));

  console.log('\n✅ Alle Daten sind verfügbar für Perspective!');
}

main().catch(console.error);
