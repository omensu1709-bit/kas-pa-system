/**
 * Ultra-minimal test - standalone function
 */

let counter = 0;

function sleep(ms: number): Promise<void> {
  console.log(`[Sleep] START: ${ms}ms`);
  return new Promise<void>((resolve) => {
    console.log(`[Sleep] Promise created, setTimeout starting...`);
    setTimeout(() => {
      console.log(`[Sleep] callback EXECUTED!`);
      resolve();
    }, ms);
    console.log(`[Sleep] setTimeout called`);
  });
}

async function main() {
  console.log('[Main] Starting...');

  while (counter < 3) {
    counter++;
    console.log(`\n[Main] Cycle #${counter} START`);

    // Simulate some async work
    await new Promise(resolve => setTimeout(resolve, 50));

    console.log(`[Main] Cycle #${counter} sleeping...`);
    await sleep(3000);
    console.log(`[Main] Cycle #${counter} WAKE UP!`);
  }

  console.log('[Main] Done!');
  process.exit(0);
}

main().catch(e => {
  console.error('[Main] Error:', e);
  process.exit(1);
});