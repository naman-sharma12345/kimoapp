import {
  test,
  expect,
  type Page,
  type APIRequestContext,
  type WebSocketRoute,
} from '@playwright/test';
import { WebSocket } from 'ws';
import { readFile } from 'node:fs/promises';
import {
  type RenderSnapshot,
  type SessionSnapshot,
} from '../packages/kimo-client/src/index';
import AxeBuilder from '@axe-core/playwright';
const api = 'http://127.0.0.1:8787';
test.use({ video: { mode: 'on', size: { width: 1440, height: 900 } } });
async function seed(
  request: APIRequestContext,
  aspect: '16:9' | '9:16' = '16:9',
) {
  const response = await request.post(`${api}/v1/sessions`, {
    data: { prompt: 'a considered travel reel', assetIds: [], aspect },
  });
  const created = (await response.json()) as {
    sessionId: string;
    wsUrl: string;
  };
  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(created.wsUrl);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('Warm-up timed out'));
    }, 20000);
    socket.on('error', reject);
    socket.on('message', (raw) => {
      const event = JSON.parse(raw.toString()) as {
        t: string;
        step?: string;
        label?: string;
      };
      if (event.t === 'warmup.step' && event.step === 'ready')
        socket.send(JSON.stringify({ t: 'pause' }));
      if (event.t === 'agent.status' && event.label === 'paused') {
        clearTimeout(timer);
        socket.close();
        resolve();
      }
    });
  });
  const prepared = await request.post(`${api}/v1/uploads`, {
    data: {
      files: [
        {
          name: 'still.png',
          size: (await readFile('apps/web/public/dev/still.png')).length,
          mime: 'image/png',
        },
      ],
    },
  });
  const { uploads } = (await prepared.json()) as {
    uploads: {
      assetId: string;
      putUrl: string;
      headers: Record<string, string>;
    }[];
  };
  const asset = uploads[0];
  if (!asset) throw new Error('Missing upload');
  await request.put(asset.putUrl, {
    headers: asset.headers,
    data: await readFile('apps/web/public/dev/still.png'),
  });
  await request.post(`${api}/v1/sessions/${created.sessionId}/assets/add`, {
    data: { assetIds: [asset.assetId] },
  });
  const snapshot = (await (
    await request.get(`${api}/v1/sessions/${created.sessionId}`)
  ).json()) as SessionSnapshot;
  const track = {
    id: 'picture',
    kind: 'overlay',
    name: 'picture',
    height: 88,
    hidden: false,
    locked: false,
    muted: false,
  };
  const edited = await request.post(
    `${api}/v1/sessions/${created.sessionId}/ops`,
    {
      data: {
        baseVersion: snapshot.project.version,
        ops: [
          { op: 'track.add', track },
          {
            op: 'clip.add',
            clip: {
              id: 'picture',
              trackId: 'picture',
              kind: 'image',
              assetId: asset.assetId,
              start: 0,
              duration: 24,
              in: 0,
              speed: 1,
              transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
              effects: [],
              keyframes: [],
            },
          },
        ],
      },
    },
  );
  expect(edited.ok()).toBe(true);
  return created.sessionId;
}
async function review(page: Page) {
  await page.getByRole('button', { name: 'finish', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'ready to render?', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'current cut at 0:01', exact: true }),
  ).toBeVisible({ timeout: 15000 });
}
test('full review, real render, restore, delivery controls and download', async ({
  page,
  request,
  context,
  browser,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      value: undefined,
      configurable: true,
    });
  });
  const response = await request.post(`${api}/v1/sessions`, {
    data: { prompt: 'a quiet film', assetIds: [], aspect: '16:9' },
  });
  const { sessionId } = (await response.json()) as { sessionId: string };
  await page.goto(`/warmup/${sessionId}`);
  await page.waitForURL(`**/studio/${sessionId}`, { timeout: 30000 });
  await expect(
    page
      .getByRole('button', { name: 'looks good, render it', exact: true })
      .last(),
  ).toBeVisible({ timeout: 90000 });
  await expect(page.locator('.studio-status-pill')).toContainText(
    'waiting for you',
  );
  await page
    .getByRole('button', { name: 'watch the first cut', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'pause playback', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'pause playback', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'ask for changes', exact: true })
    .last()
    .click();
  await expect(
    page.getByRole('textbox', {
      name: 'tell kimo what to change',
      exact: true,
    }),
  ).toBeFocused();
  await expect(
    page.getByRole('textbox', {
      name: 'tell kimo what to change',
      exact: true,
    }),
  ).toHaveAttribute('data-placeholder', 'what should kimo change?');
  await page
    .getByRole('button', { name: 'looks good, render it', exact: true })
    .last()
    .click();
  await expect(
    page.getByRole('dialog', { name: 'ready to render?', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'current cut at 0:01', exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByRole('switch', { name: 'burn in captions', exact: true }),
  ).toBeChecked();
  await page.screenshot({ path: 'docs/screens/phase-09-review-1440x900.png' });
  await page
    .getByRole('switch', { name: 'burn in captions', exact: true })
    .click();
  const approval = page.waitForRequest(
    (request) =>
      request.url().endsWith('/approve') && request.method() === 'POST',
  );
  await page.getByRole('button', { name: 'render 1080p', exact: true }).click();
  expect((await approval).postDataJSON()).toMatchObject({
    burnInCaptions: false,
  });
  await page.waitForURL(`**/render/${sessionId}`);
  await expect(page.locator('.render-filmstrip img').nth(1)).toBeVisible({
    timeout: 15000,
  });
  await expect(
    page.getByText(
      'you can close this tab, we’ll keep rendering. come back to this link anytime.',
      { exact: true },
    ),
  ).toBeVisible();
  await page.screenshot({ path: 'docs/screens/phase-09-render-1440x900.png' });
  const progressed = Number(
    await page.getByRole('progressbar').getAttribute('aria-valuenow'),
  );
  await page.reload();
  await expect(page.getByRole('progressbar')).toBeVisible();
  expect(
    Number(await page.getByRole('progressbar').getAttribute('aria-valuenow')),
  ).toBeGreaterThanOrEqual(progressed);
  await page.waitForURL('**/v/*', { timeout: 40000 });
  await expect(page.locator('[data-delivery-ready]')).toBeVisible();
  await page
    .getByRole('button', { name: 'how kimo made it', exact: true })
    .click();
  await expect(page.locator('.delivery-history')).toContainText(
    'models used: muse spark 1.3, sam 3.1, muse voice transcribe',
  );
  const player = page.getByRole('region', {
    name: 'video player',
    exact: true,
  });
  await expect
    .poll(() =>
      page
        .locator('video')
        .evaluate((video) => (video as HTMLVideoElement).readyState),
    )
    .toBeGreaterThanOrEqual(1);
  await player.focus();
  await player.press('k');
  await expect
    .poll(() =>
      page
        .locator('video')
        .evaluate((video) => (video as HTMLVideoElement).paused),
    )
    .toBe(false);
  await player.press('k');
  await player.press('l');
  expect(
    await page
      .locator('video')
      .evaluate((video) => (video as HTMLVideoElement).currentTime),
  ).toBeGreaterThanOrEqual(9.9);
  await player.press('j');
  await player.press('m');
  expect(
    await page
      .locator('video')
      .evaluate((video) => (video as HTMLVideoElement).muted),
  ).toBe(true);
  await player.press('m');
  await page.getByLabel('playback speed', { exact: true }).selectOption('1.5');
  expect(
    await page
      .locator('video')
      .evaluate((video) => (video as HTMLVideoElement).playbackRate),
  ).toBe(1.5);
  await player.focus();
  await player.press('f');
  await expect
    .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(true);
  await player.press('f');
  await expect
    .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(false);
  await page.getByRole('button', { name: 'copy link', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'link copied' }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    page.url(),
  );
  await page.getByRole('button', { name: 'share', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'WhatsApp', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'download mp4', exact: true }).click();
  expect((await download).suggestedFilename()).toBe(
    'untitled-video-kimo-1080p.mp4',
  );
  await page.screenshot({
    path: 'docs/screens/phase-09-delivery-1440x900.png',
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    /noindex/,
  );
  await expect(page.locator('meta[property="og:video"]')).toHaveAttribute(
    'content',
    /\/v1\/videos\//,
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data: ShareData) => {
        (window as unknown as { shared: ShareData }).shared = data;
        return Promise.resolve();
      },
    });
  });
  await page.getByRole('button', { name: 'share', exact: true }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as { shared: ShareData }).shared.url,
    ),
  ).toBe(page.url());
  const visitor = await browser.newContext();
  const publicPage = await visitor.newPage();
  await publicPage.goto(page.url());
  await expect(
    publicPage.getByRole('link', { name: 'download mp4', exact: true }),
  ).toBeVisible();
  await visitor.close();
  const recording = page.video();
  await page.close();
  if (recording)
    await recording.saveAs(
      'docs/screens/phase-09-approve-render-delivery.webm',
    );
});
test('render now confirms, cancellation preserves the project, and idle finish shows settings', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const sessionId = await seed(request);
  let socket: WebSocketRoute | undefined;
  await page.routeWebSocket('**/v1/sessions/*/ws', (route) => {
    socket = route;
    route.onMessage(() => undefined);
  });
  await page.goto(`/studio/${sessionId}`);
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await expect.poll(() => Boolean(socket)).toBe(true);
  socket?.send(
    JSON.stringify({
      t: 'agent.action.start',
      id: 'live',
      tool: 'trim_clip',
      title: 'trimming the opening',
      args: {},
      target: { clipId: 'picture' },
    }),
  );
  await page.getByRole('button', { name: 'finish', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'render now?', exact: true }),
  ).toContainText(
    'kimo is still working on: trimming the opening. you can render now or let it finish.',
  );
  await page.screenshot({
    path: 'docs/screens/phase-09-render-now-1440x900.png',
  });
  await page
    .getByRole('button', { name: 'let kimo finish', exact: true })
    .click();
  await page.getByRole('button', { name: 'finish', exact: true }).click();
  const before = (await (
    await request.get(`${api}/v1/sessions/${sessionId}`)
  ).json()) as SessionSnapshot;
  await page.getByRole('button', { name: 'render now', exact: true }).click();
  await page.waitForURL(`**/render/${sessionId}`);
  await page
    .getByRole('button', { name: 'back to editing', exact: true })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'cancel the render?', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'keep rendering', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'back to editing', exact: true })
    .click();
  await page.screenshot({ path: 'docs/screens/phase-09-cancel-1440x900.png' });
  await page
    .getByRole('button', { name: 'cancel render', exact: true })
    .click();
  await page.waitForURL(`**/studio/${sessionId}`);
  const after = (await (
    await request.get(`${api}/v1/sessions/${sessionId}`)
  ).json()) as SessionSnapshot;
  expect(after.project).toEqual(before.project);
  await review(page);
  await expect(
    page.getByRole('switch', { name: 'burn in captions', exact: true }),
  ).not.toBeChecked();
  await page.getByRole('button', { name: 'keep editing', exact: true }).click();
});
test('failure retry and portrait delivery with reduced motion and expired edit', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const sessionId = await seed(request, '9:16');
  let injectFailure = true;
  await page.route('**/v1/renders/*', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const value = (await response.json()) as RenderSnapshot;
    if (injectFailure) {
      injectFailure = false;
      const id = new URL(route.request().url()).pathname.split('/').at(-1);
      await request.post(`${api}/v1/renders/${id}/cancel`, { data: {} });
      await route.fulfill({
        json: {
          ...value,
          status: 'failed',
          error: 'the encoder stopped before finishing',
        },
      });
    } else await route.fulfill({ response });
  });
  let socket: WebSocketRoute | undefined;
  await page.routeWebSocket('**/v1/sessions/*/ws', (route) => {
    socket = route;
    route.onMessage(() => undefined);
  });
  await page.goto(`/studio/${sessionId}`);
  await expect.poll(() => Boolean(socket)).toBe(true);
  socket?.send(
    JSON.stringify({
      t: 'agent.message',
      id: 'portrait-review',
      role: 'agent',
      kind: 'ask_review',
      text: 'your portrait cut is ready',
    }),
  );
  await page
    .getByRole('button', { name: 'looks good, render it', exact: true })
    .click();
  await page.getByRole('button', { name: 'render 1080p', exact: true }).click();
  await page.waitForURL(`**/render/${sessionId}`);
  await expect(
    page.getByRole('heading', {
      name: 'the render hit a problem',
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: 'docs/screens/phase-09-failure-390x844.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'try again', exact: true }).click();
  await expect(page.getByRole('progressbar')).not.toHaveAttribute(
    'data-failed',
  );
  await expect(page.locator('.render-scan')).toHaveCount(0);
  await page.waitForURL('**/v/*', { timeout: 40000 });
  await expect(page.locator('.delivery-player')).toHaveAttribute(
    'data-vertical',
  );
  const box = await page.locator('.delivery-player').boundingBox();
  expect(box?.width).toBeLessThanOrEqual(420);
  expect((box?.height ?? 0) / (box?.width ?? 1)).toBeCloseTo(16 / 9, 1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.dataset.renderTransition ?? '',
      ),
    )
    .toBe('');
  await expect(
    page.getByRole('link', { name: 'download mp4', exact: true }),
  ).toHaveCSS('opacity', '1');
  await page.screenshot({
    path: 'docs/screens/phase-09-delivery-portrait-390x844.png',
    fullPage: true,
  });
  // Expiration is evaluated on the client without changing public video access.
  await page.clock.install({ time: new Date(2000000000000) });
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'edit again', exact: true }),
  ).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', { name: 'edit again', exact: true }).focus();
  await expect(page.getByRole('tooltip')).toContainText(
    'this edit has expired',
  );
});

test('all render stages reflect progress, preview frames update, and history stays intact on cancel', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const sessionId = await seed(request);
  const approved = await request.post(
    `${api}/v1/sessions/${sessionId}/approve`,
    { data: { title: 'stage study' } },
  );
  const { renderId } = (await approved.json()) as { renderId: string };
  const initial = (await (
    await request.get(`${api}/v1/renders/${renderId}`)
  ).json()) as RenderSnapshot;
  let progress = 0.2;
  await page.route('**/v1/renders/*', async (route) => {
    await route.fulfill({
      json: {
        ...initial,
        status: 'rendering',
        progress,
        frame: Math.floor(initial.totalFrames * progress),
        etaSec: 12,
      },
    });
  });
  await page.goto(`/render/${sessionId}`);
  for (const [value, label] of [
    [0.2, 'composing frames'],
    [0.9, 'mixing audio'],
    [0.97, 'encoding 1080p'],
    [0.995, 'finishing up'],
  ] as const) {
    progress = value;
    await expect(
      page.getByRole('heading', { name: label, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      String(Math.round(value * 100)),
    );
  }
  await expect(page.locator('.render-filmstrip img').last()).toBeVisible();
  await page.screenshot({
    path: 'docs/screens/phase-09-finishing-1440x900.png',
  });
  await page.unroute('**/v1/renders/*');
  await request.post(`${api}/v1/renders/${renderId}/cancel`, { data: {} });
  await page.waitForURL(`**/studio/${sessionId}`);
});
