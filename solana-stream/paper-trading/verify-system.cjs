#!/usr/bin/env node
/**
 * KAS PA v4.2 - System Verification Script
 * Prueft alle Komponenten und gibt Status zurück
 */

const http = require('http');
const WebSocket = require('ws');

const PORTS = {
  backend: 8080,
  unified: 3000
};

function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}`, (res) => {
      resolve({ port, status: 'open', statusCode: res.statusCode });
    });
    req.on('error', (e) => {
      resolve({ port, status: 'closed', error: e.code });
    });
    req.setTimeout(2000, () => {
      req.destroy();
      resolve({ port, status: 'timeout' });
    });
  });
}

function checkWebSocket(port) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    const timeout = setTimeout(() => {
      ws.close();
      resolve({ port, wsStatus: 'timeout' });
    }, 3000);
    ws.on('open', () => {
      clearTimeout(timeout);
      ws.close();
      resolve({ port, wsStatus: 'connected' });
    });
    ws.on('error', (e) => {
      clearTimeout(timeout);
      resolve({ port, wsStatus: 'error', error: e.code });
    });
  });
}

function checkHTTP(port, path = '/health') {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ port, path, httpStatus: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ port, path, httpStatus: res.statusCode, data: data.substring(0, 100) });
        }
      });
    });
    req.on('error', (e) => resolve({ port, path, error: e.code }));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve({ port, path, error: 'timeout' });
    });
  });
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║      KAS PA v4.2 - SYSTEM VERIFICATION                ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');

  // Parallel checks
  const [portBackend, portUnified] = await Promise.all([
    checkPort(PORTS.backend),
    checkPort(PORTS.unified)
  ]);

  const [wsBackend, wsUnified] = await Promise.all([
    checkWebSocket(PORTS.backend),
    checkWebSocket(PORTS.unified)
  ]);

  const [healthUnified] = await Promise.all([
    checkHTTP(PORTS.unified, '/latest')
  ]);

  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│ PORT STATUS                                            │');
  console.log('├─────────────────────────────────────────────────────────┤');
  console.log(`│ Backend  (8080): ${portBackend.status === 'open' ? '✅ OPEN  ' : '❌ CLOSED'}  │`);
  console.log(`│ Unified  (3000): ${portUnified.status === 'open' ? '✅ OPEN  ' : '❌ CLOSED'}  │`);
  console.log('├─────────────────────────────────────────────────────────┤');
  console.log('│ WEBSOCKET STATUS                                       │');
  console.log('├─────────────────────────────────────────────────────────┤');
  console.log(`│ Backend  WS:  ${wsBackend.wsStatus === 'connected' ? '✅ CONNECTED' : '❌ ' + wsBackend.wsStatus}  │`);
  console.log(`│ Unified  WS:  ${wsUnified.wsStatus === 'connected' ? '✅ CONNECTED' : '❌ ' + wsUnified.wsStatus}  │`);
  console.log('└─────────────────────────────────────────────────────────┘');
  console.log('');

  if (healthUnified.data) {
    const d = healthUnified.data;
    const tel = d.telemetry || {};
    const pred = d.latestPrediction || {};
    const perf = d.performance || {};
    const health = d.backendHealth || {};

    console.log('┌─────────────────────────────────────────────────────────┐');
    console.log('│ LIVE DATA                                              │');
    console.log('├─────────────────────────────────────────────────────────┤');
    console.log(`│ Uptime:     ${String(Math.floor((health.uptimeSeconds || 0)/60) + 'min').padEnd(10)} │`);
    console.log(`│ Cycles:     ${String(health.cycleNumber || 0).padEnd(10)} │`);
    console.log(`│ CrashProb:  ${String((pred.crashProbability || 0).toFixed(3)).padEnd(10)} │`);
    console.log(`│ Zone:       ${String(pred.zone || 'N/A').padEnd(10)} │`);
    console.log(`│ Capital:    ${String((perf.currentCapital || 0).toFixed(2) + ' SOL').padEnd(10)} │`);
    console.log(`│ Positions:  ${String(perf.openPositions || 0).padEnd(10)} │`);
    console.log(`│ Propagation: ${String((tel.propagationTimeMs || 0).toFixed(1) + ' ms').padEnd(10)} │`);
    console.log('└─────────────────────────────────────────────────────────┘');
  }

  // Summary
  const allOk = portBackend.status === 'open' && portUnified.status === 'open' &&
                wsBackend.wsStatus === 'connected' && healthUnified.httpStatus === 200;

  console.log('');
  console.log(allOk ? '✅ SYSTEM READY' : '❌ SYSTEM ISSUES DETECTED');
  process.exit(allOk ? 0 : 1);
}

main().catch(console.error);