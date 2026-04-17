/**
 * Get REAL token mints from Jupiter API
 */

import axios from 'axios';

async function getJupiterTokens() {
  console.log('=== GETTING REAL TOKEN MINTS FROM JUPITER ===\n');
  
  try {
    // Get all tokens from Jupiter
    const resp = await axios.get('https://api.jup.ag/v6/tokens', { timeout: 15000 });
    const tokens = resp.data;
    
    console.log(`Total Jupiter tokens: ${tokens.length}`);
    
    // Find our target tokens
    const targets = ['SOL', 'BTC', 'ETH', 'BONK', 'WIF', 'POPCAT', 'FWOG', 'MEW', 'SLERF', 'PNUT', 'AI16Z', 'BLZE', 'MOG', 'TNSR', 'RLB'];
    
    console.log('\n=== FOUND TOKENS ===');
    for (const symbol of targets) {
      const token = tokens.find((t: any) => t.symbol === symbol || t.symbol === symbol.toUpperCase());
      if (token) {
        console.log(`✓ ${token.symbol}: ${token.address}`);
      } else {
        console.log(`✗ ${symbol}: NOT FOUND`);
      }
    }
    
    // Also search for popular memecoins
    console.log('\n=== POPULAR MEMECOINS ===');
    const memecoins = ['POPCAT', 'FWOG', 'SLERF', 'BOME', 'LISTA', 'TRUMP', 'MELANIA', 'SEND', 'SC'];
    for (const symbol of memecoins) {
      const token = tokens.find((t: any) => 
        t.symbol?.toUpperCase().includes(symbol.toUpperCase())
      );
      if (token) {
        console.log(`✓ ${token.symbol}: ${token.address}`);
      } else {
        console.log(`✗ ${symbol}: NOT FOUND`);
      }
    }
    
  } catch (e: any) {
    console.error('Error:', e.message);
  }
}

getJupiterTokens().catch(console.error);
