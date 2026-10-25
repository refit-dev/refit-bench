// Plans which list entries each shard runs. With per-repository seconds from earlier runs, the
// longest repository goes to the least-loaded shard first (repositories without a timing count as
// the median), so shards finish together. With timings for fewer than half of the slice, shards
// stay the contiguous slices they always were: medians for most entries would only reshuffle them.
// A plan for the same list slice made within PLAN_REUSE_HOURS is reused, so reruns and nearby
// commits get the same shards, and with them the same per-shard caches.
//
//   node plan-shards.mjs --list <list.json> --offset N --end N --size N
//     [--timings <repo-seconds.json>] [--previous <plan.json>] [--now <ISO time>]
// Prints the plan: { slice, mode, madeAt, shards: [[list index, ...], ...], estimates }.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const PLAN_REUSE_HOURS = 24;

const range = (start, end) => Array.from({ length: end - start }, (_, i) => start + i);

// A restored plan is used only if it names every entry of this slice exactly once.
const covers = (shards, offset, end) =>
  Array.isArray(shards) &&
  shards.every((shard) => Array.isArray(shard) && shard.length > 0) &&
  JSON.stringify(shards.flat().sort((a, b) => a - b)) === JSON.stringify(range(offset, end));

export function planShards({ listText, offset, end, size, timings = {}, previous, now }) {
  const slice = `${createHash('sha256').update(listText).digest('hex').slice(0, 16)}-${offset}-${end}-${size}`;
  const shardCount = Math.ceil((end - offset) / size);
  if (
    previous?.slice === slice &&
    previous.shards?.length === shardCount &&
    covers(previous.shards, offset, end) &&
    now - Date.parse(previous.madeAt) < PLAN_REUSE_HOURS * 3600_000
  )
    return { ...previous, mode: 'reused' };
  const madeAt = new Date(now).toISOString();
  const seconds = (repo) =>
    Number.isFinite(timings[repo]) && timings[repo] >= 0 ? timings[repo] : undefined;
  const entries = JSON.parse(listText)
    .repos.slice(offset, end)
    .map((entry, i) => ({ index: offset + i, seconds: seconds(entry.repo) }));
  const known = entries.filter((entry) => entry.seconds !== undefined).map((entry) => entry.seconds);
  if (known.length * 2 < entries.length)
    return {
      slice,
      mode: 'contiguous',
      madeAt,
      shards: range(0, shardCount).map((shard) =>
        range(offset + shard * size, Math.min(end, offset + (shard + 1) * size)),
      ),
    };
  const median = known.sort((a, b) => a - b)[Math.floor(known.length / 2)];
  // Every repository costs at least a second, so zero-second rows still spread across shards.
  const cost = (entry) => Math.max(entry.seconds ?? median, 1);
  const shards = range(0, shardCount).map(() => ({ load: 0, indexes: [] }));
  // Longest first, ties in list order; each to the least-loaded shard, ties to the lower shard.
  for (const entry of [...entries].sort((a, b) => cost(b) - cost(a) || a.index - b.index)) {
    const target = shards.reduce((best, shard) => (shard.load < best.load ? shard : best));
    target.load += cost(entry);
    target.indexes.push(entry.index);
  }
  return {
    slice,
    mode: 'balanced',
    madeAt,
    timed: known.length,
    untimed: entries.length - known.length,
    shards: shards.map((shard) => shard.indexes.sort((a, b) => a - b)),
    estimates: shards.map((shard) => Math.round(shard.load)),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({
    options: {
      list: { type: 'string' },
      offset: { type: 'string' },
      end: { type: 'string' },
      size: { type: 'string' },
      timings: { type: 'string' },
      previous: { type: 'string' },
      now: { type: 'string' },
    },
  });
  const number = (name) => {
    if (!/^\d+$/.test(values[name] ?? '')) throw new Error(`--${name} must be a whole number`);
    return Number(values[name]);
  };
  // A missing or unreadable timings or previous-plan file means there is none.
  const read = (path) => {
    try {
      return JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      return undefined;
    }
  };
  const [offset, end, size] = [number('offset'), number('end'), number('size')];
  if (size < 1 || end <= offset) throw new Error('--size must be at least 1 and --end above --offset');
  const plan = planShards({
    listText: readFileSync(values.list, 'utf8'),
    offset,
    end,
    size,
    timings: (values.timings && read(values.timings)) || {},
    previous: values.previous && read(values.previous),
    now: values.now ? Date.parse(values.now) : Date.now(),
  });
  console.log(JSON.stringify(plan));
}
