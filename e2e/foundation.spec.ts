import { test, expect } from '@playwright/test';

test('tokens, utilities, keyboard focus and reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dev/tokens');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  const swatch = page.locator('[data-token="ink-0"]');
  await expect(swatch).toHaveCSS('background-color', 'rgb(8, 8, 9)');
  await expect(swatch).toHaveCSS('width', '96px');
  await expect(swatch).toHaveCSS('height', '64px');
  await expect(page.locator('.font-mono').first()).toHaveCSS(
    'font-family',
    /GeistMono/,
  );
  await expect(page.locator('.font-display')).toHaveCSS(
    'font-family',
    /^instrument,/,
  );
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'skip to content' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  const replay = page.getByRole('button', { name: 'replay motion' });
  await expect(replay).toBeFocused();
  expect(
    await replay.evaluate((element) => getComputedStyle(element).boxShadow),
  ).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(page.getByText('reduced motion · opacity only')).toBeVisible();
  await expect(page.locator('[data-motion-square]').first()).toHaveCSS(
    'opacity',
    '1',
  );
  await expect(page.locator('[data-motion-square]').first()).toHaveCSS(
    'transform',
    'none',
  );
  const utility = await page.evaluate(() => {
    const element = document.createElement('div');
    element.className = 'bg-ink-1 text-cream-60 rounded-r12';
    document.body.append(element);
    const style = getComputedStyle(element);
    const result = [style.backgroundColor, style.color, style.borderRadius];
    element.remove();
    return result;
  });
  expect(utility).toEqual([
    'rgb(14, 14, 15)',
    'rgba(245, 241, 231, 0.6)',
    '12px',
  ]);
});

test('replay moves each square by the specified distance', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/dev/tokens');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await page.getByRole('button', { name: 'replay motion' }).click();
  await expect(page.locator('[data-motion-square]').last()).toHaveCSS(
    'transform',
    'matrix(1, 0, 0, 1, 64, 0)',
  );
});
