function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function test() {
  console.log('Start:', Date.now());
  await sleep(2000);
  console.log('Ende:', Date.now());
}

test().then(() => console.log('OK'));