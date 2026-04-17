/**
 * Test: Does setTimeout in a Promise work correctly?
 */

function sleep(ms: number): Promise<void> {
  console.log(`[Sleep] Creating Promise for ${ms}ms`);
  return new Promise<void>((resolve) => {
    console.log(`[Sleep] Promise created, calling setTimeout`);
    setTimeout(() => {
      console.log(`[Sleep] setTimeout fired! Calling resolve...`);
      resolve();
    }, ms);
    console.log(`[Sleep] setTimeout called, now waiting`);
  });
}

async function main() {
  console.log('[Main] Starting...');

  for (let i = 1; i <= 3; i++) {
    console.log(`[Main] Cycle #${i} START`);
    await sleep(5000);
    console.log(`[Main] Cycle #${i} COMPLETE`);
  }

  console.log('[Main] Done!');
  process.exit(0);
}

main().catch(e => {
  console.error('[Main] Error:', e);
  process.exit(1);
});