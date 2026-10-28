import type { Env } from './env.ts';
import { HttpError } from './http.ts';

/**
 * Spend guard for kimo's own AI key: every call's token counts (numbers
 * only) go to D1, and calls stop with 429 ai_budget once the running total
 * passes AI_BUDGET_USD. Requests on a user's own key are never counted.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  // USD per 1M tokens, dev.meta.ai pricing (Oct 2026).
  'muse-spark-1.3-contributor': { input: 0.1, output: 0.2 },
  'muse-spark-1.2-contributor': { input: 0.1, output: 0.2 },
  'muse-spark-1.3': { input: 1.25, output: 4.25 },
  'muse-spark-1.2': { input: 1.25, output: 4.25 },
};
const FALLBACK = { input: 1.25, output: 4.25 };
export const DEFAULT_BUDGET_USD = 10;

export function costUsd(model: string, prompt: number, completion: number) {
  const price = PRICES[model] ?? FALLBACK;
  return (prompt * price.input + completion * price.output) / 1_000_000;
}

export function budgetUsd(env: Env) {
  const value = Number(env.AI_BUDGET_USD);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_BUDGET_USD;
}

export async function spentUsd(env: Env) {
  const rows = await env.DB.prepare(
    'SELECT model, SUM(prompt_tokens) AS p, SUM(completion_tokens) AS c, SUM(calls) AS n FROM ai_spend GROUP BY model',
  ).all<{ model: string; p: number; c: number; n: number }>();
  let usd = 0;
  let calls = 0;
  for (const row of rows.results) {
    usd += costUsd(row.model, row.p ?? 0, row.c ?? 0);
    calls += row.n ?? 0;
  }
  return { usd, calls };
}

/** Throws 429 ai_budget when kimo's own key has used up its budget. */
export async function assertBudget(env: Env) {
  if ((await spentUsd(env)).usd >= budgetUsd(env))
    throw new HttpError(
      429,
      'ai_budget',
      'kimo’s AI budget is used up for now; manual editing still works, or add your own key',
    );
}

/** Reads an OpenAI/Anthropic-style usage block; counts only. */
export function usageOf(body: unknown): { prompt: number; completion: number } {
  const usage =
    body && typeof body === 'object'
      ? (body as { usage?: Record<string, unknown> }).usage
      : undefined;
  const n = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0
      ? Math.round(value)
      : 0;
  return {
    prompt: n(usage?.prompt_tokens ?? usage?.input_tokens),
    completion: n(usage?.completion_tokens ?? usage?.output_tokens),
  };
}

export async function recordUsage(
  env: Env,
  model: string,
  usage: { prompt: number; completion: number },
  day = new Date().toISOString().slice(0, 10),
) {
  await env.DB.prepare(
    `INSERT INTO ai_spend (day, model, calls, prompt_tokens, completion_tokens) VALUES (?, ?, 1, ?, ?)
     ON CONFLICT (day, model) DO UPDATE SET calls = calls + 1,
       prompt_tokens = prompt_tokens + excluded.prompt_tokens,
       completion_tokens = completion_tokens + excluded.completion_tokens`,
  )
    .bind(day, model.slice(0, 80), usage.prompt, usage.completion)
    .run();
}
