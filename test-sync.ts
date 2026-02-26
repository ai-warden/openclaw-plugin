/**
 * Test if sync vs async is the issue
 */

console.log('Test 1: Sync code');
console.log('Line 1');
console.log('Line 2');
console.log('Line 3');

console.log('\nTest 2: Async code');
(async () => {
  console.log('Async line 1');
  await new Promise(resolve => setTimeout(resolve, 10));
  console.log('Async line 2');
  await new Promise(resolve => setTimeout(resolve, 10));
  console.log('Async line 3');
  console.log('✅ Async completed');
})().catch(err => {
  console.error('❌ Async failed:', err);
});

console.log('\nTest 3: Promise');
Promise.resolve('test')
  .then(() => {
    console.log('Promise line 1');
    return Promise.resolve();
  })
  .then(() => {
    console.log('Promise line 2');
  })
  .then(() => {
    console.log('✅ Promise completed');
  })
  .catch(err => {
    console.error('❌ Promise failed:', err);
  });

console.log('\nAll tests started');
setTimeout(() => {
  console.log('\n✅ All tests should be done');
  process.exit(0);
}, 1000);
