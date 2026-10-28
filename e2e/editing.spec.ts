import { test, expect } from '@playwright/test';
import { WebSocket } from 'ws';

test('edits text, trims and locks a clip, then undoes only the user edit', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const created = await request.post('http://127.0.0.1:8787/v1/sessions', {
    data: { prompt: 'a small film', assetIds: [], aspect: 'auto' },
  });
  const { sessionId, wsUrl } = (await created.json()) as {
    sessionId: string;
    wsUrl: string;
  };
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(
      () => reject(new Error('warmup timed out')),
      25000,
    );
    ws.on('message', (bytes) => {
      const event = JSON.parse(bytes.toString()) as {
        t: string;
        step?: string;
      };
      if (event.t === 'warmup.step' && event.step === 'ready') {
        ws.send(JSON.stringify({ t: 'pause' }));
        clearTimeout(timer);
        setTimeout(() => {
          ws.close();
          resolve();
        }, 300);
      }
    });
    ws.on('error', reject);
  });
  let response = await request.get(
    `http://127.0.0.1:8787/v1/sessions/${sessionId}`,
  );
  let snapshot = (await response.json()) as {
    project: {
      version: number;
      tracks: { id: string }[];
      clips: Record<
        string,
        { duration: number; locked?: boolean; text?: { content: string } }
      >;
    };
  };
  const id = 'phase-seven-test-title';
  const track = {
    id: 'phase-seven-text',
    kind: 'text',
    name: 'titles',
    muted: false,
    hidden: false,
    locked: false,
    height: 48,
  };
  const clip = {
    id,
    trackId: track.id,
    kind: 'text',
    start: 0,
    duration: 4,
    in: 0,
    text: { content: 'original title', style: 'title-bold' },
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    effects: [],
    keyframes: [],
    speed: 1,
  };
  const result = await request.post(
    `http://127.0.0.1:8787/v1/sessions/${sessionId}/ops`,
    {
      data: {
        baseVersion: snapshot.project.version,
        ops: [
          { op: 'track.add', track },
          { op: 'clip.add', clip },
        ],
      },
    },
  );
  expect(result.ok()).toBe(true);
  await page.goto(`/studio/${sessionId}`);
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await page.getByRole('switch', { name: 'follow kimo', exact: true }).click();
  await page
    .getByRole('button', { name: 'let kimo continue', exact: true })
    .click();

  const title = page.getByRole('button', {
    name: /original title, text, starts/,
  });
  await title.click();
  await page
    .getByRole('button', { name: 'edit selected text in viewer' })
    .dblclick();
  await page
    .getByRole('textbox', { name: 'edit viewer text' })
    .fill('viewer title');
  await page.getByRole('textbox', { name: 'edit viewer text' }).blur();
  await expect(page.getByRole('textbox', { name: 'text content' })).toHaveValue(
    'viewer title',
  );
  const field = page.getByRole('textbox', { name: 'text content' });
  await field.fill('my new title');
  await field.blur();
  await expect
    .poll(async () => {
      const r = await request.get(
        `http://127.0.0.1:8787/v1/sessions/${sessionId}`,
      );
      return ((await r.json()) as typeof snapshot).project.clips[id]?.text
        ?.content;
    })
    .toBe('my new title');
  await page.screenshot({ path: 'docs/screens/phase-07-editor-1440x900.png' });
  const trim = page.getByRole('button', { name: 'trim end', exact: true });
  await trim.scrollIntoViewIfNeeded();
  const box = await trim.boundingBox();
  if (!box) throw new Error('Missing trim handle');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 70, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const r = await request.get(
        `http://127.0.0.1:8787/v1/sessions/${sessionId}`,
      );
      return (
        ((await r.json()) as typeof snapshot).project.clips[id]?.duration ?? 4
      );
    })
    .toBeLessThan(4);

  await page
    .getByRole('button', { name: /my new title, text, starts/ })
    .focus();
  await page.keyboard.press('l');
  await expect
    .poll(async () => {
      const r = await request.get(
        `http://127.0.0.1:8787/v1/sessions/${sessionId}`,
      );
      return ((await r.json()) as typeof snapshot).project.clips[id]?.locked;
    })
    .toBe(true);
  await page.getByRole('button', { name: 'undo', exact: true }).click();
  await expect
    .poll(async () => {
      const r = await request.get(
        `http://127.0.0.1:8787/v1/sessions/${sessionId}`,
      );
      return ((await r.json()) as typeof snapshot).project.clips[id]?.locked;
    })
    .toBe(false);
  response = await request.get(
    `http://127.0.0.1:8787/v1/sessions/${sessionId}`,
  );
  snapshot = (await response.json()) as typeof snapshot;
  expect(snapshot.project.clips[id]?.text?.content).toBe('my new title');
  const footage = page.getByRole('button', {
    name: /study-1.mp4, video, starts/,
  });
  await expect(footage).toBeVisible({ timeout: 30000 });
  await footage.click();
  await footage.focus();
  await page.keyboard.press('l');
  await expect
    .poll(async () => {
      const r = await request.get(
        `http://127.0.0.1:8787/v1/sessions/${sessionId}`,
      );
      return ((await r.json()) as typeof snapshot).project.clips['clip-1']
        ?.locked;
    })
    .toBe(true);
  await expect
    .poll(
      async () => {
        const r = await request.get(
          `http://127.0.0.1:8787/v1/sessions/${sessionId}`,
        );
        return ((await r.json()) as typeof snapshot).project.clips['clip-2']
          ?.duration;
      },
      { timeout: 45000 },
    )
    .toBe(7);
  let live = await request.get(
    `http://127.0.0.1:8787/v1/sessions/${sessionId}`,
  );
  let liveProject = (await live.json()) as typeof snapshot;
  expect(liveProject.project.clips['clip-1']?.duration).toBe(8);
  expect(liveProject.project.clips[id]?.text?.content).toBe('my new title');
  await page.getByRole('button', { name: 'undo', exact: true }).click();
  await expect
    .poll(async () => {
      const r = await request.get(
        `http://127.0.0.1:8787/v1/sessions/${sessionId}`,
      );
      return ((await r.json()) as typeof snapshot).project.clips['clip-1']
        ?.locked;
    })
    .toBe(false);
  live = await request.get(`http://127.0.0.1:8787/v1/sessions/${sessionId}`);
  liveProject = (await live.json()) as typeof snapshot;
  expect(liveProject.project.clips['clip-2']?.duration).toBe(7);
  await page.screenshot({
    path: 'docs/screens/phase-07-live-agent-1440x900.png',
  });
});
