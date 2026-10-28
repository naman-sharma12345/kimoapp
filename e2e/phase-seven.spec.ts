import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test.use({
  trace: 'off',
  launchOptions: {
    args:
      process.platform === 'win32' && !process.env.CI
        ? [
            '--use-angle=d3d11',
            '--enable-gpu',
            '--disable-software-rasterizer',
            '--force_high_performance_gpu',
          ]
        : [],
  },
});
import type {
  SessionSnapshot,
  Op,
  Clip,
} from '../packages/kimo-client/src/schema';
import path from 'node:path';
import { WebSocket } from 'ws';
import { writeFile, mkdir } from 'node:fs/promises';
test('captions, formatting, upload-more and fifty-clip scroll fixture', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  page.setDefaultTimeout(10000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const created = await request.post('http://127.0.0.1:8787/v1/sessions', {
    data: { prompt: 'caption fixture', assetIds: [], aspect: 'auto' },
  });
  const { sessionId, wsUrl } = (await created.json()) as {
    sessionId: string;
    wsUrl: string;
  };
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('Warmup timed out'));
    }, 20000);
    ws.on('message', (data) => {
      const event = JSON.parse(data.toString()) as { t: string; step?: string };
      if (event.t === 'warmup.step' && event.step === 'ready') {
        ws.send(JSON.stringify({ t: 'pause' }));
        clearTimeout(timer);
        setTimeout(() => {
          ws.close();
          resolve();
        }, 200);
      }
    });
    ws.on('error', reject);
  });
  const read = async () => {
    const response = await request.get(
      `http://127.0.0.1:8787/v1/sessions/${sessionId}`,
    );
    return (await response.json()) as SessionSnapshot;
  };
  const snapshot = await read();
  const clips: Clip[] = Array.from({ length: 50 }, (_, i) => ({
    id: `caption-${i}`,
    kind: 'text',
    trackId: 'captions',
    start: i * 2,
    duration: 2,
    in: 0,
    speed: 1,
    text: {
      content: `hello segment ${i}`,
      style: 'caption-clean',
      words: [
        { w: 'hello', t: 0, d: 0.6 },
        { w: 'segment', t: 0.6, d: 0.6 },
        { w: String(i), t: 1.2, d: 0.8 },
      ],
    },
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    effects: [],
    keyframes: [],
  }));
  const ops: Op[] = [
    {
      op: 'track.add',
      track: {
        id: 'captions',
        kind: 'text',
        name: 'captions',
        height: 48,
        hidden: false,
        muted: false,
        locked: false,
      },
    },
    ...clips.map((clip) => ({ op: 'clip.add' as const, clip })),
  ];
  const seeded = await request.post(
    `http://127.0.0.1:8787/v1/sessions/${sessionId}/ops`,
    { data: { baseVersion: snapshot.project.version, ops } },
  );
  expect(seeded.ok()).toBe(true);
  await page.routeWebSocket('**/v1/sessions/*/ws', () => {});
  await page.goto(`/studio/${sessionId}`);
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await page
    .getByRole('button', { name: /hello segment 0, text, starts/ })
    .click();
  await page
    .getByRole('button', { name: 'find & replace', exact: true })
    .click();
  await page.getByRole('textbox', { name: 'find caption text' }).fill('hello');
  await page
    .getByRole('textbox', { name: 'replace caption text' })
    .fill('welcome');
  await page.getByRole('button', { name: 'replace all', exact: true }).click();
  await expect
    .poll(
      async () =>
        Object.values((await read()).project.clips).filter((clip) =>
          clip.text?.content.startsWith('welcome'),
        ).length,
    )
    .toBe(50);
  await page
    .getByRole('button', { name: 'keyframe position x', exact: true })
    .click();
  await expect
    .poll(
      async () => (await read()).project.clips['caption-0']?.keyframes.length,
    )
    .toBe(1);
  await page
    .getByLabel('caption position', { exact: true })
    .scrollIntoViewIfNeeded();
  await page
    .getByLabel('caption position', { exact: true })
    .selectOption('top');
  await expect
    .poll(async () => (await read()).project.clips['caption-0']?.text?.position)
    .toBe('top');
  await page.screenshot({
    path: 'docs/screens/phase-07-captions-1440x900.png',
  });
  await page
    .getByRole('button', { name: 'toggle assets', exact: true })
    .click();
  await page
    .getByLabel('upload more files', { exact: true })
    .setInputFiles(path.resolve('packages/mock-server/fixtures/still.png'));
  await expect
    .poll(
      async () =>
        (await read()).assets.some((asset) => asset.name === 'still.png'),
      { timeout: 30000 },
    )
    .toBe(true);
  await writeFile(
    'tmp/phase07-upload-ui.txt',
    await page.locator('.editor-assets').innerText(),
  );
  await expect(
    page
      .locator('.editor-assets-grid')
      .getByRole('button', { name: 'still.png', exact: true }),
  ).toBeVisible();
  await page
    .locator('.editor-assets-grid')
    .getByRole('button', { name: 'still.png', exact: true })
    .click();
  await expect
    .poll(async () =>
      Object.values((await read()).project.clips).some(
        (clip) => clip.kind === 'image',
      ),
    )
    .toBe(true);
  await page.screenshot({ path: 'docs/screens/phase-07-assets-1440x900.png' });
  await page.getByText('colour balance', { exact: true }).click();
  const exposure = page.getByRole('slider', {
    name: 'exposure slider',
    exact: true,
  });
  await exposure.scrollIntoViewIfNeeded();
  const frame = page.locator('.studio-preview-canvas');
  const beforeGrade = await frame.screenshot();
  await exposure.fill('0.8');
  await expect
    .poll(async () => (await frame.screenshot()).equals(beforeGrade))
    .toBe(false);
  await page
    .getByRole('checkbox', { name: 'before/after', exact: true })
    .check();
  await page.screenshot({
    path: 'docs/screens/phase-07-inspector-1440x900.png',
  });

  await page
    .getByRole('button', { name: 'toggle assets', exact: true })
    .click();
  await page
    .getByRole('slider', { name: 'timeline zoom', exact: true })
    .fill('80');
  const measurement = await page.evaluate(async () => {
    const element = document.querySelector<HTMLElement>(
      '.editor-timeline-scroll',
    );
    if (!element) throw new Error('Missing timeline');
    const intervals: number[] = [];
    let previous = performance.now();
    return new Promise<{ frames: number; fps: number; worstMs: number }>(
      (resolve) => {
        let frames = 0;
        const frame = (now: number) => {
          if (frames) intervals.push(now - previous);
          previous = now;
          element.scrollLeft =
            (Math.sin(frames / 25) + 1) *
            0.5 *
            (element.scrollWidth - element.clientWidth);
          frames++;
          if (frames < 180) requestAnimationFrame(frame);
          else
            resolve({
              frames: intervals.length,
              fps:
                1000 /
                (intervals.reduce((sum, n) => sum + n, 0) / intervals.length),
              worstMs: Math.max(...intervals),
            });
        };
        requestAnimationFrame(frame);
      },
    );
  });
  const zoomMeasurement = await page.evaluate(async () => {
    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="timeline zoom"]',
    );
    if (!input) throw new Error('Missing zoom');
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    if (!setter) throw new Error('Missing input setter');
    let previous = performance.now();
    const intervals: number[] = [];
    return new Promise<{ fps: number; worstMs: number }>((resolve) => {
      let index = 0;
      const frame = (now: number) => {
        if (index) intervals.push(now - previous);
        previous = now;
        setter.call(input, String(Math.round(70 + Math.sin(index / 20) * 10)));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        index++;
        if (index < 180) requestAnimationFrame(frame);
        else
          resolve({
            fps:
              1000 /
              (intervals.reduce((sum, value) => sum + value, 0) /
                intervals.length),
            worstMs: Math.max(...intervals),
          });
      };
      requestAnimationFrame(frame);
    });
  });
  await mkdir('tmp', { recursive: true });
  await writeFile(
    'tmp/phase-07-timeline-benchmark.json',
    JSON.stringify(
      {
        ...measurement,
        zoom: zoomMeasurement,
        renderer: await page.evaluate(() => {
          const gl = document.createElement('canvas').getContext('webgl2');
          const info = gl?.getExtension('WEBGL_debug_renderer_info');
          return info
            ? gl?.getParameter(info.UNMASKED_RENDERER_WEBGL)
            : 'unknown';
        }),
      },
      null,
      2,
    ),
  );
  expect(measurement.fps).toBeGreaterThan(0);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
