import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

async function ready(page: Page) {
  await page.goto('/dev/ui');
  await expect(page.locator('[data-ready="true"]')).toBeVisible({
    timeout: 30000,
  });
}
async function screenshot(page: Page, name: string) {
  await page.mouse.move(0, 0);
  await mkdir('docs/screens', { recursive: true });
  await page.screenshot({
    path: `docs/screens/phase-01-ui-${name}-1440x900.png`,
    animations: 'disabled',
  });
}
test.use({ viewport: { width: 1440, height: 900 } });

test('axe finds no violations in the gallery and open overlays', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  const reports: { state: string; violations: unknown[] }[] = [];
  async function audit(state: string) {
    const results = await new AxeBuilder({ page }).analyze();
    reports.push({ state, violations: results.violations });
    await mkdir('tmp', { recursive: true });
    await writeFile('tmp/phase-01-axe.json', JSON.stringify(reports, null, 2));
    expect(
      results.violations,
      JSON.stringify(
        results.violations.map((item) => ({
          id: item.id,
          nodes: item.nodes.map((node) => ({
            target: node.target,
            summary: node.failureSummary,
          })),
        })),
        null,
        2,
      ),
    ).toEqual([]);
  }
  await audit('gallery');
  await page.getByRole('button', { name: 'open menu', exact: true }).click();
  await expect(page.getByRole('menu')).toBeVisible();
  await audit('menu');
  await screenshot(page, 'menu');
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: 'project details', exact: true })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'project details' }),
  ).toBeVisible();
  await audit('popover');
  await screenshot(page, 'popover');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'review sm dialog' }).click();
  await expect(
    page.getByRole('dialog', { name: 'discard this edit?' }),
  ).toBeVisible();
  await audit('dialog-sm');
  await screenshot(page, 'dialog-sm');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'review md dialog' }).click();
  await expect(
    page.getByRole('dialog', { name: 'discard this edit?' }),
  ).toHaveCSS('width', '560px');
  await audit('dialog-md');
  await screenshot(page, 'dialog-md');
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: 'clip context menu', exact: true })
    .focus();
  await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menu')).toBeVisible();
  await audit('context-menu');
  await screenshot(page, 'context-menu');
  await page.keyboard.press('Escape');
  await expect(page.locator('.ui-context-menu')).toHaveCount(0);
  await page.getByRole('button', { name: 'play preview', exact: true }).focus();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await audit('tooltip');
  await screenshot(page, 'tooltip');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'show info', exact: true }).click();
  await audit('toast');
  await screenshot(page, 'toast');
  await writeFile(
    'docs/phase-01-accessibility.json',
    JSON.stringify(
      {
        engine: 'axe-core/playwright',
        states: reports.map((report) => ({
          state: report.state,
          violations: report.violations.length,
        })),
        disabledRules: [],
      },
      null,
      2,
    ) + '\n',
  );
});

test('real keyboard navigation, editing, removal and autosizing', async ({
  page,
}) => {
  await ready(page);
  const toggle = page.getByRole('switch', { name: 'enable captions' });
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  const segmented = page.getByRole('radiogroup', {
    name: 'video aspect ratio',
  });
  await segmented.getByRole('radio', { name: '16:9' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(segmented.getByRole('radio', { name: '9:16' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(segmented.getByRole('radio', { name: '9:16' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  const slider = page.getByRole('slider', { name: 'clip volume' });
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '73');
  await page.keyboard.press('Home');
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
  await page.keyboard.press('End');
  await expect(slider).toHaveAttribute('aria-valuenow', '100');
  await page.getByRole('tab', { name: 'video', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByRole('tab', { name: 'audio', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await page
    .getByRole('button', { name: 'remove opening-shot.mp4', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'restore video attachment' }),
  ).toBeVisible();
  const textarea = page.getByRole('textbox', { name: 'editing direction' });
  await textarea.fill('one');
  const first = await textarea.evaluate(
    (node) => node.getBoundingClientRect().height,
  );
  await textarea.fill('one\ntwo\nthree\nfour\nfive');
  const after = await textarea.evaluate(
    (node) => node.getBoundingClientRect().height,
  );
  expect(after).toBeGreaterThan(first);
  expect(after).toBeLessThanOrEqual(74);
  const dialogTrigger = page.getByRole('button', { name: 'review sm dialog' });
  await dialogTrigger.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'keep editing' }),
  ).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(
    page.getByRole('button', { name: 'discard edit', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'keep editing' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialogTrigger).toBeFocused();
});

test('reduced motion is static for loops and preserves state changes', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  for (const selector of [
    '.ui-spinner',
    '.ui-live-dot',
    '.ui-avatar-ring',
    '.ui-progress[data-indeterminate] > span',
  ])
    await expect(page.locator(selector).first()).toHaveCSS(
      'animation-name',
      'none',
    );
  const switchControl = page.getByRole('switch', { name: 'enable captions' });
  await switchControl.click();
  await expect(switchControl).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({
    path: 'docs/screens/phase-01-ui-reduced-1440x900.png',
    fullPage: true,
    animations: 'disabled',
  });
  for (const section of [
    'buttons',
    'fields',
    'status',
    'feedback',
    'controls',
    'layout',
    'identity',
  ]) {
    await page
      .locator(`#${section}`)
      .evaluate((element) => element.scrollIntoView({ block: 'start' }));
    await screenshot(page, section);
  }
});

test('mobile reflow and dialog remain inside the viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  await page.getByRole('button', { name: 'review md dialog' }).click();
  const dialog = page.getByRole('dialog', { name: 'discard this edit?' });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box?.width).toBeLessThanOrEqual(358);
  await page.screenshot({
    path: 'docs/screens/phase-01-ui-dialog-mobile-390x844.png',
    animations: 'disabled',
  });
});

test.describe('touch controls', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('slider accepts a touch drag and clears its bubble on cancellation', async ({
    page,
  }) => {
    await ready(page);
    const slider = page.getByRole('slider', { name: 'clip volume' });
    await slider.scrollIntoViewIfNeeded();
    const track = page
      .locator('.ui-slider')
      .filter({ has: slider })
      .locator('.ui-slider-track');
    const box = await track.boundingBox();
    if (!box) throw new Error('Missing slider track');
    const cdp = await page.context().newCDPSession(page);
    const y = box.y + box.height / 2;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: box.x + box.width * 0.2, y }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: box.x + box.width * 0.8, y }],
    });
    await expect
      .poll(async () => Number(await slider.getAttribute('aria-valuenow')))
      .toBeGreaterThan(60);
    await expect(page.locator('.ui-slider-bubble')).toBeVisible();
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchCancel',
      touchPoints: [],
    });
    await expect(page.locator('.ui-slider-bubble')).toHaveCount(0);
  });
});
