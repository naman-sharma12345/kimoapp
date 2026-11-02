import { cpus } from 'node:os';

const finite = (n) => typeof n === 'number' && Number.isFinite(n);
export function criticalGates(
  metrics = {},
  { speech = true, captions = true, audio = true } = {},
) {
  const rules = [
    ['repeated_frames', 'repeated frames', 0, 'compose', true],
    ['jitter_px', 'camera jitter', 1, 'compose', true],
    ['true_peak', 'true peak', -1, 'sound', audio],
    ['caption_safe', 'caption safe area', true, 'captions', captions],
    ['dead_air_ratio', 'dead air', 0.06, 'cut', speech],
    ['first_speech_s', 'first speech', 1, 'cut', speech],
  ];
  const checks = rules.map(([id, label, limit, stage, applicable]) => {
    const value = metrics[id] ?? null;
    const known =
      (typeof limit === 'boolean'
        ? typeof value === 'boolean'
        : finite(value)) &&
      (id !== 'repeated_frames' ||
        (finite(metrics.frame_match_coverage) &&
          metrics.frame_match_coverage >= 0.95));
    const state = !applicable
      ? 'not-applicable'
      : !known
        ? 'unverified'
        : (typeof limit === 'boolean' ? value === limit : value <= limit)
          ? 'pass'
          : 'fail';
    return {
      id,
      label,
      stage,
      state,
      measured: value,
      value: !applicable
        ? 'not applicable'
        : value === null
          ? 'unavailable'
          : typeof value === 'boolean'
            ? value
              ? 'inside'
              : 'outside'
            : String(value),
      limit,
      critical: true,
      ok: state === 'pass' || state === 'not-applicable',
      warn: state === 'unverified',
      want: typeof limit === 'boolean' ? 'inside safe area' : `≤ ${limit}`,
    };
  });
  return {
    checks,
    passed: checks.every((c) => c.ok),
    red: checks.some((c) => c.state === 'fail'),
    unverified: checks.some((c) => c.state === 'unverified'),
  };
}

/** Exactly one repair per failing stage, never an unbounded retry or a paid call. */
export async function enforceGates({
  measure,
  repair,
  context,
  emit = () => {},
  signal,
}) {
  let measurements = await measure();
  const initial = criticalGates(measurements.metrics, context),
    retries = [];
  for (const stage of new Set(
    initial.checks.filter((c) => c.state === 'fail').map((c) => c.stage),
  )) {
    signal?.throwIfAborted();
    const started = Date.now(),
      record = { stage, attempt: 1 };
    emit({
      t: 'op',
      id: `gate-${stage}`,
      tool: 'quality_repair',
      phase: 'start',
      title: `quality gate · retry ${stage} once`,
      at: started,
    });
    try {
      await repair(stage, measurements);
      record.ok = true;
    } catch (error) {
      signal?.throwIfAborted();
      record.ok = false;
      record.error = error.message;
    }
    record.ms = Date.now() - started;
    retries.push(record);
    emit({
      t: 'op',
      id: `gate-${stage}`,
      tool: 'quality_repair',
      phase: 'end',
      ok: record.ok,
      ms: record.ms,
      ...(record.error
        ? { error: record.error }
        : { result: 'stage rechecked' }),
    });
  }
  if (retries.length) measurements = await measure();
  const final = criticalGates(measurements.metrics, context);
  return {
    measurements,
    gates: { ...final, initial: initial.checks, retries },
  };
}

export const PERFORMANCE_BUDGETS = {
  transcript: 45,
  plan: 25,
  compose: 90,
  critic: 60,
  total: 240,
};
export function performanceReport(
  ops,
  totalMs,
  { preview = false, sourceSeconds = null } = {},
) {
  const sums = { transcript: 0, plan: 0, compose: 0, critic: 0 };
  const starts = new Map();
  for (const op of ops) {
    if (op.phase === 'start') starts.set(op.id ?? op.opId, op);
    if (op.phase !== 'end' || !finite(op.ms)) continue;
    const start = starts.get(op.id ?? op.opId),
      name = op.tool ?? start?.tool ?? '';
    if (name === 'creator_ai' && /^critic/.test(start?.title ?? '')) continue;
    const key = /transcrib/.test(name)
      ? 'transcript'
      : /critic/.test(name)
        ? 'critic'
        : /creator_ai|planner/.test(name)
          ? 'plan'
          : /compose|render/.test(name)
            ? 'compose'
            : null;
    if (key) sums[key] += op.ms / 1000;
  }
  const seconds = { ...sums, total: totalMs / 1000 };
  return {
    seconds,
    budgets: PERFORMANCE_BUDGETS,
    checks: Object.entries(PERFORMANCE_BUDGETS).map(([stage, max]) => ({
      stage,
      seconds: seconds[stage],
      max,
      ok: seconds[stage] <= max,
    })),
    hardware: {
      platform: process.platform,
      cores: cpus().length,
      model: cpus()[0]?.model,
    },
    preview,
    source_seconds: sourceSeconds,
    representative: sourceSeconds >= 59 && sourceSeconds <= 61 && !preview,
  };
}
