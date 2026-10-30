// Run from the repository checkout after build:renderer; uses the root Playwright dependency.
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const browser = await chromium.launch({
  headless: true,
  channel: process.env.KIMO_BROWSER_CHANNEL || 'chrome',
  args: ['--disable-gpu', '--disable-background-networking'],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  await page.addInitScript({
    path: join(root, 'desktop/renderer/src/dev/mock-kimo.js'),
  });
  const errors = [],
    network = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (/^https?:/.test(r.url())) network.push(r.url());
  });
  await page.goto(
    pathToFileURL(join(root, 'desktop/renderer/index.html')).href,
  );
  await page
    .getByRole('button')
    .filter({ hasText: 'podcast ep 12 cut' })
    .click();
  await page.locator('.desk-clip').first().waitFor();
  assert.equal(await page.locator('.desk-clip').count(), 13);
  const caption = page.getByRole('button', { name: /^the road to manali ·/ });
  await caption.focus();
  await caption.press('Space');
  assert.notEqual(
    await caption.evaluate((el) => getComputedStyle(el).boxShadow),
    'none',
    'keyboard clip has a visible focus ring',
  );
  await page.screenshot({
    path: join(root, 'docs/screens/phase-02-desktop-edl.png'),
  });
  await caption.press('Enter');
  const input = page.locator('.desk-clip-input');
  await input.fill('phase two caption');
  await input.press('Enter');
  await page.getByRole('button', { name: 'apply & re-render' }).click();
  await page.getByText('phase two caption', { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(
      async () =>
        (await window.kimo.edl('p2')).overlays.find((o) => o.id === 't1a').props
          .text,
    ),
    'phase two caption',
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(network, []);
  await page.screenshot({
    path: join(root, 'docs/screens/phase-02-desktop-edl-edit.png'),
  });
  console.log(
    'EDL timeline: 13 clips, keyboard caption edit persisted, visible focus, no JS errors or HTTP requests. Viewer media is intentionally absent in this IPC fixture.',
  );
} finally {
  await browser.close();
}
