import { test, expect, type WebSocketRoute } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { copyFile, mkdir } from 'node:fs/promises';

test.use({ viewport: { width: 1440, height: 900 } });

test('real thumbnails, progress, notices and cancellation', async ({
  page,
  request,
}) => {
  let socket: WebSocketRoute | undefined;
  await page.routeWebSocket('**/v1/sessions/*/ws', (route) => {
    socket = route;
  });
  await page.goto('/');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await expect(page.locator('.landing-brand-mark')).toHaveCSS(
    'background-image',
    /kimo-mark\.svg/,
  );
  await page
    .getByRole('textbox', { name: 'describe your video' })
    .fill('a quiet travel film');
  await page
    .locator('input[type=file]')
    .setInputFiles([
      path.resolve('packages/mock-server/fixtures/still.png'),
      path.resolve('packages/mock-server/fixtures/study-1.mp4'),
    ]);
  await page.getByRole('button', { name: 'start editing' }).click();
  await expect(page).toHaveURL(/\/warmup\//);
  await expect.poll(() => Boolean(socket)).toBe(true);
  await expect(page.locator('.warmup-tile img').first()).toBeVisible();
  await expect(page.locator('.warmup-brand-mark')).toHaveCSS(
    'background-image',
    /kimo-mark\.svg/,
  );
  await expect(page.locator('.warmup-bar')).toHaveCount(9);
  await expect(page.locator('.warmup-logo-playhead')).toBeVisible();
  socket?.send(
    JSON.stringify({
      t: 'warmup.step',
      step: 'watch',
      pct: 0.6,
      clipIndex: 3,
      clipCount: 7,
    }),
  );
  socket?.send(
    JSON.stringify({
      t: 'agent.status',
      state: 'thinking',
      label: 'reading every frame…',
    }),
  );
  await expect(
    page.getByText('watching your footage · clip 3 of 7'),
  ).toBeVisible();
  await expect(page.locator('.warmup-notice')).toContainText(
    'reading every frame…',
  );
  await expect(
    page.locator('.warmup-notice > span[aria-hidden="true"]').last(),
  ).toHaveText('reading every frame…');
  await mkdir('docs/screens', { recursive: true });
  await page.screenshot({ path: 'docs/screens/phase-04-watch-1440x900.png' });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  socket?.send(JSON.stringify({ t: 'warmup.step', step: 'plan', pct: 0.8 }));
  await expect(page.locator('video[data-compositor-preload]')).toHaveCount(1);
  await page.getByRole('button', { name: 'cancel', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'stop this edit?' }),
  ).toBeVisible();
  await page.screenshot({
    path: 'docs/screens/phase-04-cancel-1440x900.png',
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'keep going' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const id = page.url().split('/').at(-1);
  await page.getByRole('button', { name: 'cancel', exact: true }).click();
  await page.getByRole('button', { name: 'stop', exact: true }).click();
  await expect(page).toHaveURL('/');
  const snapshot = (await (
    await request.get(`http://127.0.0.1:8787/v1/sessions/${id}`)
  ).json()) as { assets: unknown[]; status: string };
  expect(snapshot.status).toBe('failed');
  expect(snapshot.assets).toHaveLength(2);
});

test('fallback, long wait, reduced motion and server errors', async ({
  page,
  request,
}) => {
  let socket: WebSocketRoute | undefined;
  const created = await request.post('http://127.0.0.1:8787/v1/sessions', {
    data: { prompt: 'test', assetIds: [], aspect: 'auto' },
  });
  const { sessionId } = (await created.json()) as { sessionId: string };
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((id) => {
    sessionStorage.setItem(
      `kimo.warmup.started.${id}`,
      String(Date.now() - 61000),
    );
  }, sessionId);
  await page.routeWebSocket('**/v1/sessions/*/ws', (route) => {
    socket = route;
  });
  await page.goto(`/warmup/${sessionId}`);
  await expect.poll(() => Boolean(socket)).toBe(true);
  socket?.send(JSON.stringify({ t: 'warmup.step', step: 'watch', pct: 0.5 }));
  await expect(
    page.getByText('taking longer than usual, big files take a moment'),
  ).toBeVisible();
  await expect(page.locator('.warmup-notice')).toContainText(
    'reading every frame…',
    { timeout: 6000 },
  );
  await expect(page.locator('.warmup-track')).toHaveCSS(
    'animation-name',
    'none',
  );
  await page.screenshot({
    path: 'docs/screens/phase-04-reduced-390x844.png',
    animations: 'disabled',
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  socket?.send(
    JSON.stringify({
      t: 'error',
      code: 'ws_failed',
      message: 'Simulated WebSocket failure',
    }),
  );
  await expect(
    page.getByRole('heading', { name: 'kimo couldn’t start this edit' }),
  ).toBeVisible();
  await expect(page.getByText('Simulated WebSocket failure')).toBeVisible();
  await page.screenshot({
    path: 'docs/screens/phase-04-error-390x844.png',
    animations: 'disabled',
  });
});

test('real mock events open the studio route', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await page
    .getByRole('textbox', { name: 'describe your video' })
    .fill('a small film');
  await page.getByRole('button', { name: 'start editing' }).click();
  await expect(page).toHaveURL(/\/warmup\//);
  await expect(page).toHaveURL(/\/studio\//, { timeout: 30000 });
  await expect(page.getByRole('region', { name: 'viewer' })).toBeVisible({
    timeout: 10000,
  });
});

test('records the 1920px transition', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: 'tmp/phase-04-video',
      size: { width: 1920, height: 1080 },
    },
  });
  const page = await context.newPage();
  await page.goto('http://localhost:3000/');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await page
    .getByRole('textbox', { name: 'describe your video' })
    .fill('a small film');
  await page
    .locator('input[type=file]')
    .setInputFiles(path.resolve('packages/mock-server/fixtures/still.png'));
  await page.getByRole('button', { name: 'start editing' }).click();
  await expect(page).toHaveURL(/\/warmup\//);
  await page.screenshot({ path: 'docs/screens/phase-04-warmup-1920x1080.png' });
  await expect(page).toHaveURL(/\/studio\//, { timeout: 30000 });
  await expect(page.getByRole('region', { name: 'viewer' })).toBeVisible();
  await page.waitForTimeout(1500);
  const video = page.video();
  await context.close();
  if (!video) throw new Error('Playwright did not create the transition video');
  await copyFile(await video.path(), 'tmp/phase-04-source.webm');
});
