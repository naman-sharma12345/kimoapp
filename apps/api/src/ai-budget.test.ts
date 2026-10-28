import { describe, expect, it } from 'vitest';
import { createTestDb } from './d1-fake.ts';
import type { Env } from './env.ts';
import {
  assertBudget,
  costUsd,
  recordUsage,
  spentUsd,
  usageOf,
} from './ai-budget.ts';

const env = (budget?: string) =>
  ({ DB: createTestDb(), AI_BUDGET_USD: budget }) as unknown as Env;

describe('ai spend guard', () => {
  it('prices contributor tokens', () => {
    expect(costUsd('muse-spark-1.3-contributor', 1_000_000, 1_000_000)).toBe(
      0.3,
    );
  });
  it('reads counts only from a usage block', () => {
    expect(
      usageOf({ usage: { prompt_tokens: 12, completion_tokens: 3 } }),
    ).toEqual({ prompt: 12, completion: 3 });
    expect(usageOf({ usage: { prompt_tokens: 'x' } })).toEqual({
      prompt: 0,
      completion: 0,
    });
  });
  it('totals calls and refuses past the cap', async () => {
    const e = env('0.25');
    await assertBudget(e);
    await recordUsage(e, 'muse-spark-1.3-contributor', {
      prompt: 2_000_000,
      completion: 300_000,
    });
    expect((await spentUsd(e)).usd).toBeCloseTo(0.26);
    await expect(assertBudget(e)).rejects.toMatchObject({
      status: 429,
      code: 'ai_budget',
    });
  });
});
