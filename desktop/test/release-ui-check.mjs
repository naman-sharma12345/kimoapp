import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [1080, 1440]) {
    const page = await browser.newPage({
        viewport: { width, height: width === 1080 ? 720 : 900 },
      }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://127.0.0.1:8770');
    await page.getByRole('button', { name: /podcast ep 12 cut ready/ }).click();
    await page.evaluate(() => {
      window.__creatorFixture.preview = true;
      window.__creatorFixture.creator.gates = { red: true, unverified: true };
      window.__creatorFixture.quality.checks = [
        {
          label: 'true peak',
          ok: false,
          warn: false,
          value: '−0.5 dBTP · still red after one retry',
          want: '≤ −1 dBTP',
        },
      ];
      window.__studioEvents('p2', 9);
    });
    await page
      .getByRole('alert')
      .filter({ hasText: 'critical quality check' })
      .waitFor();
    assert.ok(
      await page
        .getByText('preview · full quality on export', { exact: true })
        .count(),
    );
    await page.getByRole('tab', { name: 'Quality', exact: true }).click();
    await page.screenshot({
      path: fileURLToPath(
        new URL(
          `./ui-shots/phase-12-${width}-critical-quality.png`,
          import.meta.url,
        ),
      ),
    });
    await page.keyboard.press(',');
    const clean = page.getByRole('button', {
      name: 'clean cache',
      exact: true,
    });
    await clean.waitFor();
    await clean.click();
    await page
      .getByText('0.0 MB · saved projects and input copies are kept', {
        exact: true,
      })
      .waitFor();
    await page.screenshot({
      path: fileURLToPath(
        new URL(`./ui-shots/phase-12-${width}-settings.png`, import.meta.url),
      ),
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    await page.close();
    console.log(
      `${width}: critical alert, preview/export label and cache controls pass`,
    );
  }
} finally {
  await browser.close();
}
