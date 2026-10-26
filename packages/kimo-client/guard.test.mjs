import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

describe('component token guard', () => {
  const eslint = new ESLint();
  beforeAll(async () => {
    await eslint.calculateConfigForFile(
      'apps/web/src/components/ui/GuardFixture.tsx',
    );
  }, 60000);
  it.each([
    'export const color = "#FF5A24";',
    'export const color = `#080809`;',
    'export const Sample = () => <div>#F5F1E7</div>;',
    'export const Sample = () => <div className="bg-[#ff5a24]" />;',
  ])('rejects raw hex values in component source', async (code) => {
    const [result] = await eslint.lintText(code, {
      filePath: 'apps/web/src/components/ui/GuardFixture.tsx',
    });
    expect(
      result.messages.some((message) => message.ruleId === 'kimo/tokens-only'),
    ).toBe(true);
  });
  it('accepts a token reference', async () => {
    const [result] = await eslint.lintText(
      'export const Sample = () => <div className="bg-ink-1 text-cream-60 rounded-r12" />;',
      { filePath: 'apps/web/src/components/ui/GuardFixture.tsx' },
    );
    expect(result.errorCount).toBe(0);
  });
});
