/**
 * JUPITER PERPS - CORRECT PRICES
 * Synthetische Perpetuals tracken Underlying-Preise
 */
import axios from 'axios';

const KNOWN_PRICES = {
  'BTC': 62000,  // Approximativer BTC Preis
  'ETH': 3400,
  'SOL': 84,
  'BONK': 0.000025,  // BONK in USD
  'WIF': 1.85,
  'POPCAT': 0.62,
};

async function testJupiterPerps() {
  console.log('Testing Jupiter Perps Price Structure...\n');

  // Jupiter Perps haben synthetische Mints
  // Für Ranking nutzen wir die Underlying-Preise

  const testTokens = [
    { symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112' },
    { symbol: 'BTC', mint: '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E' },
    { symbol: 'ETH', mint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs' },
  ];

  try {
    const response = await axios.get('https://api.jup.ag/price/v3', {
      params: { ids: testTokens.map(t => t.mint).join(',') },
      timeout: 10000
    });

    console.log('Jupiter API Response:\n');
    for (const token of testTokens) {
      const data = response.data[token.mint];
      console.log(`${token.symbol}:`);
      console.log(`  Mint: ${token.mint}`);
      console.log(`  usdPrice from API: ${data?.usdPrice}`);
      console.log(`  Expected USD: $${KNOWN_PRICES[token.symbol as keyof typeof KNOWN_PRICES]}`);
      console.log('');
    }
  } catch (e: any) {
    console.error('Error:', e.message);
  }
}

testJupiterPerps();
