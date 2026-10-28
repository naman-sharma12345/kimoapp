import { afterEach, describe, expect, it, vi } from 'vitest';
import { sessionSnapshotSchema, uploadResponseSchema } from '@kimo/client';
import { createApp } from './app.ts';
import { createTestDb } from './d1-fake.ts';
import type { Env } from './env.ts';
import { isBlockedHost, safeBaseUrl, userAiConfig } from './ai-providers.ts';
import { HttpError } from './http.ts';

const APP = 'https://app.getkimo.tech';
const API = 'https://api.getkimo.tech';
const KEY = 'sk-user-FAKE-0123456789abcdef';

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

interface Call {
  url: string;
  headers: Headers;
  body: string;
}
type Handler = (call: Call) => Response | Promise<Response>;

function setup(options: { kimoKey?: string; handler?: Handler } = {}) {
  const db = createTestDb();
  const env: Env = {
    DB: db,
    APP_ORIGIN: APP,
    API_ORIGIN: API,
    COOKIE_DOMAIN: '.getkimo.tech',
    META_API_KEY: options.kimoKey,
  };
  const calls: Call[] = [];
  let handler: Handler =
    options.handler ??
    (() =>
      Response.json({
        choices: [{ message: { content: '{"message":"ok","ops":[]}' } }],
      }));
  const fetcher: typeof fetch = async (input, init) => {
    const call = {
      url: String(input),
      headers: new Headers(init?.headers),
      body: String(init?.body ?? ''),
    };
    calls.push(call);
    return handler(call);
  };
  const app = createApp({ fetcher, broadcast: async () => {} });
  const call = (path: string, init: RequestInit = {}) =>
    app.fetch(new Request(`${API}${path}`, init), env);
  async function user() {
    const id = crypto.randomUUID();
    const token = `token-${crypto.randomUUID()}`;
    const stamp = new Date().toISOString();
    db.sqlite
      .prepare(
        `INSERT INTO users (id, provider, provider_id, email, name, created_at, updated_at)
         VALUES (?, 'github', ?, ?, ?, ?, ?)`,
      )
      .run(id, id, `${id}@example.com`, 'naman', stamp, stamp);
    db.sqlite
      .prepare(
        'INSERT INTO auth_sessions (id, user_id, created_at, expires_at, provider) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        await sha256(token),
        id,
        stamp,
        new Date(Date.now() + 86400000).toISOString(),
        'github',
      );
    const cookie = `kimo_session=${token}`;
    const post = (path: string, body: unknown, extra: HeadersInit = {}) =>
      call(path, {
        method: 'POST',
        headers: {
          Cookie: cookie,
          Origin: APP,
          'Content-Type': 'application/json',
          ...extra,
        },
        body: JSON.stringify(body),
      });
    const get = (path: string, extra: HeadersInit = {}) =>
      call(path, { headers: { Cookie: cookie, Origin: APP, ...extra } });
    return { id, post, get };
  }
  /** Every text value in every D1 table, to prove the key is not there. */
  function dbText() {
    const tables = db.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[];
    return tables
      .map(({ name }) =>
        JSON.stringify(db.sqlite.prepare(`SELECT * FROM "${name}"`).all()),
      )
      .join('\n');
  }
  return {
    env,
    calls,
    call,
    user,
    dbText,
    setHandler: (next: Handler) => {
      handler = next;
    },
  };
}

async function startSession(
  me: Awaited<ReturnType<ReturnType<typeof setup>['user']>>,
) {
  const registered = uploadResponseSchema.parse(
    await (
      await me.post('/v1/uploads', {
        files: [
          {
            name: 'beach.mp4',
            size: 1000,
            mime: 'video/mp4',
            durationSec: 12,
            width: 1920,
            height: 1080,
          },
        ],
      })
    ).json(),
  );
  const created = await me.post('/v1/sessions', {
    prompt: 'x',
    assetIds: registered.uploads.map((upload) => upload.assetId),
    aspect: '16:9',
  });
  return ((await created.json()) as { sessionId: string }).sessionId;
}

const byok = (
  provider: string,
  model = 'gpt-test',
  extra: Record<string, string> = {},
) => ({
  'X-AI-Key': KEY,
  'X-AI-Provider': provider,
  'X-AI-Model': model,
  ...extra,
});

afterEach(() => vi.restoreAllMocks());

describe('bring your own AI key', () => {
  it('lists real models through the provider with the user key, and never echoes it', async () => {
    const ctx = setup({
      handler: () =>
        Response.json({
          data: [
            { id: 'gpt-b' },
            { id: 'gpt-a' },
            { id: 'bad id with spaces' },
            { id: KEY },
          ],
        }),
    });
    const me = await ctx.user();
    const response = await me.get('/v1/ai/models', byok('openai', ''));
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({
      models: [{ id: 'gpt-a' }, { id: 'gpt-b' }],
    });
    expect(text).not.toContain(KEY);
    expect(ctx.calls[0]?.url).toBe('https://api.openai.com/v1/models');
    expect(ctx.calls[0]?.headers.get('Authorization')).toBe(`Bearer ${KEY}`);
    expect(ctx.dbText()).not.toContain(KEY);
  });

  it('uses x-api-key for Anthropic model lists', async () => {
    const ctx = setup({
      handler: () =>
        Response.json({
          data: [{ id: 'claude-x', display_name: 'Claude X' }],
        }),
    });
    const me = await ctx.user();
    const response = await me.get('/v1/ai/models', byok('anthropic', ''));
    expect(await response.json()).toEqual({
      models: [{ id: 'claude-x', name: 'Claude X' }],
    });
    expect(ctx.calls[0]?.url).toBe('https://api.anthropic.com/v1/models');
    expect(ctx.calls[0]?.headers.get('x-api-key')).toBe(KEY);
    expect(ctx.calls[0]?.headers.get('anthropic-version')).toBe('2023-06-01');
  });

  it('answers clean errors without a key, with a bad origin, or a refused key', async () => {
    const ctx = setup({
      handler: () =>
        new Response(`{"error":"invalid key ${KEY}"}`, { status: 401 }),
    });
    const me = await ctx.user();
    const none = await me.get('/v1/ai/models');
    expect(none.status).toBe(400);
    expect(await none.json()).toEqual({
      code: 'ai_key_missing',
      message: 'Add your API key to list models',
    });
    const foreign = await ctx.call('/v1/ai/models', {
      headers: { ...byok('openai', ''), Origin: 'https://evil.example' },
    });
    expect(foreign.status).toBe(403);
    expect(await foreign.text()).not.toContain(KEY);
    const refused = await me.get('/v1/ai/models', byok('groq', ''));
    const body = await refused.text();
    expect(refused.status).toBe(400);
    expect(JSON.parse(body)).toEqual({
      code: 'ai_key_rejected',
      message: 'The provider refused that key',
    });
    expect(body).not.toContain(KEY);
    const signedOut = await ctx.call('/v1/ai/models', {
      headers: { ...byok('openai', ''), Origin: APP },
    });
    expect(signedOut.status).toBe(401);
    expect(await signedOut.text()).not.toContain(KEY);
  });

  it('edits with the user key and provider, skipping kimo quota, storing nothing', async () => {
    const ctx = setup({ kimoKey: 'kimo-meta-key' });
    const me = await ctx.user();
    const sessionId = await startSession(me);
    const snap = sessionSnapshotSchema.parse(
      await (await me.get(`/v1/sessions/${sessionId}`)).json(),
    );
    const clip = Object.values(snap.project.clips)[0];
    if (!clip) throw new Error('no clip');
    ctx.setHandler(() =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                message: 'trimmed.',
                ops: [{ op: 'clip.trim', id: clip.id, edge: 'out', value: 4 }],
              }),
            },
          },
        ],
      }),
    );
    // Even with kimo's quota used up, a user-key edit still runs.
    const day = new Date().toISOString().slice(0, 10);
    createTestDbInsertUsage(ctx, me.id, day);
    const response = await me.post(
      `/v1/sessions/${sessionId}/messages`,
      { text: 'shorter' },
      byok('openrouter', 'meta-llama/llama-4'),
    );
    expect(response.status).toBe(202);
    expect(await response.text()).not.toContain(KEY);
    const sent = ctx.calls.at(-1);
    expect(sent?.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(sent?.headers.get('Authorization')).toBe(`Bearer ${KEY}`);
    expect(sent?.body).toContain('meta-llama/llama-4');
    expect(sent?.body).not.toContain(KEY);
    const after = sessionSnapshotSchema.parse(
      await (await me.get(`/v1/sessions/${sessionId}`)).json(),
    );
    expect(after.project.clips[clip.id]?.duration).toBe(4);
    expect(ctx.dbText()).not.toContain(KEY);
  });

  it('talks to Anthropic Messages natively and parses the text block', async () => {
    const ctx = setup();
    const me = await ctx.user();
    const sessionId = await startSession(me);
    ctx.setHandler(() =>
      Response.json({
        content: [
          { type: 'text', text: 'here you go {"message":"left it","ops":[]}' },
        ],
      }),
    );
    const response = await me.post(
      `/v1/sessions/${sessionId}/messages`,
      { text: 'anything' },
      byok('anthropic', 'claude-test'),
    );
    expect(response.status).toBe(202);
    const sent = ctx.calls.at(-1);
    expect(sent?.url).toBe('https://api.anthropic.com/v1/messages');
    expect(sent?.headers.get('x-api-key')).toBe(KEY);
    expect(sent?.headers.get('Authorization')).toBeNull();
    const body = JSON.parse(sent?.body ?? '{}') as {
      system?: string;
      model?: string;
    };
    expect(body.model).toBe('claude-test');
    expect(body.system).toContain('you are kimo');
  });

  it('never echoes the key from upstream errors, exceptions or logs', async () => {
    const logs: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
    const ctx = setup();
    const me = await ctx.user();
    const sessionId = await startSession(me);
    const cases: Handler[] = [
      () => new Response(`bad key ${KEY}`, { status: 401 }),
      () => new Response(`oops ${KEY}`, { status: 500 }),
      () => {
        throw new Error(`network failed for ${KEY}`);
      },
      () =>
        Response.json({
          choices: [{ message: { content: `not json ${KEY}` } }],
        }),
      () =>
        Response.json({
          choices: [
            { message: { content: JSON.stringify({ message: KEY, ops: [] }) } },
          ],
        }),
    ];
    for (const handler of cases) {
      ctx.setHandler(handler);
      const response = await me.post(
        `/v1/sessions/${sessionId}/messages`,
        { text: 'go' },
        byok('openai'),
      );
      expect(response.status).not.toBe(500);
      expect(await response.text()).not.toContain(KEY);
    }
    expect(logs.join('\n')).not.toContain(KEY);
    expect(ctx.dbText()).not.toContain(KEY);
  });

  it('redacts the key from logged internal errors', async () => {
    const logs: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
    const ctx = setup();
    const me = await ctx.user();
    // A broken database makes the route throw a non-HTTP error.
    ctx.env.DB = {
      prepare: () => {
        throw new Error(`db exploded near ${KEY}`);
      },
      batch: () => Promise.reject(new Error('no')),
    };
    const response = await me.get('/v1/ai/models', byok('openai', ''));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain(KEY);
    expect(logs.join('\n')).toContain('[redacted]');
    expect(logs.join('\n')).not.toContain(KEY);
  });

  it('refuses bad providers, models and keys without echoing them', async () => {
    const ctx = setup();
    const me = await ctx.user();
    const sessionId = await startSession(me);
    for (const [headers, code] of [
      [byok('nope'), 'ai_provider_invalid'],
      [byok('openai', 'bad model id!'), 'ai_model_invalid'],
      [{ ...byok('openai'), 'X-AI-Key': 'short' }, 'ai_key_invalid'],
    ] as const) {
      const response = await me.post(
        `/v1/sessions/${sessionId}/messages`,
        { text: 'go' },
        headers,
      );
      const text = await response.text();
      expect(response.status).toBe(400);
      expect((JSON.parse(text) as { code: string }).code).toBe(code);
      expect(text).not.toContain(KEY);
    }
    expect(ctx.calls).toHaveLength(0);
  });

  it('falls back to the calm AI-off state with no user key and no kimo key', async () => {
    const ctx = setup();
    const me = await ctx.user();
    const sessionId = await startSession(me);
    const response = await me.post(`/v1/sessions/${sessionId}/messages`, {
      text: 'go',
    });
    expect(response.status).toBe(503);
    expect(((await response.json()) as { code: string }).code).toBe(
      'ai_unavailable',
    );
  });

  it('allows the AI headers in CORS preflight for the app only', async () => {
    const ctx = setup();
    const response = await ctx.call('/v1/ai/models', {
      method: 'OPTIONS',
      headers: { Origin: APP },
    });
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain(
      'X-AI-Key',
    );
    const other = await ctx.call('/v1/ai/models', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example' },
    });
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

function createTestDbInsertUsage(
  ctx: ReturnType<typeof setup>,
  userId: string,
  day: string,
) {
  (ctx.env.DB as ReturnType<typeof createTestDb>).sqlite
    .prepare(
      'INSERT INTO daily_usage (user_id, day, ai_edits) VALUES (?, ?, 40)',
    )
    .run(userId, day);
}

describe('custom base URL safety (SSRF)', () => {
  it('accepts public https URLs only', () => {
    expect(safeBaseUrl('https://api.together.xyz/v1/')).toBe(
      'https://api.together.xyz/v1',
    );
    for (const url of [
      'http://api.example.com/v1',
      'https://localhost/v1',
      'https://127.0.0.1/v1',
      'https://10.0.0.5/v1',
      'https://192.168.1.1/v1',
      'https://172.16.0.1/v1',
      'https://169.254.169.254/latest',
      'https://100.64.0.1/v1',
      'https://[::1]/v1',
      'https://[fe80::1]/v1',
      'https://0x7f.0.0.1/v1',
      'https://2130706433/v1',
      'https://intranet/v1',
      'https://printer.local/v1',
      'https://metadata.google.internal/v1',
      'https://api.getkimo.tech/v1',
      'https://user:pass@api.example.com/v1',
      'https://api.example.com:8443/v1',
      'https://api.example.com/v1?x=1',
      'ftp://api.example.com',
      'not a url',
    ])
      expect(() => safeBaseUrl(url), url).toThrow(HttpError);
  });

  it('flags private hosts', () => {
    expect(isBlockedHost('api.openai.com')).toBe(false);
    expect(isBlockedHost('8.8.8.8')).toBe(false);
    expect(isBlockedHost('foo.localhost')).toBe(true);
  });

  it('needs a custom base URL for the custom provider and never calls a bad one', async () => {
    const ctx = setup();
    const me = await ctx.user();
    const response = await me.get(
      '/v1/ai/models',
      byok('custom', '', { 'X-AI-Base-URL': 'https://169.254.169.254/v1' }),
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe(
      'ai_base_url_invalid',
    );
    expect(ctx.calls).toHaveLength(0);
    const ok = await me.get(
      '/v1/ai/models',
      byok('custom', '', { 'X-AI-Base-URL': 'https://llm.example.com/v1' }),
    );
    expect(ok.status).toBe(200);
    expect(ctx.calls[0]?.url).toBe('https://llm.example.com/v1/models');
  });

  it('reads nothing when no key header is present', () => {
    expect(userAiConfig(new Headers({ 'X-AI-Provider': 'openai' }))).toBeNull();
  });
});
