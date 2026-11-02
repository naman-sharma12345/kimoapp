import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const out = fileURLToPath(new URL('./ui-shots/', import.meta.url));
await mkdir(out, { recursive: true });
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1080, height: 720 },
  ]) {
    const page = await browser.newPage({ viewport }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.request.post('http://127.0.0.1:8770/reset');
    await page.goto('http://127.0.0.1:8770');
    await page.waitForLoadState('networkidle');
    const shot = async (name) => {
      for (const img of await page.locator('img:visible').all())
        await img.evaluate((img) => img.decode());
      await page.screenshot({
        path: `${out}phase-11-${viewport.width}-${name}.png`,
        fullPage: true,
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `${name}: horizontal document overflow`,
      );
    };
    assert.equal(await page.locator('.creator-template').count(), 9);
    await page.getByRole('button', { name: /Shorts — Punchy/ }).click();
    await page
      .getByRole('combobox', { name: 'length target' })
      .selectOption('45');
    await page.getByRole('button', { name: 'reset length override' }).click();
    assert.equal(
      await page.getByRole('combobox', { name: 'length target' }).inputValue(),
      'auto',
    );
    await page.locator('.creator-home').scrollIntoViewIfNeeded();
    await shot('home');
    assert.ok(
      await page
        .locator('.creator-template video')
        .first()
        .evaluate((v) => v.duration === 3 && v.readyState >= 1),
    );
    await page.getByRole('button', { name: /podcast ep 12 cut ready/ }).click();
    await page.getByRole('tab', { name: 'Edit', exact: true }).waitFor();
    for (const moment of [0, 4, 8]) {
      await page.evaluate(
        (stage) => window.__studioEvents('p2', stage),
        moment,
      );
      await page.waitForTimeout(180);
      await shot(`live-${moment}`);
    }
    await page.evaluate(() => window.__studioEvents('p2', 9));
    await page.getByRole('button', { name: 'mute MUSIC', exact: true }).click();
    await page.waitForFunction(
      () => window.__studioPatches?.at(-1)?.track === 'MUSIC',
    );
    await page.getByRole('button', { name: 'undo creator edit' }).click();
    await page.waitForFunction(
      () => window.__studioPatches.at(-1).type === 'undo',
    );
    await page.getByRole('button', { name: 'redo creator edit' }).click();
    assert.equal(await page.locator('.creator-track-row').count(), 8);
    await shot('timeline');
    for (const name of [
      'Edit',
      'Captions',
      'Sound',
      'Look',
      'Export',
      'Quality',
      'YouTube pack',
    ]) {
      await page.getByRole('tab', { name, exact: true }).click();
      await shot('inspector-' + name.toLowerCase().replaceAll(' ', '-'));
    }
    await page.getByRole('tab', { name: 'Captions', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'caption position', exact: true })
      .selectOption('top');
    await page.waitForFunction(
      () => window.__studioPatches.at(-1)?.position === 'top',
    );
    await page.getByRole('tab', { name: 'Sound', exact: true }).click();
    const level = page.getByRole('slider', {
      name: 'music level',
      exact: true,
    });
    await level.focus();
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(
      () => window.__studioPatches.at(-1)?.type === 'levels',
    );
    await page.getByRole('button', { name: 'no music', exact: true }).click();
    await page.waitForFunction(
      () => window.__studioPatches.at(-1)?.enabled === false,
    );
    await page.getByRole('tab', { name: 'Edit', exact: true }).click();
    await page.getByRole('button', { name: 'more zooms', exact: true }).click();
    await page.waitForFunction(
      () => window.__studioPatches.at(-1)?.type === 'edit',
    );
    await page.locator('.creator-score>button').click();
    await shot('score-breakdown');
    await page.locator('.creator-score>button').click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(
      await page.evaluate(
        () => matchMedia('(prefers-reduced-motion: reduce)').matches,
      ),
      true,
    );
    const caption = page.getByRole('button', { name: /^CAP / }).first();
    await caption.click();
    await page.keyboard.press('c');
    await page
      .getByRole('textbox', { name: 'caption text', exact: true })
      .fill('A clear idea');
    await page
      .getByRole('button', { name: 'apply caption', exact: true })
      .click();
    await page.waitForFunction(
      () => window.__studioPatches.at(-1)?.type === 'caption',
    );
    await page
      .getByRole('button', { name: /^restore this pause/ })
      .first()
      .click();
    if (
      await page.getByRole('group', { name: 'removed segments here' }).count()
    )
      await page
        .getByRole('group', { name: 'removed segments here' })
        .getByRole('button')
        .first()
        .click();
    await page.waitForFunction(
      () => window.__studioPatches.at(-1)?.type === 'restore',
    );
    assert.deepEqual(errors, []);
    console.log(
      `${viewport.width}×${viewport.height}: 13 screenshots, seven tracks, inspector, patches, undo/redo and no page errors.`,
    );
    await page.close();
  }
  const large = await browser.newPage({
    viewport: { width: 3840, height: 2160 },
  });
  await large.goto('http://127.0.0.1:8770');
  await large.getByRole('button', { name: /podcast ep 12 cut ready/ }).click();
  assert.equal(
    await large.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await large.close();
} finally {
  await browser.close();
}
