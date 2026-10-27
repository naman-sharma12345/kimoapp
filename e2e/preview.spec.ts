import { test, expect, type WebSocketRoute } from '@playwright/test';
import { WebSocket } from 'ws';
import { mkdir, writeFile } from 'node:fs/promises';

test('renders the mock video and responds to playback, seek and fullscreen', async ({
  page,
  request,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await request.post('http://127.0.0.1:8787/v1/sessions', {
    data: { prompt: 'test', assetIds: [], aspect: 'auto' },
  });
  const { sessionId, wsUrl } = (await response.json()) as {
    sessionId: string;
    wsUrl: string;
  };
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('clip did not arrive'));
    }, 30000);
    ws.on('message', (raw) => {
      const event = JSON.parse(raw.toString()) as { t: string; tool?: string };
      if (event.t === 'agent.action.start' && event.tool === 'import_clip') {
        clearTimeout(timer);
        setTimeout(() => {
          ws.close();
          resolve();
        }, 300);
      }
    });
    ws.on('error', reject);
  });
  await page.goto(`/studio/${sessionId}?debug=1`);
  const canvas = page.locator('.studio-preview-canvas');
  await expect(canvas).toBeVisible();
  const play = page.getByRole('button', { name: 'play', exact: true });
  await expect(play).toBeEnabled({ timeout: 20000 });
  await expect
    .poll(async () => (await canvas.screenshot()).length, { timeout: 20000 })
    .toBeGreaterThan(3000);
  await page.screenshot({ path: 'docs/screens/phase-06-preview-1440x900.png' });
  await play.click();
  await expect(
    page.getByRole('button', { name: 'pause playback' }),
  ).toBeVisible();
  await expect
    .poll(async () => page.locator('.studio-time > span').innerText(), {
      timeout: 10000,
    })
    .not.toBe('00:00:00:00');
  await page.getByRole('button', { name: 'pause playback' }).click();
  await page.keyboard.press('Home');
  await expect(page.locator('.studio-time > span')).toHaveText('00:00:00:00');
  await page.getByRole('button', { name: 'preview full' }).click();
  await expect(page.locator('.studio-viewer')).toHaveAttribute(
    'data-fullscreen',
    'true',
  );
  await page.getByRole('button', { name: 'close fullscreen preview' }).click();
  await expect(page.locator('.studio-viewer')).not.toHaveAttribute(
    'data-fullscreen',
  );
  expect(errors).toEqual([]);
});

test('paused project operations redraw the canvas and report non-negative latency', async ({
  page,
  request,
}) => {
  const response = await request.post('http://127.0.0.1:8787/v1/sessions', {
    data: { prompt: 'test', assetIds: [], aspect: 'auto' },
  });
  const { sessionId } = (await response.json()) as { sessionId: string };
  let socket: WebSocketRoute | undefined;
  await page.routeWebSocket('**/v1/sessions/*/ws', (route) => {
    socket = route;
  });
  await page.goto(`/dev/studio/${sessionId}?debug=1`);
  await expect.poll(() => Boolean(socket)).toBe(true);
  const track = {
    id: 'overlay',
    kind: 'overlay',
    name: 'overlay',
    muted: false,
    hidden: false,
    locked: false,
    height: 64,
  };
  const clip = {
    id: 'shape',
    trackId: 'overlay',
    kind: 'text',
    text: { content: 'hello preview', style: 'title-bold' },
    start: 0,
    duration: 5,
    in: 0,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    effects: [],
    keyframes: [],
    speed: 1,
  };
  socket?.send(
    JSON.stringify({
      t: 'project.ops',
      version: 1,
      ops: [
        { op: 'track.add', track },
        { op: 'clip.add', clip },
      ],
    }),
  );
  const canvas = page.locator('.studio-preview-canvas');
  await expect(
    page.getByRole('button', { name: 'play', exact: true }),
  ).toBeEnabled({ timeout: 20000 });
  await expect(page.locator('.studio-debug')).toBeVisible();
  const before = await canvas.screenshot();
  socket?.send(
    JSON.stringify({
      t: 'project.ops',
      version: 2,
      ops: [
        {
          op: 'clip.update',
          id: 'shape',
          patch: { transform: { ...clip.transform, x: 400 } },
        },
      ],
    }),
  );
  await expect
    .poll(async () => (await canvas.screenshot()).equals(before), {
      timeout: 10000,
    })
    .toBe(false);
  const text = await page.locator('.studio-debug').innerText();
  const latency = Number(text.match(/(\d+) ms/)?.[1]);
  expect(Number.isFinite(latency)).toBe(true);
  expect(latency).toBeGreaterThanOrEqual(0);
  await mkdir('tmp', { recursive: true });
  await writeFile(
    'tmp/phase-06-latency.json',
    JSON.stringify({ latencyMs: latency }, null, 2),
  );
});

test('shows guides, action regions and a grayscale mask from session events', async ({
  page,
  request,
}) => {
  const response = await request.post('http://127.0.0.1:8787/v1/sessions', {
    data: { prompt: 'test', assetIds: [], aspect: 'auto' },
  });
  const { sessionId } = (await response.json()) as { sessionId: string };
  let socket: WebSocketRoute | undefined;
  await page.routeWebSocket('**/v1/sessions/*/ws', (route) => {
    socket = route;
  });
  await page.goto(`/dev/studio/${sessionId}`);
  await expect.poll(() => Boolean(socket)).toBe(true);
  const asset = {
    id: 'still',
    kind: 'image',
    name: 'still.png',
    url: 'http://localhost:8787/fixtures/still.png',
    source: 'user',
  };
  const mask = {
    id: 'mask',
    kind: 'image',
    name: 'mask.png',
    url: 'http://localhost:8787/fixtures/mask.png',
    source: 'user',
  };
  const track = {
    id: 'video',
    kind: 'video',
    name: 'video',
    muted: false,
    hidden: false,
    locked: false,
    height: 64,
  };
  const clip = {
    id: 'clip',
    trackId: 'video',
    assetId: 'still',
    kind: 'image',
    start: 0,
    duration: 5,
    in: 0,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    effects: [],
    keyframes: [],
    speed: 1,
  };
  socket?.send(
    JSON.stringify({
      t: 'project.ops',
      version: 1,
      ops: [
        { op: 'track.add', track },
        { op: 'clip.add', clip },
      ],
    }),
  );
  await expect(
    page.getByRole('button', { name: 'play', exact: true }),
  ).toBeEnabled({ timeout: 20000 });
  socket?.send(JSON.stringify({ t: 'asset.added', asset }));
  socket?.send(JSON.stringify({ t: 'asset.added', asset: mask }));
  const canvas = page.locator('.studio-preview-canvas');
  await expect
    .poll(async () => (await canvas.screenshot()).length, { timeout: 20000 })
    .toBeGreaterThan(1000);
  await page.waitForTimeout(500);
  const before = await canvas.screenshot();
  socket?.send(
    JSON.stringify({
      t: 'project.ops',
      version: 2,
      ops: [
        {
          op: 'clip.update',
          id: 'clip',
          patch: {
            mask: {
              kind: 'sam',
              maskAssetId: 'mask',
              invert: false,
              feather: 0,
            },
          },
        },
      ],
    }),
  );
  await expect
    .poll(async () => (await canvas.screenshot()).equals(before), {
      timeout: 10000,
    })
    .toBe(false);
  socket?.send(
    JSON.stringify({
      t: 'agent.action.start',
      id: 'mask-action',
      tool: 'segment_subject',
      title: 'isolate subject',
      args: {},
      target: { region: { x: 0.2, y: 0.2, w: 0.6, h: 0.6 } },
    }),
  );
  socket?.send(
    JSON.stringify({
      t: 'sam.mask',
      clipId: 'clip',
      maskAssetId: 'mask',
      previewPolygon: [
        [0.2, 0.2],
        [0.8, 0.2],
        [0.8, 0.8],
        [0.2, 0.8],
      ],
    }),
  );
  await expect(page.locator('.studio-ai-region')).toBeVisible();
  await expect(page.locator('.studio-mask-preview')).toBeVisible();
  await page.locator('.studio-viewer').hover();
  await page.getByRole('button', { name: 'toggle guides' }).click();
  await expect(page.locator('.studio-guide-lines')).toBeVisible();
  await page.screenshot({
    path: 'docs/screens/phase-06-overlays-1440x900.png',
  });
});
