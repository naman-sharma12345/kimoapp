import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

test.use({ viewport: { width: 1440, height: 900 } });

test('landing composer supports prompts, settings, attachments, and handoff', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  const composer = page.getByRole('textbox', { name: 'describe your video' });
  await expect(composer).toBeFocused();
  await expect(composer).toHaveCSS('box-shadow', 'none');
  await page.getByRole('button', { name: /trip montage/ }).click();
  await expect(composer).toHaveValue(
    'a 30 second reel of my trip to manali, upbeat, with captions',
  );
  await page.getByRole('button', { name: 'aspect ratio: auto' }).click();
  await page.getByRole('menuitem', { name: '9:16' }).click();
  await expect(
    page.getByRole('button', { name: 'aspect ratio: 9:16' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'video length: any length' }).click();
  await page.getByRole('menuitem', { name: '30s' }).click();
  await expect(
    page.getByRole('button', { name: 'video length: 30s' }),
  ).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello'),
  });
  await expect(page.getByText('notes.txt')).toBeVisible();
  await composer.focus();
  await page.screenshot({
    path: 'docs/screens/phase-02-landing-focused-files-1440x900.png',
    animations: 'disabled',
  });
  await composer.press('Enter');
  await expect(page).toHaveURL(/\/warmup\//, { timeout: 30000 });
  await expect(
    page.getByRole('heading', { name: 'getting your video ready' }),
  ).toBeVisible();
});

test('failed session keeps the prompt and files', async ({ page }) => {
  await page.route('**/v1/sessions', (route) =>
    route.fulfill({
      status: 503,
      headers: {
        'access-control-allow-origin': '*',
        'content-type': 'application/json',
      },
      body: '{"code":"failed","message":"unavailable"}',
    }),
  );
  await page.goto('/');
  const composer = page.getByRole('textbox', { name: 'describe your video' });
  await composer.fill('my unfinished edit');
  await page.locator('input[type=file]').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello'),
  });
  await composer.press('Enter');
  await expect(
    page.getByText(
      'couldn’t start a session. your files are still here, try again.',
    ),
  ).toBeVisible();
  await expect(composer).toHaveValue('my unfinished edit');
  await expect(page.getByText('notes.txt')).toBeVisible();
});

test('drag overlay, rejection, and accessible landing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  const dataTransfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    return data;
  });
  await page.locator('body').dispatchEvent('dragenter', { dataTransfer });
  await expect(
    page.getByText('drop to add to your video').first(),
  ).toBeAttached();
  await page.screenshot({
    path: 'docs/screens/phase-02-landing-drag-1440x900.png',
    animations: 'disabled',
  });
  await page.locator('body').dispatchEvent('drop', { dataTransfer });
  await expect(page.getByText('notes.txt')).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({
    name: 'bad.exe',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('x'),
  });
  await expect(
    page.getByText('bad.exe can’t be used: that file type isn’t supported yet'),
  ).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations,
    JSON.stringify(
      results.violations.map(({ id, nodes }) => ({
        id,
        targets: nodes.map((node) => node.target),
      })),
    ),
  ).toEqual([]);
});

test('mobile settings and social image', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await page.getByRole('button', { name: 'video settings' }).click();
  await page.getByRole('button', { name: '9:16' }).click();
  await expect(page.getByRole('button', { name: '9:16' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'done' }).click();
  const response = await request.get('/opengraph-image');
  expect(response.ok()).toBe(true);
  const image = await response.body();
  expect(image.readUInt32BE(16)).toBe(1200);
  expect(image.readUInt32BE(20)).toBe(630);
  expect((await readFile('apps/web/public/grain.png')).length).toBeGreaterThan(
    0,
  );
});
