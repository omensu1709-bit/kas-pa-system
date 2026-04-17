/**
 * Minimal test - imitiert das EXAKTE setup aus live-paper-trading-v4.ts
 */

class TestClass {
  private isRunning = true;
  private iteration = 0;

  async start(): Promise<void> {
    console.log('[Start] called');
    // Simulate async initialization
    await new Promise(resolve => setTimeout(resolve, 100));
    this.runMainLoop();
  }

  private async runMainLoop(): Promise<void> {
    console.log('[MainLoop] started');

    while (this.isRunning) {
      try {
        this.iteration++;
        console.log(`\n[${new Date().toISOString()}] Cycle #${this.iteration}`);

        // Simulate some async work
        await new Promise(resolve => setTimeout(resolve, 100));

        console.log(`[Main] Cycle #${this.iteration} complete, sleeping 5000ms...`);

        await this.sleep(5000);

        console.log(`[Main] Wake up, next cycle starting...`);

      } catch (e) {
        console.error('[Main] Error:', e);
      }
    }
  }

  private async sleep(ms: number): Promise<void> {
    console.log(`[Sleep] START: ${ms}ms`);
    return new Promise<void>((resolve) => {
      console.log(`[Sleep] Promise created, setTimeout start`);
      setTimeout(() => {
        console.log(`[Sleep] callback FIRING!`);
        resolve();
      }, ms);
    });
  }
}

// Main
console.log('[Main] Creating instance...');
const test = new TestClass();
console.log('[Main] Calling start()...');
test.start().catch(e => console.error('[Main] unhandled:', e));
console.log('[Main] start() returned');

setTimeout(() => {
  console.log('[Main] 20s elapsed - stopping');
  process.exit(0);
}, 20000);