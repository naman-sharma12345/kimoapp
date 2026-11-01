// Start node desktop/test/planner-ui.mjs first. Existing workspace Playwright.
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
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:8769');
  await page.waitForLoadState('networkidle');
  const styles = page.getByRole('combobox', { name: 'style', exact: true });
  assert.equal(await styles.locator('option').count(), 9);
  await styles.selectOption('shorts-clean');
  assert.equal(
    await page
      .getByRole('combobox', { name: 'format', exact: true })
      .inputValue(),
    'shorts',
  );
  const screens = fileURLToPath(
    new URL('../../docs/screens/', import.meta.url),
  );
  await mkdir(screens, { recursive: true });
  await page.screenshot({
    path: screens + 'phase-10-templates.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: /podcast ep 12 cut ready/ }).click();
  const status = page.getByRole('status').filter({ hasText: 'creator score' });
  await status.waitFor();
  assert.match(await status.innerText(), /review target unverified/);
  const undo = page.getByRole('button', {
    name: 'undo plan edit',
    exact: true,
  });
  await undo.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__creatorUndos === 1);
  await page
    .getByRole('textbox', { name: 'ask kimo for a change' })
    .fill('make captions smaller');
  await page.getByRole('button', { name: 'send', exact: true }).click();
  await page.waitForFunction(() => window.__creatorPatches.length === 1);
  assert.equal(
    await page.evaluate(() => window.__creatorPatches[0]),
    'make captions smaller',
  );
  await page.getByRole('button', { name: 'before / after' }).click();
  assert.match(await page.locator('.desk-ab').innerText(), /previous edit/);
  await page.screenshot({
    path: screens + 'phase-10-planner-history.png',
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    'Nine templates, format mapping, honest score, chat patch, keyboard undo and previous-edit toggle pass; no page errors.',
  );
} finally {
  await browser.close();
}
