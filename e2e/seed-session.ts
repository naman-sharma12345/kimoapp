import { expect, type Page } from '@playwright/test';
import { WebSocket } from 'ws';
import type { SessionSnapshot } from '../packages/kimo-client/src/schema';
const api = 'http://localhost:8787';
export async function seedSession(page: Page) {
  await page.request.get(
    `${api}/v1/auth/google?returnTo=http://localhost:3000/`,
    { maxRedirects: 0 },
  );
  const response = await page.request.post(`${api}/v1/sessions`, {
    data: { prompt: 'a calm travel reel', aspect: '16:9', assetIds: [] },
  });
  const { sessionId, wsUrl } = (await response.json()) as {
    sessionId: string;
    wsUrl: string;
  };
  const ws = new WebSocket(wsUrl);
  await expect
    .poll(
      async () => {
        const result = await page.request.get(
          `${api}/v1/sessions/${sessionId}`,
        );
        const snapshot = (await result.json()) as SessionSnapshot;
        return (
          snapshot.status === 'editing' &&
          Object.keys(snapshot.project.clips).length > 0
        );
      },
      { timeout: 30000 },
    )
    .toBe(true);
  await page.request.post(`${api}/v1/sessions/${sessionId}/reopen`, {
    data: {},
  });
  ws.close();
  const snapshot = (await (
    await page.request.get(`${api}/v1/sessions/${sessionId}`)
  ).json()) as SessionSnapshot;
  await page.request.post(`${api}/v1/sessions/${sessionId}/ops`, {
    data: {
      baseVersion: snapshot.project.version,
      ops: [
        {
          op: 'track.add',
          track: {
            id: 'launch-captions',
            kind: 'text',
            name: 'captions',
            height: 48,
            muted: false,
            hidden: false,
            locked: false,
          },
        },
        {
          op: 'clip.add',
          clip: {
            id: 'launch-caption',
            trackId: 'launch-captions',
            kind: 'text',
            start: 0,
            duration: 3,
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
  await page.addInitScript(() => localStorage.setItem('kimo.coached', '1'));
  await page.goto(`/studio/${sessionId}`);
  await expect(
    page.getByRole('button', { name: 'finish', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('versions')).toContainText('cut 1');
  return sessionId;
}
