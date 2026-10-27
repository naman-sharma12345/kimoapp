import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('renders twelve fixture frames and reports benchmark throughput', async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/dev/compositor');
  const canvas = page.getByLabel('compositor benchmark');
  await expect(canvas).toBeVisible();
  await page.getByRole('button', { name: 'start benchmark' }).click();
  await expect
    .poll(
      async () =>
        Number(
          await page
            .locator('[data-benchmark-fps]')
            .getAttribute('data-benchmark-fps'),
        ),
      { timeout: 20000 },
    )
    .toBeGreaterThan(0);
  const samples: number[] = [];
  for (let index = 0; index < 5; index++) {
    await page.waitForTimeout(1000);
    samples.push(
      Number(
        await page
          .locator('[data-benchmark-fps]')
          .getAttribute('data-benchmark-fps'),
      ),
    );
  }
  const details = await page.evaluate(() => {
    const element = document.querySelector<HTMLCanvasElement>(
      '.compositor-benchmark-canvas',
    );
    const probe = document.createElement('canvas').getContext('webgl2');
    const extension = probe?.getExtension('WEBGL_debug_renderer_info');
    return {
      cores: navigator.hardwareConcurrency,
      renderer: extension
        ? String(probe?.getParameter(extension.UNMASKED_RENDERER_WEBGL))
        : 'unavailable',
      width: element?.width,
      height: element?.height,
    };
  });
  const fps = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  await mkdir('tmp', { recursive: true });
  await writeFile(
    'tmp/phase-06-benchmark.json',
    JSON.stringify({ ...details, samples, average: fps }, null, 2),
  );
  await testInfo.attach('benchmark.txt', {
    body: `Observed ${fps} fps in the current Playwright browser; renderer and hardware are environment dependent.`,
    contentType: 'text/plain',
  });
  for (let index = 0; index < 12; index++) {
    await page
      .getByRole('button', { name: `frame ${index + 1}`, exact: true })
      .click();
    await page.waitForTimeout(350);
    await expect(canvas).toHaveScreenshot(
      `phase-06-frame-${String(index + 1).padStart(2, '0')}.png`,
      { maxDiffPixelRatio: 0.01, timeout: 15000 },
    );
  }
});
