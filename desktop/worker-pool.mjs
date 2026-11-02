import { availableParallelism } from 'node:os';
// Foreground machines retain the existing low-CPU default. CI opts into the
// four-core budget explicitly; at least one core remains free for coordination.
export function analysisWorkers(
  env = process.env,
  cores = availableParallelism(),
) {
  return env.KIMO_PERFORMANCE_PROFILE === 'ci' ? Math.max(1, cores - 1) : 1;
}
export async function mapPool(items, fn, workers = analysisWorkers()) {
  let cursor = 0;
  const result = new Array(items.length);
  await Promise.all(
    Array.from(
      { length: Math.min(items.length, Math.max(1, workers)) },
      async () => {
        for (;;) {
          const i = cursor++;
          if (i >= items.length) return;
          result[i] = await fn(items[i], i);
        }
      },
    ),
  );
  return result;
}
