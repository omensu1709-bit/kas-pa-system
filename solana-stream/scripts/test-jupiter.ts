import axios from 'axios';

const JUPITER_PRICE_API = "https://api.jup.ag/price/v3";
const TRACKED_TOKENS = [
  "So11111111111111111111111111111111111111112",  // SOL
];

async function testJupiter() {
  console.log('Testing Jupiter v3 API...\n');

  try {
    const ids = TRACKED_TOKENS.join(",");
    console.log(`Request URL: ${JUPITER_PRICE_API}?ids=${ids}\n`);

    const response = await axios.get(`${JUPITER_PRICE_API}?ids=${ids}`, {
      timeout: 5000
    });

    console.log('Response status:', response.status);
    console.log('Response data:');
    console.log(JSON.stringify(response.data, null, 2));

    const data = response.data;
    if (data && data.data) {
      for (const [token, priceInfo] of Object.entries(data.data)) {
        const info = priceInfo as any;
        console.log(`\nToken: ${token}`);
        console.log(`  usdPrice: ${info.usdPrice}`);
        console.log(`  price: ${info.price}`);
        console.log(`  priceUsd: ${info.priceUsd}`);
        console.log(`  Full info:`, info);
      }
    } else {
      console.log('\nNo data.data in response!');
      console.log('Full response:', response.data);
    }
  } catch (e: any) {
    console.error('Error:', e.message);
    console.error('Response:', e.response?.data);
  }
}

testJupiter();
