import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';

test('same seed produces identical sequence', () => {
  const a = createRng(12345);
  const b = createRng(12345);
  const seqA = Array.from({ length: 32 }, () => a.next());
  const seqB = Array.from({ length: 32 }, () => b.next());
  assert.deepEqual(seqA, seqB);
});

test('different seeds produce different sequences', () => {
  const a = createRng(1);
  const b = createRng(2);
  const seqA = Array.from({ length: 16 }, () => a.next());
  const seqB = Array.from({ length: 16 }, () => b.next());
  assert.notDeepEqual(seqA, seqB);
});

test('nextFloat stays in [0, 1)', () => {
  const rng = createRng(99);
  for (let i = 0; i < 100; i++) {
    const f = rng.nextFloat();
    assert.ok(f >= 0 && f < 1, `float out of range: ${f}`);
  }
});

test('nextInt and range helpers', () => {
  const rng = createRng(7);
  for (let i = 0; i < 50; i++) {
    const n = rng.nextInt(10);
    assert.ok(n >= 0 && n < 10);
  }
  for (let i = 0; i < 50; i++) {
    const n = rng.range(3, 8);
    assert.ok(n >= 3 && n <= 8);
  }
});

test('string seeds are accepted and stable', () => {
  const a = createRng('dungeon');
  const b = createRng('dungeon');
  assert.equal(a.seed, b.seed);
  assert.deepEqual(
    Array.from({ length: 8 }, () => a.nextFloat()),
    Array.from({ length: 8 }, () => b.nextFloat()),
  );
});
