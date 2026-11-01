// Start `node desktop/test/audio-ui.mjs` first. Uses existing workspace Playwright.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:8768');
  await page
    .getByRole('button', { name: 'podcast ep 12 cut ready · youtube 16:9' })
    .click();
  const button = page.getByRole('button', { name: 'add music', exact: true });
  await button.waitFor();
  assert.equal(await button.isEnabled(), true);
  await button.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__audioImports.length === 1);
  assert.equal(await page.evaluate(() => window.__audioImports[0]), 'picker');
  const lane = page.getByLabel(
    'MUSIC · drop an audio file here or use add music',
  );
  const transfer = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.items.add(
      new File(['audio fixture'], 'dropped.opus', { type: 'audio/ogg' }),
    );
    return d;
  });
  await lane.dispatchEvent('drop', { dataTransfer: transfer });
  await page.waitForFunction(() => window.__audioImports.length === 2);
  assert.equal(
    await page.evaluate(() => window.__audioImports[1]),
    'C:/music/dropped.opus',
  );
  await page.getByText('dropped.opus', { exact: true }).waitFor();
  const screens = fileURLToPath(
    new URL('../../docs/screens/', import.meta.url),
  );
  await mkdir(screens, { recursive: true });
  await page.screenshot({
    path: screens + 'phase-08-music-import.png',
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    'Studio: keyboard music import and MUSIC-lane drop passed; no page errors. Screenshot docs/screens/phase-08-music-import.png',
  );
} finally {
  await browser.close();
}
