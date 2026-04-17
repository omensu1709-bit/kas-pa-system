/**
 * Test mit isRunning Pattern
 */

const CONFIG = { updateIntervalMs: 30000 };

class TestClass {
  private isRunning = true;
  private iteration = 0;

  async start(): Promise<void> {
    console.log('[Start] Async start() aufgerufen');
    await this.runMainLoop();
    console.log('[Start] runMainLoop() beendet - sollte nie passieren!');
  }

  private async runMainLoop(): Promise<void> {
    console.log('[MainLoop] Gestartet');

    while (this.isRunning) {
      try {
        this.iteration++;
        console.log(`[Cycle #${this.iteration}] START`);

        // Simuliere async work
        await new Promise(resolve => setTimeout(resolve, 100));

        console.log(`[Cycle #${this.iteration}] COMPLETE, sleeping...`);

        await this.sleep(CONFIG.updateIntervalMs);

        console.log(`[Cycle #${this.iteration}] WACHE AUF!`);

      } catch (e) {
        console.error('[Error]', e);
      }
    }

    console.log('[MainLoop] isRunning = false, Loop beendet');
  }

  private sleep(ms: number): Promise<void> {
    console.log(`[Sleep] ${ms}ms gestartet um ${new Date().toISOString()}`);
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop(): void {
    console.log('[Stop] isRunning = false gesetzt');
    this.isRunning = false;
  }
}

// Test
const test = new TestClass();

// Start but don't await
test.start();

console.log('[Main] test.start() aufgerufen (nicht geawaitet)');

// Stop nach 10 Sekunden
setTimeout(() => {
  console.log('[Main] Stoppe nach 10s...');
  test.stop();
}, 10000);

// Exit nach 15 Sekunden
setTimeout(() => {
  console.log('[Main] Prozess beenden');
  process.exit(0);
}, 15000);