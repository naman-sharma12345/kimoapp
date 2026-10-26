import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { routes } from './routes';

for (const route of routes) {
  const viewports = [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    ...(route.studio ? [{ width: 1920, height: 1080 }] : []),
  ];
  for (const viewport of viewports)
    test(`${route.name} ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(route.path);
      await expect(page.locator('[data-ready="true"]')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('body')).not.toHaveJSProperty('scrollWidth', 0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await mkdir('docs/screens', { recursive: true });
      await page.screenshot({
        path: `docs/screens/phase-${route.phase}-${route.name}-${viewport.width}x${viewport.height}.png`,
        fullPage: true,
        animations: 'disabled',
      });
      expect(errors).toEqual([]);
    });
}
