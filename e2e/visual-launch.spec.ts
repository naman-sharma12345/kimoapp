import { test, expect } from '@playwright/test';
import { seedSession } from './seed-session';
import type {
  RenderSnapshot,
  SessionSnapshot,
} from '../packages/kimo-client/src/schema';
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
test('controlled visual baselines across the product routes and new states', async ({
  page,
}) => {
  test.setTimeout(180000);
  const api = 'http://localhost:8787';
  const capture = async (name: string) => {
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`${name}.png`, {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.02,
      mask: [
        page.locator(
          'canvas, video, .studio-save, .studio-status-bar, .studio-session-time, .render-filmstrip',
        ),
      ],
    });
    await page.screenshot({
      path: `docs/screens/phase-10-${name}.png`,
      animations: 'disabled',
      fullPage: true,
    });
  };
  await page.goto('/');
  await capture('landing');
  await page.getByRole('button', { name: 'sign in', exact: true }).click();
  await expect(
    page.getByText('demo sign-in · the mock does not connect to google.'),
  ).toBeVisible();
  await capture('sign-in');
  await page.keyboard.press('Escape');
  await page.goto('/privacy');
  await capture('privacy');
  const id = await seedSession(page);
  const initial = (await (
    await page.request.get(`${api}/v1/sessions/${id}`)
  ).json()) as SessionSnapshot;
  await page.request.post(`${api}/v1/sessions/${id}/ops`, {
    data: {
      baseVersion: initial.project.version,
      ops: [
        ...Object.keys(initial.project.clips).map((id) => ({
          op: 'clip.remove',
          id,
        })),
        ...initial.project.tracks.map((t) => ({
          op: 'track.remove',
          id: t.id,
        })),
        ...initial.project.markers.map((m) => ({
          op: 'marker.remove',
          id: m.id,
        })),
        {
          op: 'track.add',
          track: {
            id: 'captions',
            name: 'captions',
            kind: 'text',
            height: 48,
            muted: false,
            hidden: false,
            locked: false,
          },
        },
        {
          op: 'clip.add',
          clip: {
            id: 'caption',
            trackId: 'captions',
            kind: 'text',
            start: 0,
            duration: 4,
            in: 0,
            speed: 1,
            transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
            text: { content: 'a quiet moment', style: 'caption-clean' },
            effects: [],
            keyframes: [],
          },
        },
      ],
    },
  });
  await page.evaluate(
    (sessionId) => localStorage.removeItem(`kimo.cuts.${sessionId}`),
    id,
  );
  await page.reload();
  await expect(page.getByLabel('versions')).toContainText('cut 1');
  await capture('studio');
  await page.getByLabel('versions').selectOption('cut 1');
  await capture('version');
  await page.getByRole('button', { name: 'back to current cut' }).click();
  await page.getByLabel('compare cuts').selectOption('cut 1');
  await capture('comparison');
  await page.getByRole('button', { name: 'close comparison' }).click();
  await page.keyboard.press('Control+p');
  await capture('palette');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'finish', exact: true }).click();
  await page.getByText('more options', { exact: true }).click();
  await capture('review');
  await page.keyboard.press('Escape');
  const result = await page.request.post(`${api}/v1/sessions/${id}/approve`, {
    data: { title: 'a quiet moment' },
  });
  const { renderId } = (await result.json()) as { renderId: string };
  await page.route(`**/v1/renders/${renderId}`, (route) =>
    route.fulfill({
      json: {
        status: 'rendering',
        progress: 0.5,
        frame: 60,
        totalFrames: 120,
        etaSec: 2,
        width: 1920,
        height: 1080,
        title: 'a quiet moment',
        sessionId: id,
        burnInCaptions: true,
      },
    }),
  );
  await page.goto(`/render/${id}`);
  await expect(
    page.getByRole('heading', { name: 'composing frames' }),
  ).toBeVisible();
  await page.waitForTimeout(1000);
  await capture('render');
  await page.unroute(`**/v1/renders/${renderId}`);
  let rendered: RenderSnapshot | undefined;
  await expect
    .poll(
      async () => {
        rendered = (await (
          await page.request.get(`${api}/v1/renders/${renderId}`)
        ).json()) as RenderSnapshot;
        return rendered.status;
      },
      { timeout: 40000 },
    )
    .toBe('done');
  if (!rendered?.videoId) throw new Error('Missing video');
  await page.goto(`/v/${rendered.videoId}`);
  await capture('delivery');
  await page.goto('/studio/missing-session');
  await capture('expired');
});
