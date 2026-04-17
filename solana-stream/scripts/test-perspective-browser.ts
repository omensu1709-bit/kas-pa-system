/**
 * KAS PA - Browser Test für Perspective.js
 * Öffnet das Dashboard im Browser und prüft ob Perspective Daten empfängt
 */

import { chromium } from 'playwright';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║     PERSPECTIVE.JS BROWSER TEST                               ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // 1. Check if servers are running
  console.log('[1] Checking servers...\n');

  // Backend
  try {
    const ws = new (await import('ws')).WebSocket('ws://localhost:8080');
    await new Promise((r) => ws.on('open', r).on('error', r));
    console.log('  ✓ Backend WS: ws://localhost:8080');
    ws.close();
  } catch {
    console.log('  ✗ Backend WS: NOT RUNNING - Start with: npx tsx src/live-paper-trading.ts');
  }

  // Frontend
  try {
    const response = await axios.get('http://localhost:5173');
    if (response.status === 200) {
      console.log('  ✓ Frontend: http://localhost:5173');
    }
  } catch {
    console.log('  ✗ Frontend: NOT RUNNING - Start with: npm run dev');
  }

  // 2. Launch browser
  console.log('\n[2] Launching browser...\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Capture console messages
  const consoleLogs: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    consoleLogs.push(text);
    if (text.includes('Perspective') || text.includes('Error') || text.includes('error')) {
      console.log(`  [Browser] ${text}`);
    }
  });

  // Navigate to dashboard
  console.log('  Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 30000 });

  // Wait for Perspective to initialize
  console.log('  Waiting for Perspective initialization...');
  await page.waitForTimeout(5000);

  // Check if perspective-viewer element exists
  const perspectiveViewer = await page.$('perspective-viewer');
  if (perspectiveViewer) {
    console.log('  ✓ Perspective viewer element found');
  } else {
    console.log('  ✗ Perspective viewer element NOT found');
  }

  // Check for data in the viewer
  const hasData = await page.evaluate(() => {
    const viewer = document.querySelector('perspective-viewer');
    if (!viewer) return { found: false };

    // Try to get the table
    const table = (viewer as any).table;
    if (!table) return { found: false, reason: 'No table reference' };

    // Try to get size
    const size = (viewer as any).size;
    return { found: true, size };
  });

  console.log(`  Perspective data check: ${hasData.found ? '✓ Data present' : '✗ ' + (hasData.reason || 'No data')}`);

  // Check console for errors
  console.log('\n[3] Console errors check...\n');
  const errors = consoleLogs.filter(l => l.toLowerCase().includes('error'));
  if (errors.length === 0) {
    console.log('  ✓ No console errors');
  } else {
    console.log(`  ✗ ${errors.length} errors found:`);
    errors.forEach(e => console.log(`    - ${e}`));
  }

  // Check WebSocket data
  console.log('\n[4] Checking WebSocket data flow...\n');

  const ws2 = new (await import('ws')).WebSocket('ws://localhost:8080');
  let messageCount = 0;

  await new Promise<void>((resolve) => {
    ws2.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      messageCount++;
      if (msg.type === 'UPDATE' && msg.latestPrediction) {
        console.log(`  ✓ WebSocket UPDATE received`);
        console.log(`    - crashProbability: ${msg.latestPrediction.crashProbability}`);
        console.log(`    - rawMetrics.price: ${msg.latestPrediction.rawMetrics?.price}`);
        console.log(`    - zone: ${msg.latestPrediction.zone}`);
      }
    });

    ws2.on('close', () => resolve());
    setTimeout(() => resolve(), 5000);
  });

  ws2.close();

  if (messageCount === 0) {
    console.log('  ✗ No WebSocket messages received');
  } else {
    console.log(`  ✓ ${messageCount} WebSocket messages received`);
  }

  // Summary
  console.log('\n' + '='.repeat(68));
  console.log('BROWSER TEST SUMMARY');
  console.log('='.repeat(68));

  const passed = perspectiveViewer && hasData.found && errors.length === 0 && messageCount > 0;

  if (passed) {
    console.log('✅ PERSPECTIVE.JS FUNKTIONIERT IM BROWSER!');
    console.log('   Daten werden empfangen und angezeigt.\n');
  } else {
    console.log('⚠️ PROBLEME ERKANNT:');
    if (!perspectiveViewer) console.log('   - Perspective viewer element fehlt');
    if (!hasData.found) console.log('   - Keine Daten in Perspective');
    if (errors.length > 0) console.log(`   - ${errors.length} Console errors`);
    if (messageCount === 0) console.log('   - Keine WebSocket messages');
    console.log('');
  }

  await browser.close();
}

main().catch(console.error);
