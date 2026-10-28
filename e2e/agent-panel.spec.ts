import {
  test,
  expect,
  type WebSocketRoute,
  type Page,
  type APIRequestContext,
} from '@playwright/test';
import { WebSocket } from 'ws';
import type {
  SessionSnapshot,
  ServerEvent,
} from '../packages/kimo-client/src/schema';
import AxeBuilder from '@axe-core/playwright';
async function setup(
  page: Page,
  request: APIRequestContext,
  controlled = true,
) {
  const response = await request.post('http://127.0.0.1:8787/v1/sessions', {
    data: { prompt: 'agent panel test', assetIds: [], aspect: 'auto' },
  });
  const { sessionId, wsUrl } = (await response.json()) as {
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
        }, 100);
      }
    });
    ws.on('error', reject);
  });
  const initial = await request.get(
    `http://127.0.0.1:8787/v1/sessions/${sessionId}`,
  );
  const snapshot = (await initial.json()) as SessionSnapshot;
  const existing = snapshot.project.tracks.find(
    (track) => track.kind === 'video',
  );
  const video = existing ?? {
    id: 'video',
    kind: 'video',
    name: 'video',
    height: 88,
    hidden: false,
    muted: false,
    locked: false,
  };
  await request.post(`http://127.0.0.1:8787/v1/sessions/${sessionId}/ops`, {
    data: {
      baseVersion: snapshot.project.version,
      ops: [
        ...(existing ? [] : [{ op: 'track.add', track: video }]),
        {
          op: 'clip.add',
          clip: {
            id: 'beach',
            trackId: video.id,
            assetId: 'footage',
            kind: 'video',
            start: 0,
            duration: 8,
            in: 0,
            speed: 1,
            transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
            effects: [],
            keyframes: [],
          },
        },
      ],
    },
  });
  let socket: WebSocketRoute | undefined;
  const sent: { t: string; text?: string }[] = [];
  if (controlled)
    await page.routeWebSocket('**/v1/sessions/*/ws', (route) => {
      socket = route;
      route.onMessage((data) => {
        const message = JSON.parse(String(data)) as {
          t: string;
          text?: string;
        };
        sent.push(message);
        if (message.t === 'interrupt')
          route.send(
            JSON.stringify({
              t: 'agent.status',
              state: 'thinking',
              label: 'reading your note',
            }),
          );
      });
    });
  await page.goto(`/studio/${sessionId}`);
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  if (controlled) await expect.poll(() => Boolean(socket)).toBe(true);
  const emit = (event: ServerEvent) => {
    if (!socket) throw new Error('No socket');
    socket.send(JSON.stringify(event));
  };
  return { sessionId, emit, sent };
}

test('nine message types, one running target, actions, mentions and scroll behavior', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const { emit, sent } = await setup(page, request);
  emit({
    t: 'asset.added',
    asset: {
      id: 'footage',
      name: 'beach_02.mp4',
      kind: 'video',
      source: 'user',
      url: 'http://localhost:8787/fixtures/study-1.mp4',
    },
  });
  emit({
    t: 'agent.message',
    id: 'say',
    role: 'agent',
    kind: 'say',
    text: '**a good start** with `clean cuts` and [source](https://example.com).',
    stream: true,
  });
  emit({ t: 'agent.status', state: 'thinking', label: 'continuing' });
  emit({ t: 'agent.status', state: 'acting', label: 'trimming beach_02' });
  emit({
    t: 'agent.action.start',
    id: 'trim',
    tool: 'trim_clip',
    title: 'cut the intro to the best 4 seconds',
    args: { in: 2, out: 6 },
    target: { clipId: 'beach', region: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } },
  });
  await expect(page.locator('.agent-panel')).toHaveAttribute(
    'data-running-action',
    'trim',
  );
  for (const selector of [
    '.studio-status-pill',
    '.studio-viewer',
    '.studio-timeline',
    '.studio-inspector',
  ])
    await expect(page.locator(selector)).toHaveAttribute(
      'data-active-target',
      'beach',
    );
  await expect(
    page.locator('.agent-panel .ui-avatar[data-acting="true"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-clip-id="beach"][data-ai="true"]'),
  ).toBeVisible();
  await expect(
    page.locator('.studio-inspector [data-ai="true"]').first(),
  ).toBeVisible();
  await expect(page.locator('.studio-ai-region')).toBeVisible();
  await expect(page.locator('[data-agent-announcement]')).toContainText(
    'kimo is trimming beach_02',
  );
  await page.screenshot({
    path: 'docs/screens/phase-08-running-1920x1080.png',
  });
  const composer = page.getByRole('textbox', {
    name: 'tell kimo what to change',
    exact: true,
  });
  await composer.fill('make it slower');
  await page.getByRole('button', { name: 'send note', exact: true }).click();
  await expect(page.locator('.agent-read')).toHaveText('read');
  await expect(page.locator('[data-interrupt-ack-ms]')).toHaveAttribute(
    'data-interrupt-ack-ms',
    /\d+/,
  );
  expect(
    Number(
      await page
        .locator('[data-interrupt-ack-ms]')
        .getAttribute('data-interrupt-ack-ms'),
    ),
  ).toBeLessThanOrEqual(400);
  await expect(
    page.getByText('stopped here, adjusting', { exact: true }),
  ).toBeVisible();
  emit({ t: 'agent.action.end', id: 'trim', ok: true, durationMs: 300 });
  emit({
    t: 'agent.action.start',
    id: 'mask',
    tool: 'sam_segment',
    title: 'finding the person',
    args: { label: 'person' },
    target: { clipId: 'beach' },
  });
  emit({
    t: 'agent.action.end',
    id: 'mask',
    ok: false,
    durationMs: 140,
    error: 'could not find a clear edge',
  });
  emit({
    t: 'asset.added',
    actionId: 'search',
    asset: {
      id: 'web',
      name: 'closing still',
      kind: 'image',
      source: 'web',
      url: 'http://localhost:8787/fixtures/still.png',
      attribution: {
        site: 'fixture library',
        pageUrl: 'https://example.com/source',
        license: 'CC0-1.0',
      },
    },
  });
  emit({
    t: 'asset.added',
    asset: {
      id: 'maskasset',
      name: 'mask.png',
      kind: 'image',
      source: 'user',
      url: 'http://localhost:8787/fixtures/mask.png',
    },
  });
  emit({
    t: 'sam.mask',
    clipId: 'beach',
    maskAssetId: 'maskasset',
    previewPolygon: [
      [0.2, 0.2],
      [0.8, 0.2],
      [0.5, 0.8],
    ],
  });
  await expect(
    page.getByText('could not find a clear edge', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'retry step', exact: true }).click();
  expect(sent.some((message) => message.t === 'retry')).toBe(true);
  await expect(
    page.getByRole('button', { name: 'view mask', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'inspect closing still', exact: true })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'image closing still', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('dialog', { name: 'image closing still', exact: true }),
  ).toHaveCSS('opacity', '1');
  await page.screenshot({
    path: 'docs/screens/phase-08-results-1920x1080.png',
  });
  await page.keyboard.press('Escape');
  emit({
    t: 'agent.message',
    id: 'choice',
    role: 'agent',
    kind: 'ask_choice',
    text: 'which opening works?',
    choices: ['quiet', 'energetic'],
  });
  await expect(
    page.getByRole('button', { name: 'quiet', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'quiet', exact: true }).click();
  emit({ t: 'agent.status', state: 'idle', label: 'ready' });
  emit({
    t: 'agent.message',
    id: 'review',
    role: 'agent',
    kind: 'ask_review',
    text: 'first cut’s ready, 42 seconds. play it through and tell me what to change.',
  });
  await expect(
    page
      .getByRole('button', { name: 'looks good, render it', exact: true })
      .first(),
  ).toBeVisible();
  await page.screenshot({ path: 'docs/screens/phase-08-chat-1920x1080.png' });
  await composer.fill('@beach');
  await page
    .getByRole('group', { name: 'mention clips' })
    .getByRole('button', { name: 'beach_02.mp4', exact: true })
    .click();
  await expect(page.locator('.agent-mention')).toHaveText('@beach_02.mp4');
  await composer.press('Escape');
  await expect(
    page.getByRole('slider', { name: 'seek timeline', exact: true }),
  ).toBeFocused();
  await composer.fill('/pause');
  await composer.press('Enter');
  expect(sent.some((message) => message.t === 'pause')).toBe(true);
  await page.getByRole('tab', { name: 'actions', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'search actions', exact: true })
    .fill('sam');
  await expect(page.locator('.agent-audit-row')).toHaveCount(1);
  await page.locator('.agent-audit-row').click();
  await expect(page.locator('.agent-audit-detail pre')).toContainText('person');
  await page.screenshot({
    path: 'docs/screens/phase-08-actions-1920x1080.png',
  });
  await page.getByRole('tab', { name: 'chat', exact: true }).click();
  for (let i = 0; i < 18; i++)
    emit({
      t: 'agent.message',
      id: `message-${i}`,
      role: 'agent',
      kind: 'say',
      text: `the current edit has a clear opening and a careful ending ${i}`,
    });
  const stream = page.locator('.agent-stream');
  await stream.evaluate((node) => {
    node.scrollTop = 0;
    node.dispatchEvent(new Event('scroll'));
  });
  emit({
    t: 'agent.message',
    id: 'last',
    role: 'agent',
    kind: 'say',
    text: 'one more note',
  });
  await expect(
    page.getByRole('button', { name: 'new activity ↓', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'new activity ↓', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'new activity ↓', exact: true }),
  ).toBeHidden();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('real mock acknowledgement, hard stop and attachments', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const { sessionId } = await setup(page, request, false);
  const composer = page.getByRole('textbox', {
    name: 'tell kimo what to change',
    exact: true,
  });
  await composer.fill('make it slower');
  await page
    .getByRole('button', { name: 'let kimo continue', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'stop now', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'send note', exact: true }).click();
  await expect(page.locator('.agent-user')).toContainText('make it slower');
  await expect(page.locator('.agent-read').first()).toHaveText('read');
  expect(
    Number(
      await page
        .locator('[data-interrupt-ack-ms]')
        .getAttribute('data-interrupt-ack-ms'),
    ),
  ).toBeLessThanOrEqual(400);
  await expect(page.locator('.agent-action-group')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'stop now', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'stop now', exact: true }).click();
  await expect(
    page.getByText('you stopped kimo', { exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const response = await request.get(
        `http://127.0.0.1:8787/v1/sessions/${sessionId}`,
      );
      return ((await response.json()) as SessionSnapshot).paused;
    })
    .toBe(true);
  await expect(composer).toHaveAttribute(
    'data-placeholder',
    'tell kimo what to do next…',
  );
  await page
    .getByLabel('attach chat files', { exact: true })
    .setInputFiles('apps/web/public/dev/still.png');
  await expect(page.locator('.agent-attachment-row')).toContainText(
    'still.png',
  );
  await composer.fill('use this for the closing shot');
  await page.getByRole('button', { name: 'send note', exact: true }).click();
  await expect(page.locator('.agent-user').last()).toContainText('still.png');
  await page.screenshot({
    path: 'docs/screens/phase-08-interrupt-1440x900.png',
  });
});

test('revert restores agent changes and hidden requests notify only after permission', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    const state = {
      hidden: false,
      requested: 0,
      notifications: [] as string[],
    };
    Object.defineProperty(window, 'agentTest', { value: state });
    Object.defineProperty(document, 'hidden', { get: () => state.hidden });
    Object.defineProperty(window, 'Notification', {
      value: class {
        static permission = 'default';
        static async requestPermission() {
          state.requested++;
          this.permission = 'granted';
          return 'granted';
        }
        constructor(readonly title: string) {
          state.notifications.push(title);
        }
      },
    });
  });
  const { sessionId, emit } = await setup(page, request);
  const originalTitle = await page.title();
  await expect(
    page.getByText('want a ping when kimo needs you?', { exact: true }),
  ).toBeHidden();
  const read = async () =>
    (await (
      await request.get(`http://127.0.0.1:8787/v1/sessions/${sessionId}`)
    ).json()) as SessionSnapshot;
  const before = await read();
  const ops = [
    { op: 'clip.update' as const, id: 'beach', patch: { duration: 4 } },
  ];
  emit({
    t: 'agent.action.start',
    id: 'reversible',
    tool: 'trim_clip',
    title: 'tighten the opening',
    args: { duration: 4 },
    target: { clipId: 'beach' },
  });
  const changed = await request.post(
    `http://127.0.0.1:8787/v1/sessions/${sessionId}/ops`,
    { data: { baseVersion: before.project.version, ops } },
  );
  expect(changed.ok()).toBe(true);
  const after = await read();
  emit({
    t: 'project.ops',
    version: after.project.version,
    ops,
    actionId: 'reversible',
  });
  emit({ t: 'agent.action.end', id: 'reversible', ok: true, durationMs: 200 });
  emit({ t: 'agent.status', state: 'idle', label: 'ready' });
  await page
    .getByRole('button', { name: 'revert this step', exact: true })
    .click();
  await expect
    .poll(async () => (await read()).project.clips.beach?.duration)
    .toBe(8);
  await expect(
    page.getByText('you reverted a step', { exact: true }),
  ).toBeVisible();
  const composer = page.getByRole('textbox', {
    name: 'tell kimo what to change',
    exact: true,
  });
  await composer.fill('keep the longer opening');
  await composer.press('Enter');
  await expect(
    page.getByText('want a ping when kimo needs you?', { exact: true }),
  ).toBeVisible();
  const permissionCount = () =>
    page.evaluate(
      () =>
        (window as unknown as { agentTest: { requested: number } }).agentTest
          .requested,
    );
  expect(await permissionCount()).toBe(0);
  await page.getByRole('button', { name: 'yes', exact: true }).click();
  expect(await permissionCount()).toBe(1);
  await page.screenshot({ path: 'docs/screens/phase-08-revert-1440x900.png' });
  await page
    .getByRole('button', { name: 'collapse agent panel', exact: true })
    .click();
  await page.evaluate(() => {
    (window as unknown as { agentTest: { hidden: boolean } }).agentTest.hidden =
      true;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  emit({
    t: 'agent.message',
    id: 'hidden-review',
    role: 'agent',
    kind: 'ask_review',
    text: 'your first cut is ready',
  });
  await expect(page).toHaveTitle('(1) kimo needs you');
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { agentTest: { notifications: string[] } })
          .agentTest.notifications,
    ),
  ).toEqual(['kimo · your first cut is ready']);
  emit({
    t: 'agent.message',
    id: 'hidden-choice',
    role: 'agent',
    kind: 'ask_choice',
    text: 'which ending?',
    choices: ['quiet', 'quick'],
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { agentTest: { notifications: string[] } })
            .agentTest.notifications.length,
      ),
    )
    .toBe(2);
  await expect(page).toHaveTitle('(1) kimo needs you');
  await page.evaluate(() => {
    (window as unknown as { agentTest: { hidden: boolean } }).agentTest.hidden =
      false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page).toHaveTitle(originalTitle);
  expect(await permissionCount()).toBe(1);
});

test('mobile chat, reduced motion and throttled action announcements', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { emit } = await setup(page, request);
  await page.keyboard.press('Control+k');
  await expect(
    page.getByRole('textbox', {
      name: 'tell kimo what to change',
      exact: true,
    }),
  ).toBeFocused();
  emit({
    t: 'agent.message',
    id: 'mobile-say',
    role: 'agent',
    kind: 'say',
    text: 'the opening is ready for your review',
    stream: true,
  });
  await expect(page.locator('.agent-message-text')).toHaveText(
    'the opening is ready for your review',
  );
  emit({
    t: 'agent.action.start',
    id: 'mobile-first',
    tool: 'trim_clip',
    title: 'tightening the opening',
    args: {},
    target: { clipId: 'beach' },
  });
  await expect(page.locator('[data-agent-announcement]')).toHaveText(
    'kimo is trimming beach',
  );
  emit({
    t: 'agent.action.start',
    id: 'mobile-second',
    tool: 'color_grade',
    title: 'grading the opening',
    args: {},
    target: { clipId: 'beach' },
  });
  await expect(page.locator('[data-agent-announcement]')).toHaveText(
    'kimo is trimming beach',
  );
  await expect(page.locator('[data-agent-announcement]')).toHaveText(
    'kimo is grading colour on beach',
    { timeout: 4500 },
  );
  expect(
    await page
      .locator('.agent-spinner')
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe('none');
  await page.screenshot({
    path: 'docs/screens/phase-08-mobile-reduced-390x844.png',
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
