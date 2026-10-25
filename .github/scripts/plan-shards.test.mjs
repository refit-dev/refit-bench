// node --test .github/scripts/plan-shards.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planShards } from './plan-shards.mjs';

// Seconds the two slowest repositories took in run 40144503063 (subsets/l2-push-249.json at
// c8a224f); the other twelve entries are synthetic. Both slow ones fall in the first contiguous slice.
const SIMPLER = 'SimplerDevelopment/SimplerDevelopment';
const EZANA = 'CRONANANI/EzanaFinance3';
const repos = [
  SIMPLER,
  EZANA,
  ...Array.from({ length: 6 }, (_, i) => `synthetic/small-${i}`),
  ...Array.from({ length: 6 }, (_, i) => `synthetic/medium-${i}`),
];
const listText = JSON.stringify({ repos: repos.map((repo) => ({ repo, commit: 'a'.repeat(40) })) });
const timings = {
  [SIMPLER]: 1341,
  [EZANA]: 740,
  ...Object.fromEntries(repos.slice(2, 8).map((repo, i) => [repo, 10 + i])),
  ...Object.fromEntries(repos.slice(8, 13).map((repo, i) => [repo, 300 + 10 * i])),
  // synthetic/medium-5 has no timing and counts as the median.
};
const now = Date.parse('2026-10-25T02:00:00Z');
const loads = (plan) =>
  plan.shards.map((shard) =>
    shard.reduce((sum, index) => sum + (timings[repos[index]] ?? 300), 0),
  );

test('without timings, shards are the contiguous slices the workflow always ran', () => {
  const plan = planShards({ listText, offset: 2, end: 14, size: 5, now });
  assert.equal(plan.mode, 'contiguous');
  assert.deepEqual(plan.shards, [
    [2, 3, 4, 5, 6],
    [7, 8, 9, 10, 11],
    [12, 13],
  ]);
  // The first slice holds both slow repositories: 2,114 seconds against 1,354 balanced below.
  const slices = planShards({ listText, offset: 0, end: 14, size: 5, now });
  assert.deepEqual(loads(slices), [2114, 652, 1290]);
  // Timings for fewer than half of the slice (the two named repositories only) change nothing.
  const few = { [SIMPLER]: timings[SIMPLER], [EZANA]: timings[EZANA] };
  assert.deepEqual(planShards({ listText, offset: 0, end: 14, size: 5, timings: few, now }), slices);
});

test('with timings, the longest repositories go to separate shards and loads even out', () => {
  const plan = planShards({ listText, offset: 0, end: 14, size: 5, timings, now });
  assert.equal(plan.mode, 'balanced');
  assert.equal(plan.shards.length, 3);
  assert.deepEqual(
    plan.shards.flat().sort((a, b) => a - b),
    repos.map((_, i) => i),
  );
  // Longest first: 1,341 and 740 open two shards, the mediums (the untimed one counted as the
  // 300-second median) and smalls fill the least-loaded shard; each shard lists in list order.
  assert.deepEqual(plan.shards, [
    [0, 3],
    [1, 9, 13],
    [2, 4, 5, 6, 7, 8, 10, 11, 12],
  ]);
  assert.deepEqual(plan.estimates, [1352, 1350, 1354]);
  assert.deepEqual(loads(plan), plan.estimates);
  assert.equal(plan.untimed, 1);
  assert.deepEqual(plan, planShards({ listText, offset: 0, end: 14, size: 5, timings, now }));
});

test('reuses a recent plan for the same slice and replans otherwise', () => {
  const previous = planShards({ listText, offset: 0, end: 14, size: 5, timings, now });
  const later = (hours) => now + hours * 3600_000;
  const reused = planShards({ listText, offset: 0, end: 14, size: 5, timings: {}, previous, now: later(23) });
  assert.equal(reused.mode, 'reused');
  assert.deepEqual(reused.shards, previous.shards);
  assert.equal(reused.madeAt, previous.madeAt);
  assert.equal(
    planShards({ listText, offset: 0, end: 14, size: 5, timings: {}, previous, now: later(25) }).mode,
    'contiguous',
  );
  // Another size, another list or a plan that does not cover the slice is never reused.
  assert.equal(planShards({ listText, offset: 0, end: 14, size: 4, timings, previous, now }).mode, 'balanced');
  assert.equal(
    planShards({ listText: `${listText}\n`, offset: 0, end: 14, size: 5, timings, previous, now }).mode,
    'balanced',
  );
  const broken = { ...previous, shards: [previous.shards[0], previous.shards[1], [...previous.shards[1]]] };
  assert.equal(planShards({ listText, offset: 0, end: 14, size: 5, timings, previous: broken, now }).mode, 'balanced');
});
