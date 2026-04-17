/**
 * Test mit dem EXAKTEN Code-Pattern aus live-paper-trading-v4.ts
 */

const CONFIG = { updateIntervalMs: 30000 };

let iteration = 0;
let isRunning = true;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class TestClass {
  private async runMainLoop(): Promise<void> {
    let iteration = 0;

    while (isRunning) {
      try {
        iteration++;
        console.log(`[Main] Cycle #${iteration} START`);

        // Simuliere await Operation
        await new Promise(resolve => setTimeout(resolve, 500));

        console.log(`[Main] Cycle #${iteration} complete, sleeping ${CONFIG.updateIntervalMs}ms...`);

        await this.sleep(CONFIG.updateIntervalMs);

        console.log(`[Main] Wake up, next cycle starting...`);

      } catch (e) {
        console.error('[Main] Cycle error:', e);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    console.log(`[Sleep] Gestartet mit ${ms}ms`);
    return new Promise(resolve => {
      console.log(`[Sleep] Promise erstellt`);
      setTimeout(() => {
        console.log(`[Sleep] Resolving...`);
        resolve();
      }, ms);
    });
  }

  start() {
    console.log('[Start] wird aufgerufen');
    this.runMainLoop().then(() => {
      console.log('[MainLoop] Promise resolved - das sollte nie passieren!');
    }).catch(e => {
      console.error('[MainLoop] Promise rejected:', e);
    });
    console.log('[Start] nach runMainLoop() Aufruf');
  }
}

// Test
const test = new TestClass();
test.start();

console.log('[Main] Nach test.start()');

// Halte Prozess am Leben
setTimeout(() => {
  console.log('[Main] 10s vergangen - Prozess wird beendet');
  isRunning = false;
  setTimeout(() => process.exit(0), 100);
}, 10000);