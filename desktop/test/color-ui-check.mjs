// Start the existing browser-only fixture: node desktop/test/audio-ui.mjs.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
    }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:8768');
  await page
    .getByRole('button', { name: 'podcast ep 12 cut ready · youtube 16:9' })
    .click();
  const control = page.getByRole('group', { name: 'colour finish' }),
    select = page.getByRole('combobox', { name: 'colour look' });
  await select.selectOption('warm-creator');
  const range = page.getByRole('slider', { name: 'look strength' });
  await range.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
  assert.equal(await range.inputValue(), '0.5');
  const image = control.getByRole('img');
  await image.waitFor();
  assert.ok(await image.evaluate((i) => i.complete && i.naturalWidth === 480));
  await page.getByRole('button', { name: 'apply colour & re-render' }).click();
  await page.waitForFunction(() => window.__mockColorCalls?.length === 1);
  const call = await page.evaluate(() => window.__mockColorCalls[0]);
  assert.equal(call.look, 'warm-creator');
  assert.equal(call.strength, 0.5);
  await control.scrollIntoViewIfNeeded();
  const screens = fileURLToPath(
    new URL('../../docs/screens/', import.meta.url),
  );
  await mkdir(screens, { recursive: true });
  await page.screenshot({
    path: screens + 'phase-09-colour-finish.png',
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    'Colour picker, keyboard strength, preview and persistence passed; no page errors.',
  );
} finally {
  await browser.close();
}
