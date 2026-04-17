import axios from 'axios';

async function testJupiter() {
  console.log('Testing Jupiter API for correct prices...\n');

  // Test SOL first (known to work)
  const tokens = [
    'So11111111111111111111111111111111111111112', // SOL
    '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E', // BTC
    '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', // ETH
    'EKpQGSJtjMFqFK9v1ZfG4s7T7TnKhwK5V4mVWcqDmK4x', // WIF
    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
  ];

  try {
    const response = await axios.get('https://api.jup.ag/price/v3', {
      params: { ids: tokens.join(',') },
      timeout: 10000
    });

    console.log('Response from Jupiter API:\n');
    for (const [mint, data] of Object.entries(response.data)) {
      const d = data as any;
      console.log(`  Mint: ${mint.substring(0, 30)}...`);
      console.log(`    usdPrice: ${d.usdPrice}`);
      console.log(`    price: ${d.price}`);
      console.log(`    priceUsd: ${d.priceUsd}`);
      console.log('');
    }
  } catch (e: any) {
    console.error('Error:', e.message);
  }
}

testJupiter();
