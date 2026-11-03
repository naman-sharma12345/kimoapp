import { availableParallelism } from 'node:os';
// KIMO_PERFORMANCE_PROFILE=background opts into the old low-CPU-while-editing
// default (1 worker); "ci" and the default ("fast", unset) scale to the
// machine, leaving one core free for the UI. See resources.cjs.
export function analysisWorkers(
  env = process.env,
  cores = availableParallelism(),
) {
  const raw = String(env.KIMO_PERFORMANCE_PROFILE || '').toLowerCase();
  if (raw === 'background' || raw === 'low-cpu' || raw === 'low_cpu') return 1;
  return Math.max(1, cores - 1);
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
