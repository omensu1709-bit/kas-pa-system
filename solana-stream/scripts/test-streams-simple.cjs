/**
 * Simple Connection Test Script
 * Tests Helius and Chainstack gRPC connections
 */

const https = require('https');
const net = require('net');

console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║          STREAM CONNECTION TEST                               ║
║          Testing Helius + Chainstack                         ║
╚═══════════════════════════════════════════════════════════════════╝
`);

// Configuration
const HELIUS_API_KEY = 'bdbceecb-7fca-4dcb-856d-a5e8c5cc38e9';
const CHAINSTACK_ENDPOINT = 'yellowstone-solana-mainnet.core.chainstack.com';

async function testHeliusGRPC() {
  console.log('\n[1/4] Testing Helius LaserStream gRPC...');

  return new Promise((resolve) => {
    // Helius gRPC uses port 443 like HTTPS
    const start = Date.now();

    const socket = net.connect(443, 'laserstream-mainnet-ewr.helius-rpc.com', () => {
      const latency = Date.now() - start;
      console.log(`  Port 443: OPEN`);
      console.log(`  Latency: ${latency}ms`);
      console.log(`  Status: ✅ CONNECTED (gRPC endpoint)`);
      socket.end();
      resolve({ success: true, latency });
    });

    socket.on('error', (e) => {
      console.log(`  Error: ${e.message}`);
      resolve({ success: false, latency: 0 });
    });

    socket.setTimeout(5000, () => {
      socket.destroy();
      console.log('  Timeout!');
      resolve({ success: false, latency: 5000 });
    });
  });
}

async function testChainstackRPC() {
  console.log('\n[2/4] Testing Chainstack HTTPS RPC...');

  return new Promise((resolve) => {
    const start = Date.now();

    const postData = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getSlot'
    });

    const options = {
      hostname: 'solana-mainnet.core.chainstack.com',
      port: 443,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': 'Basic ' + Buffer.from('friendly-mcclintock:armed-stamp-reuse-grudge-armful-script').toString('base64')
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const latency = Date.now() - start;
        try {
          const json = JSON.parse(data);
          const slot = json.result;
          console.log(`  HTTP Status: ${res.statusCode}`);
          console.log(`  Current Slot: ${slot}`);
          console.log(`  Latency: ${latency}ms`);
          console.log(`  Status: ${slot ? '✅ CONNECTED' : '❌ FAILED'}`);
          resolve({ success: !!slot, latency, slot });
        } catch (e) {
          console.log(`  Parse Error: ${e.message}`);
          resolve({ success: false, latency });
        }
      });
    });

    req.on('error', (e) => {
      console.log(`  Error: ${e.message}`);
      resolve({ success: false, latency: 0 });
    });

    req.write(postData);
    req.end();
  });
}

async function testSolanaSlot() {
  console.log('\n[3/4] Testing Solana Mainnet RPC...');

  return new Promise((resolve) => {
    const start = Date.now();

    const postData = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getSlot'
    });

    const options = {
      hostname: 'api.mainnet-beta.solana.com',
      port: 443,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const latency = Date.now() - start;
        try {
          const json = JSON.parse(data);
          const slot = json.result;
          console.log(`  HTTP Status: ${res.statusCode}`);
          console.log(`  Current Slot: ${slot}`);
          console.log(`  Latency: ${latency}ms`);
          console.log(`  Status: ${slot ? '✅ CONNECTED' : '❌ FAILED'}`);
          resolve({ success: !!slot, latency, slot });
        } catch (e) {
          console.log(`  Parse Error: ${e.message}`);
          resolve({ success: false, latency });
        }
      });
    });

    req.on('error', (e) => {
      console.log(`  Error: ${e.message}`);
      resolve({ success: false, latency: 0 });
    });

    req.write(postData);
    req.end();
  });
}

function testLatency() {
  console.log('\n[4/4] Testing Network Latency (ICMP)...');

  const { execSync } = require('child_process');

  // Helius
  try {
    const heliusPing = execSync('ping -c 3 -W 1 laserstream-mainnet-ewr.helius-rpc.com 2>/dev/null', { encoding: 'utf8' });
    if (heliusPing.includes('min/avg/max')) {
      const match = heliusPing.match(/(\d+\.\d+)\/(\d+\.\d+)\/(\d+\.\d+)/);
      if (match) {
        console.log(`  Helius RTT: min=${match[1]}ms avg=${match[2]}ms max=${match[3]}ms`);
      }
    }
  } catch (e) {
    console.log('  Helius ping: FAILED');
  }

  // Chainstack
  try {
    const chainstackPing = execSync('ping -c 3 -W 1 yellowstone-solana-mainnet.core.chainstack.com 2>/dev/null', { encoding: 'utf8' });
    if (chainstackPing.includes('min/avg/max')) {
      const match = chainstackPing.match(/(\d+\.\d+)\/(\d+\.\d+)\/(\d+\.\d+)/);
      if (match) {
        console.log(`  Chainstack RTT: min=${match[1]}ms avg=${match[2]}ms max=${match[3]}ms`);
      }
    }
  } catch (e) {
    console.log('  Chainstack ping: FAILED (may be blocking ICMP)');
  }
}

async function main() {
  console.log('\nConfiguration:');
  console.log(`  Helius API Key: ${HELIUS_API_KEY.substring(0, 8)}...`);
  console.log(`  Chainstack: ${CHAINSTACK_ENDPOINT}`);

  const helius = await testHeliusGRPC();
  const chainstack = await testChainstackRPC();
  const solana = await testSolanaSlot();
  testLatency();

  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║          SUMMARY                                                 ║
╠═══════════════════════════════════════════════════════════════════╣
║  Helius LaserStream:   ${helius.success ? '✅ CONNECTED' : '❌ FAILED'}                            ║
║  Chainstack HTTPS:     ${chainstack.success ? '✅ CONNECTED' : '❌ FAILED'}                             ║
║  Solana Mainnet:      ${solana.success ? '✅ CONNECTED' : '❌ FAILED'}                             ║
╠═══════════════════════════════════════════════════════════════════╣`);

  if (helius.success && chainstack.success && solana.success) {
    console.log(`║  ✅ ALL CONNECTIONS SUCCESSFUL!                                  ║`);
    console.log(`║                                                                 ║`);
    console.log(`║  Latency Summary:                                                 ║`);
    console.log(`║    Helius:     ~${helius.latency}ms                                      ║`);
    console.log(`║    Chainstack:  ~${chainstack.latency}ms                                       ║`);
    console.log(`║    Solana:     ~${solana.latency}ms                                        ║`);
    console.log(`║                                                                 ║`);
    console.log(`║  Next Steps:                                                    ║`);
    console.log(`║  1. Run: docker-compose up -d                                  ║`);
    console.log(`║  2. Monitor: docker-compose logs -f                           ║`);
    console.log(`╚═══════════════════════════════════════════════════════════════════╝`);
  } else {
    console.log(`║  ⚠️  SOME CONNECTIONS FAILED                                     ║`);
    console.log(`╚═══════════════════════════════════════════════════════════════════╝`);
  }
}

main().catch(console.error);
