import { describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { spentUsd } from './ai-budget.ts';
import { createTestDb } from './d1-fake.ts';
import type { Env } from './env.ts';

const API = 'https://api.getkimo.tech';
const SSE = [
  'event: response.output_text.delta',
  'data: {"type":"response.output_text.delta","delta":"<0f>0<|box;x1=1;y1=2;x2=3;y2=4;w=8;h=8|><|mask;x=0;y=0;data=3,3,!abc|>\\n"}',
  '',
  'event: response.completed',
  'data: {"type":"response.completed","response":{"usage":{"video_frames_processed":120}}}',
  '',
  '',
].join('\n');

function setup(extra: Partial<Env> = {}) {
  const env = {
    DB: createTestDb(),
    APP_ORIGIN: 'https://app.getkimo.tech',
    API_ORIGIN: API,
    COOKIE_DOMAIN: '.getkimo.tech',
    META_API_KEY: 'meta-key',
    ...extra,
  } as Env;
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith('/files')) return Response.json({ id: 'file-123' });
    if (url.endsWith('/files/file-123'))
      return Response.json({ deleted: true });
    if (url.endsWith('/responses'))
      return new Response(SSE, {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    return new Response('nope', { status: 404 });
  };
  const app = createApp({ fetcher });
  const call = (path: string, init: RequestInit = {}) =>
    app.fetch(new Request(`${API}${path}`, init), env);
  return { env, call, calls };
}
const desktop = { 'X-Kimo-Desktop': '1' };

describe('desktop SAM proxy', () => {
  it('refuses calls that are not from the desktop app', async () => {
    const { call } = setup();
    const r = await call('/v1/desktop/sam', { method: 'POST', body: '{}' });
    expect(r.status).toBe(403);
  });

  it('uploads a proxy clip with the server key and purpose user_data', async () => {
    const { call, calls } = setup();
    const r = await call('/v1/desktop/sam/file', {
      method: 'POST',
      headers: { ...desktop, 'Content-Type': 'video/mp4' },
      body: new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]),
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ file_id: 'file-123', bytes: 8 });
    const sent = calls[0] ?? { url: '' };
    expect(sent.url).toBe('https://api.meta.ai/v1/files');
    expect(new Headers(sent.init?.headers).get('Authorization')).toBe(
      'Bearer meta-key',
    );
    expect((sent.init?.body as FormData).get('purpose')).toBe('user_data');
  });

  it('refuses a non-MP4 upload', async () => {
    const { call } = setup();
    const r = await call('/v1/desktop/sam/file', {
      method: 'POST',
      headers: { ...desktop, 'Content-Type': 'image/png' },
      body: new Uint8Array([1]),
    });
    expect(r.status).toBe(415);
  });

  it('streams segmentation through and meters frames into the budget', async () => {
    const { call, calls, env } = setup();
    const r = await call('/v1/desktop/sam', {
      method: 'POST',
      headers: { ...desktop, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'person',
        file_id: 'file-123',
        frames: 100,
      }),
    });
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toBe('text/event-stream');
    expect(await r.text()).toContain('<0f>0<|box');
    const sent = JSON.parse(String(calls[0]?.init?.body));
    expect(sent).toMatchObject({
      model: 'sam-3.1',
      stream: true,
      metadata: { mask_encoding: 'one_bit' },
    });
    expect(sent.input[0].content[1]).toEqual({
      type: 'input_video',
      file_id: 'file-123',
    });
    // 100 charged up front + 20 more once the stream reports 120 billed
    expect((await spentUsd(env)).usd).toBeCloseTo(0.024);
  });

  it('charges at least 50 frames and refuses once the budget is gone', async () => {
    const { call, env } = setup({ AI_BUDGET_USD: '0.01' });
    const body = JSON.stringify({
      prompt: 'dog',
      file_id: 'file-123',
      frames: 5,
    });
    const init = {
      method: 'POST',
      headers: { ...desktop, 'Content-Type': 'application/json' },
      body,
    };
    expect((await call('/v1/desktop/sam', init)).status).toBe(200);
    expect((await spentUsd(env)).usd).toBeGreaterThanOrEqual(0.01);
    const again = await call('/v1/desktop/sam', init);
    expect(again.status).toBe(429);
  });

  it('takes an image as a data URL and rejects two media parts', async () => {
    const { call } = setup();
    const ok = await call('/v1/desktop/sam', {
      method: 'POST',
      headers: { ...desktop, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'person',
        image: 'data:image/jpeg;base64,AAAA',
      }),
    });
    expect(ok.status).toBe(200);
    await ok.text();
    const both = await call('/v1/desktop/sam', {
      method: 'POST',
      headers: { ...desktop, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'person',
        image: 'data:image/jpeg;base64,AAAA',
        file_id: 'file-123',
      }),
    });
    expect(both.status).toBe(400);
  });

  it('deletes an upload', async () => {
    const { call } = setup();
    const r = await call('/v1/desktop/sam/file/delete', {
      method: 'POST',
      headers: { ...desktop, 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: 'file-123' }),
    });
    expect(await r.json()).toEqual({ deleted: true });
  });
});
