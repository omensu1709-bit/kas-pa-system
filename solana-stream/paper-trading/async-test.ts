/**
 * Minimal Async Loop Test
 * Isoliert das Problem: Wake-up nach sleep
 */

let iteration = 0;
const isRunning = true;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function mainLoop() {
  console.log('[Test] MainLoop gestartet');

  while (isRunning) {
    try {
      iteration++;
      console.log(`[Test] Iteration #${iteration} START`);

      // Simuliere eine await Operation
      await new Promise(resolve => setTimeout(resolve, 500));

      console.log(`[Test] Iteration #${iteration} COMPLETE, schläfe 2000ms...`);

      await sleep(2000);

      console.log(`[Test] Iteration #${iteration} WACHE AUF!`);

    } catch (e) {
      console.error('[Test] Error:', e);
    }
  }

  console.log('[Test] Loop beendet');
}

// Starte
console.log('[Test] Starting...');
mainLoop();

// Halte Prozess am Leben
setTimeout(() => {
  console.log('[Test] Nach 15s: istRunning = false');
  process.exit(0);
}, 15000);