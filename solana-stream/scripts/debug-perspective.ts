/**
 * KAS PA - Perspective.js Debug Script
 * Tests the complete flow locally
 */

import { WebSocket } from 'ws';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('=== PERSPECTIVE.JS DEBUG TEST ===\n');

  // 1. Check Vite Server
  console.log('[1] Vite Dev Server');
  try {
    const response = await axios.get('http://localhost:5173', { timeout: 5000 });
    console.log(`    Status: ${response.status}`);
    console.log(`    HTML Size: ${response.data.length} bytes`);
  } catch (e: any) {
    console.log(`    ERROR: ${e.message}`);
  }

  // 2. Check WASM file accessibility
  console.log('\n[2] WASM File Accessibility');
  const wasmUrls = [
    'http://localhost:5173/node_modules/@finos/perspective/dist/wasm/perspective-js.wasm',
    'http://localhost:5173/node_modules/@finos/perspective/dist/wasm/perspective-server.wasm',
  ];
  for (const url of wasmUrls) {
    try {
      const response = await axios.head(url, { timeout: 5000 });
      console.log(`    ${url.split('/').pop()}: ${response.status}`);
    } catch (e: any) {
      console.log(`    ${url.split('/').pop()}: ${e.response?.status || e.message}`);
    }
  }

  // 3. Check WebSocket
  console.log('\n[3] WebSocket Backend');
  try {
    const ws = new WebSocket('ws://localhost:8080');
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
      setTimeout(() => reject(new Error('Timeout')), 5000);
    });
    console.log('    Connected successfully');

    // Get one message
    await new Promise((resolve) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        console.log(`    Message type: ${msg.type}`);
        console.log(`    Has prediction: ${!!msg.latestPrediction}`);
        if (msg.latestPrediction) {
          console.log(`    crashProbability: ${msg.latestPrediction.crashProbability}`);
          console.log(`    rawMetrics.price: ${msg.latestPrediction.rawMetrics?.price}`);
        }
        resolve(null);
      });
    });

    ws.close();
  } catch (e: any) {
    console.log(`    ERROR: ${e.message}`);
  }

  // 4. Summary
  console.log('\n=== DIAGNOSIS ===');
  console.log('If WASM files return 404, the exclude config is correct but files are not served.');
  console.log('If WebSocket fails, the backend is not running.');
  console.log('\nPossible fixes:');
  console.log('1. If WASM 404: The exclude is working - files should be served directly');
  console.log('2. If WASM works but still hangs: WASM loads but custom element registration fails');
  console.log('3. Check browser Network tab for failed requests');
}

main().catch(console.error);
