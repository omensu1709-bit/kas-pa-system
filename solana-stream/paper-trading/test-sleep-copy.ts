/**
 * Copy of the sleep function from live-paper-trading-v4.ts for testing
 */

async function sleep(ms: number): Promise<void> {
  console.log(`[Sleep] START: ${ms}ms`);
  return new Promise<void>((resolve) => {
    console.log(`[Sleep] Promise created, calling setTimeout`);
    const timer = setTimeout(() => {
      console.log(`[Sleep] setTimeout callback FIRING! About to resolve...`);
      try {
        resolve();
        console.log(`[Sleep] resolve() called successfully`);
      } catch (e) {
        console.error(`[Sleep] resolve() failed:`, e);
      }
    }, ms);
    console.log(`[Sleep] Timer ID: ${timer}`);

    // Additional safety: resolve after max time regardless
    setTimeout(() => {
      console.log(`[Sleep] SAFETY: Force resolving after ${ms}ms`);
      resolve();
    }, ms + 100);
  });
}

// Test
async function main() {
  console.log('[Main] Starting...');

  for (let i = 1; i <= 3; i++) {
    console.log(`\n[Main] Cycle #${i} START`);
    await sleep(5000);
    console.log(`[Main] Cycle #${i} WAKE UP!`);
  }

  console.log('[Main] Done!');
  process.exit(0);
}

main();