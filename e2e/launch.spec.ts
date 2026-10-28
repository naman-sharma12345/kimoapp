import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { seedSession as seed } from './seed-session';
import type { SessionSnapshot } from '../packages/kimo-client/src/schema';
const api = 'http://localhost:8787';

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
test('privacy, anonymous limit and mock httpOnly sign-in', async ({
  page,
  context,
}) => {
  await page.goto('/privacy');
  await expect(
    page.getByRole('heading', { name: 'privacy', exact: true }),
  ).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.goto('/');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.request.get(`${api}/v1/auth/session`);
  await page.request.post(`${api}/v1/sessions`, {
    data: { prompt: 'first', aspect: 'auto', assetIds: [] },
  });
  await page
    .getByRole('textbox', { name: 'describe your video' })
    .fill('second video');
  await page.getByRole('button', { name: 'start editing' }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'sign in to keep making videos',
  );
  await page.screenshot({ path: 'docs/screens/phase-10-auth.png' });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'continue with google' }).click();
  await page.waitForURL('/');
  expect(
    (await context.cookies(api)).some(
      (c) => c.name === 'kimo_mock' && c.httpOnly,
    ),
  ).toBe(true);
  expect(
    (
      (await (await page.request.get(`${api}/v1/auth/session`)).json()) as {
        signedIn: boolean;
      }
    ).signedIn,
  ).toBe(true);
});
test('offline edit persists in IndexedDB and reconnect replays exactly once', async ({
  page,
  context,
}) => {
  const id = await seed(page);
  await context.setOffline(true);
  await page.keyboard.press('Control+p');
  await page
    .getByRole('combobox', { name: 'search commands' })
    .fill('add text');
  await page.getByRole('combobox', { name: 'search commands' }).press('Enter');
  await expect(page.getByText('1 edits kept locally')).toBeVisible();
  const pending = await page.evaluate(
    async (sessionId) =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open('kimo-edits', 1);
        request.onsuccess = () => {
          const db = request.result;
          const read = db
            .transaction('outbox')
            .objectStore('outbox')
            .get(sessionId);
          read.onsuccess = () => {
            resolve((read.result as unknown[]).length);
            db.close();
          };
          read.onerror = () => reject(read.error);
        };
      }),
    id,
  );
  expect(pending).toBe(1);
  await page.screenshot({ path: 'docs/screens/phase-10-offline.png' });
  await context.setOffline(false);
  await expect(page.getByText('1 edits kept locally')).toHaveCount(0, {
    timeout: 20000,
  });
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'finish', exact: true }),
  ).toBeVisible();
  const snapshot = (await (
    await page.request.get(`${api}/v1/sessions/${id}`)
  ).json()) as SessionSnapshot;
  expect(
    Object.values(snapshot.project.clips).filter(
      (c) => c.text?.content === 'your text',
    ),
  ).toHaveLength(1);
});
test('versions, comparison, palette and export options work end to end', async ({
  page,
}) => {
  test.setTimeout(120000);
  await seed(page);
  await page.getByLabel('versions').selectOption('cut 1');
  await expect(page.getByText('viewing cut 1 · read-only')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'undo', exact: true }),
  ).toBeDisabled();
  await expect(page.locator('.agent-panel')).toHaveAttribute('inert', '');
  await page.getByRole('button', { name: 'back to current cut' }).click();
  await page.getByLabel('compare cuts').selectOption('cut 1');
  await expect(page.getByLabel('comparison split position')).toBeVisible();
  await page.getByLabel('comparison split position').fill('35');
  await page.screenshot({ path: 'docs/screens/phase-10-compare.png' });
  await page.getByRole('button', { name: 'close comparison' }).click();
  await page.keyboard.press('Control+p');
  await expect(
    page.getByRole('combobox', { name: 'search commands' }),
  ).toBeFocused();
  await page.screenshot({ path: 'docs/screens/phase-10-commands.png' });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'toggle beat grid' }).click();
  await expect(
    page.getByRole('button', { name: 'toggle beat grid' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'finish', exact: true }).click();
  await page.getByText('more options', { exact: true }).click();
  await page.getByLabel('resolution', { exact: true }).selectOption('720p');
  await page.getByLabel('format', { exact: true }).selectOption('webm');
  await page.getByLabel('also export 9:16 version').check();
  await page.screenshot({ path: 'docs/screens/phase-10-export.png' });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'render 720p', exact: true }).click();
  await expect(page).toHaveURL(/\/v\//, { timeout: 60000 });
  await expect(page.getByRole('link', { name: 'download webm' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'download captions (.srt)' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'view 9:16 version' }),
  ).toBeVisible();
  await page.screenshot({ path: 'docs/screens/phase-10-delivery.png' });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
for (const [width, height] of [
  [1920, 1080],
  [1440, 900],
  [1280, 800],
  [1180, 820],
  [390, 844],
]) {
  test(`responsive ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width: width ?? 1440, height: height ?? 900 });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `docs/screens/phase-10-landing-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
