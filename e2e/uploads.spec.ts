import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, open, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { WebSocket } from 'ws';

test.use({ viewport: { width: 1440, height: 900 } });
async function ready(page: Page) {
  await page.goto('/');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
}
async function shot(page: Page, name: string) {
  await mkdir('docs/screens', { recursive: true });
  await page.screenshot({
    path: `docs/screens/phase-03-${name}-1440x900.png`,
    animations: 'disabled',
  });
}
async function cachedMedia(page: Page) {
  return page.evaluate(
    () =>
      new Promise<
        {
          name: string;
          width?: number;
          duration?: number;
          thumbnail: boolean;
          frames: number;
          waveform: number;
          timeline: number;
          done: boolean;
        }[]
      >((resolve, reject) => {
        const request = indexedDB.open('kimo-media', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db
            .transaction('media', 'readonly')
            .objectStore('media')
            .getAll();
          read.onsuccess = () => {
            const records = read.result as {
              file: File;
              meta: {
                width?: number;
                durationSec?: number;
                waveform?: Float32Array;
              };
              thumbnail?: Blob;
              filmstrip?: Blob[];
              timelineWaveform?: Float32Array;
              done?: boolean;
            }[];
            resolve(
              records.map((item) => ({
                name: item.file.name,
                width: item.meta.width,
                duration: item.meta.durationSec,
                thumbnail: Boolean(item.thumbnail),
                frames: item.filmstrip?.length ?? 0,
                waveform: item.meta.waveform?.length ?? 0,
                timeline: item.timelineWaveform?.length ?? 0,
                done: Boolean(item.done),
              })),
            );
            db.close();
          };
          read.onerror = () => reject(read.error);
        };
      }),
  );
}

test('five files use multipart, prepare media, continue through navigation and refresh', async ({
  page,
}) => {
  test.setTimeout(120000);
  await mkdir('tmp', { recursive: true });
  const large = path.resolve('tmp/phase-03-large.txt');
  const handle = await open(large, 'w');
  await handle.truncate(150 * 1024 ** 2);
  await handle.close();
  const note = path.resolve('tmp/phase-03-notes.txt');
  await writeFile(note, 'the opening shot should feel calm');
  let completed = 0;
  let completedWhenSessionStarted = -1;
  let multipart = false;
  await page.route('**/mock-r2/**', async (route) => {
    if (route.request().method() === 'PUT') {
      multipart ||= /\/\d+$/.test(route.request().url());
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    await route.continue();
  });
  page.on('requestfinished', (request) => {
    if (request.method() === 'PUT' && request.url().includes('/mock-r2/'))
      completed++;
  });
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/v1/sessions'))
      completedWhenSessionStarted = completed;
  });
  await ready(page);
  const prompt = '  a calm film\nkeep my words exactly  ';
  await page.getByRole('textbox', { name: 'describe your video' }).fill(prompt);
  await page
    .locator('input[type=file]')
    .setInputFiles([
      large,
      note,
      path.resolve('packages/mock-server/fixtures/still.png'),
      path.resolve('packages/mock-server/fixtures/quiet-study.wav'),
      path.resolve('packages/mock-server/fixtures/study-1.mp4'),
    ]);
  await page.getByRole('button', { name: 'start editing' }).click();
  await expect(page).toHaveURL(/\/warmup\//, { timeout: 30000 });
  await expect(
    page.getByRole('heading', { name: 'getting your video ready' }),
  ).toBeVisible();
  expect(completedWhenSessionStarted).toBeLessThan(5);
  await shot(page, 'uploads-running');
  const saved = await page.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem('kimo.session.v1') ?? '{}') as {
        prompt: string;
        assetLocalMap: Record<string, string>;
      },
  );
  expect(saved.prompt).toBe(prompt);
  expect(Object.keys(saved.assetLocalMap)).toHaveLength(5);
  page.on('dialog', (dialog) => void dialog.accept());
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'getting your video ready' }),
  ).toBeVisible();
  await expect
    .poll(
      async () => (await cachedMedia(page)).filter((item) => item.done).length,
      { timeout: 60000 },
    )
    .toBe(5);
  expect(multipart).toBe(true);
  await expect
    .poll(
      async () =>
        (await cachedMedia(page)).find((item) => item.name === 'study-1.mp4')
          ?.frames,
      { timeout: 30000 },
    )
    .toBe(8);
  const media = await cachedMedia(page);
  expect(media.find((item) => item.name === 'still.png')?.thumbnail).toBe(true);
  expect(media.find((item) => item.name === 'study-1.mp4')?.thumbnail).toBe(
    true,
  );
  expect(media.find((item) => item.name === 'quiet-study.wav')?.waveform).toBe(
    64,
  );
  expect(
    media.find((item) => item.name === 'quiet-study.wav')?.timeline,
  ).toBeGreaterThan(0);
  await shot(page, 'uploads-complete');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('upload error chips retry successfully and preserve the first message', async ({
  page,
}) => {
  test.setTimeout(60000);
  let failing = true;
  await page.route('**/mock-r2/**', (route) =>
    failing
      ? route.fulfill({
          status: 503,
          headers: {
            'access-control-allow-origin': '*',
            'content-type': 'application/json',
          },
          body: '{"code":"upload_failed","message":"Simulated upload failure"}',
        })
      : route.continue(),
  );
  await ready(page);
  await page
    .getByRole('textbox', { name: 'describe your video' })
    .fill('keep this draft');
  await page.locator('input[type=file]').setInputFiles({
    name: 'retry.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('test'),
  });
  await page.getByRole('button', { name: 'start editing' }).click();
  await expect(page.getByText('1 file failed ·')).toBeVisible({
    timeout: 30000,
  });
  await expect(
    page.getByRole('button', { name: 'retry', exact: true }),
  ).toBeVisible();
  await shot(page, 'upload-error');
  failing = false;
  await page.getByRole('button', { name: 'retry', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await cachedMedia(page)).find((item) => item.name === 'retry.txt')
          ?.done,
    )
    .toBe(true);
  await expect(page).toHaveURL(/\/studio\//, { timeout: 30000 });
  await expect(
    page.getByText('keep this draft', { exact: true }),
  ).toBeVisible();
});

test('offline pause and resume keeps the upload recoverable', async ({
  page,
  context,
}) => {
  let releaseUpload: () => void = () => undefined;
  const holdUpload = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  await page.route('**/mock-r2/**', async (route) => {
    await holdUpload;
    await route.continue().catch(() => undefined);
  });
  await ready(page);
  await page
    .getByRole('textbox', { name: 'describe your video' })
    .fill('a short edit');
  await page.locator('input[type=file]').setInputFiles({
    name: 'offline.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('test'),
  });
  await page.getByRole('button', { name: 'start editing' }).click();
  await expect(page).toHaveURL(/\/warmup\//);
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(
    page.getByText('you’re offline. uploads will continue when you’re back.'),
  ).toBeVisible();
  releaseUpload();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect
    .poll(
      async () =>
        (await cachedMedia(page)).find((item) => item.name === 'offline.txt')
          ?.done,
      { timeout: 15000 },
    )
    .toBe(true);
});

test('unknown sessions have exact copy and warming studio deep links redirect', async ({
  page,
  request,
}) => {
  await page.goto('/studio/unknown');
  await expect(
    page.getByRole('heading', { name: 'this session doesn’t exist' }),
  ).toBeVisible();
  await expect(
    page.getByText('it may have expired. sessions are kept for 24 hours.'),
  ).toBeVisible();
  await shot(page, 'session-not-found');
  const created = await request.post('http://127.0.0.1:8787/v1/sessions', {
    data: { prompt: 'test', assetIds: [], aspect: 'auto' },
  });
  const session = (await created.json()) as { sessionId: string };
  await page.goto(`/studio/${session.sessionId}`);
  await expect(page).toHaveURL(`/warmup/${session.sessionId}`);
});

test('chip states and session error have accessible review captures', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dev/uploads');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await shot(page, 'chip-states');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'replay completion' }).click();
  await page.screenshot({
    path: 'docs/screens/phase-03-completion-tick-1440x900.png',
  });
  await page.getByRole('button', { name: 'review session error' }).click();
  await expect(
    page.getByRole('heading', { name: 'kimo couldn’t start this edit' }),
  ).toBeVisible();
  await shot(page, 'session-error');
});

test('cancel on warmup removes the attachment from the saved and server session', async ({
  page,
  request,
}) => {
  await page.route('**/mock-r2/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.continue().catch(() => undefined);
  });
  await ready(page);
  await page
    .getByRole('textbox', { name: 'describe your video' })
    .fill('keep the prompt');
  await page.locator('input[type=file]').setInputFiles({
    name: 'cancel.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('test'),
  });
  await page.getByRole('button', { name: 'start editing' }).click();
  await expect(page).toHaveURL(/\/warmup\//);
  const id = page.url().split('/').at(-1);
  const assetId = await page.evaluate(
    () =>
      Object.values(
        (
          JSON.parse(sessionStorage.getItem('kimo.session.v1') ?? '{}') as {
            assetLocalMap: Record<string, string>;
          }
        ).assetLocalMap,
      )[0],
  );
  await page.getByRole('button', { name: 'remove cancel.txt' }).focus();
  await page.getByRole('button', { name: 'remove cancel.txt' }).press('Enter');
  await expect(page.getByText('cancel.txt', { exact: true })).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (
          (await (
            await request.get(`http://127.0.0.1:8787/v1/sessions/${id}`)
          ).json()) as { assets: { id: string }[] }
        ).assets.filter((asset) => asset.id === assetId).length,
    )
    .toBe(0);
  expect(
    await page.evaluate(() =>
      Object.keys(
        (
          JSON.parse(sessionStorage.getItem('kimo.session.v1') ?? '{}') as {
            assetLocalMap: Record<string, string>;
          }
        ).assetLocalMap,
      ),
    ),
  ).toHaveLength(0);
});

test('studio deep links restore editing, rendering and delivered sessions', async ({
  request,
}) => {
  test.setTimeout(120000);
  const created = await request.post('http://127.0.0.1:8787/v1/sessions', {
    data: { prompt: 'test', assetIds: [], aspect: 'auto' },
  });
  const session = (await created.json()) as {
    sessionId: string;
    wsUrl: string;
  };
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(session.wsUrl);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Mock did not reach review'));
    }, 90000);
    ws.on('error', reject);
    ws.on('message', (bytes) => {
      const event = JSON.parse(bytes.toString()) as {
        t: string;
        kind?: string;
      };
      if (event.t === 'agent.message' && event.kind === 'ask_review') {
        clearTimeout(timeout);
        ws.close();
        resolve();
      }
    });
  });
  const editing = await request.get(`/studio/${session.sessionId}`);
  expect(editing.status()).toBe(200);
  const approved = await request.post(
    `http://127.0.0.1:8787/v1/sessions/${session.sessionId}/approve`,
    { data: {} },
  );
  const { renderId } = (await approved.json()) as { renderId: string };
  const rendering = await request.get(`/studio/${session.sessionId}`, {
    maxRedirects: 0,
  });
  expect(rendering.headers().location).toBe(`/render/${renderId}`);
  await expect
    .poll(
      async () =>
        (
          (await (
            await request.get(`http://127.0.0.1:8787/v1/renders/${renderId}`)
          ).json()) as { status: string }
        ).status,
      { timeout: 30000 },
    )
    .toBe('done');
  const snapshot = (await (
    await request.get(`http://127.0.0.1:8787/v1/sessions/${session.sessionId}`)
  ).json()) as { videoId: string };
  const done = await request.get(`/studio/${session.sessionId}`, {
    maxRedirects: 0,
  });
  expect(done.headers().location).toBe(`/v/${snapshot.videoId}`);
});
