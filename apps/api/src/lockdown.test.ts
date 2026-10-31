import { describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { spentUsd } from './ai-budget.ts';
import { createTestDb } from './d1-fake.ts';
import type { Env } from './env.ts';
import { pkceChallenge } from './oauth.ts';
import { parseAllowlist, ownerSubject, signDesktopToken } from './owner.ts';
// The web editor's kimo-key fallback is owner-only too: editing.test.ts
// ('keeps kimo’s key for allowlisted owners') covers it end to end.

/**
 * Phase 7 key lockdown: kimo's own META_API_KEY answers only allowlisted
 * owners holding a server-minted desktop token. Everyone else is refused
 * before any upstream call, or uses their own key (BYOK passthrough).
 */
const API = 'https://api.getkimo.tech';
const SECRET = 'lockdown-secret-lockdown-secret-0123456789';
const ALLOW =
  'github:naman-sharma12345, google:namanthesharma123@gmail.com, gauravnihongo@gmail.com';
const JSONH = { 'Content-Type': 'application/json' };
const SPENDING: [string, RequestInit][] = [
  [
    '/v1/desktop/ai',
    { method: 'POST', headers: JSONH, body: '{"kind":"build","text":"hi"}' },
  ],
  ['/v1/desktop/sam', { method: 'POST', headers: JSONH, body: '{}' }],
  [
    '/v1/desktop/sam/file',
    {
      method: 'POST',
      headers: { 'Content-Type': 'video/mp4' },
      body: new Uint8Array([0, 0, 0, 24]),
    },
  ],
  [
    '/v1/desktop/sam/file/delete',
    { method: 'POST', headers: JSONH, body: '{"file_id":"file-123"}' },
  ],
  [
    '/v1/desktop/image',
    { method: 'POST', headers: JSONH, body: '{"prompt":"a rocket"}' },
  ],
];

function setup(extra: Partial<Env> = {}) {
  const env = {
    DB: createTestDb(),
    APP_ORIGIN: 'https://app.getkimo.tech',
    API_ORIGIN: API,
    COOKIE_DOMAIN: '.getkimo.tech',
    META_API_KEY: 'meta-key',
    META_IMAGE_MODEL: 'meta-image-test',
    GITHUB_CLIENT_ID: 'gh-id',
    GITHUB_CLIENT_SECRET: 'gh-secret',
    OWNER_ALLOWLIST: ALLOW,
    DESKTOP_TOKEN_SECRET: SECRET,
    ...extra,
  } as Env;
  const calls: { url: string; auth: string }[] = [];
  let githubLogin = 'naman-sharma12345';
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({
      url,
      auth: new Headers(init?.headers).get('Authorization') ?? '',
    });
    if (url === 'https://github.com/login/oauth/access_token')
      return Response.json({ access_token: 'gh-token' });
    if (url === 'https://api.github.com/user')
      return Response.json({ id: 182637278, login: githubLogin, name: 'N' });
    if (url === 'https://api.github.com/user/emails') return Response.json([]);
    if (url.endsWith('/chat/completions'))
      return Response.json({
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });
    if (url.endsWith('/images/generations'))
      return Response.json({ data: [{ b64_json: 'iVBORw0KGgo=' }] });
    if (url.endsWith('/files/file-123'))
      return Response.json({ deleted: true });
    return new Response('nope', { status: 404 });
  };
  const app = createApp({ fetcher });
  const call = (path: string, init: RequestInit = {}) =>
    app.fetch(new Request(`${API}${path}`, init), env);
  const metaCalls = () =>
    calls.filter((c) => c.url.startsWith('https://api.meta.ai'));
  return {
    env,
    call,
    calls,
    metaCalls,
    setLogin: (login: string) => (githubLogin = login),
  };
}

async function token(
  overrides: Record<string, unknown> = {},
  secret = SECRET,
): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  return (await signDesktopToken({ DESKTOP_TOKEN_SECRET: secret } as Env, {
    sub: 'github:naman-sharma12345',
    uid: 'u1',
    idp: 'github',
    pid: '182637278',
    em: '',
    lg: 'naman-sharma12345',
    iat,
    exp: iat + 1800,
    ...overrides,
  })) as string;
}
const route = (i: number): RequestInit => SPENDING[i]?.[1] ?? {};
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const withHeaders = (init: RequestInit, headers: Record<string, string>) => ({
  ...init,
  headers: { ...(init.headers as Record<string, string>), ...headers },
});

describe('owner allowlist', () => {
  it('matches github logins, google and plain emails; empty allows nobody', () => {
    const list = parseAllowlist(ALLOW);
    expect(
      ownerSubject(list, {
        provider: 'github',
        providerId: '1',
        email: '',
        login: 'Naman-Sharma12345',
      }),
    ).toBe('github:naman-sharma12345');
    expect(
      ownerSubject(list, {
        provider: 'google',
        providerId: 'g',
        email: 'NamanTheSharma123@gmail.com',
      }),
    ).toBe('google:namanthesharma123@gmail.com');
    expect(
      ownerSubject(list, {
        provider: 'github',
        providerId: '2',
        email: 'gauravnihongo@gmail.com',
      }),
    ).toBe('email:gauravnihongo@gmail.com');
    expect(
      ownerSubject(list, {
        provider: 'github',
        providerId: '3',
        email: 'x@y.z',
        login: 'someone',
      }),
    ).toBeNull();
    // google:<email> is not satisfied by another provider's email
    expect(
      ownerSubject(list, {
        provider: 'github',
        providerId: '4',
        email: 'namanthesharma123@gmail.com',
      }),
    ).toBeNull();
    expect(
      ownerSubject(parseAllowlist(''), {
        provider: 'github',
        providerId: '1',
        email: '',
        login: 'naman-sharma12345',
      }),
    ).toBeNull();
  });
});

describe('Meta key lockdown', () => {
  it('refuses anonymous calls to every spending route with 401 and no Meta call', async () => {
    const { call, metaCalls } = setup();
    for (const [path, init] of SPENDING) {
      const r = await call(path, init);
      expect(r.status, path).toBe(401);
      // the old shared desktop header no longer opens anything
      const old = await call(
        path,
        withHeaders(init, { 'X-Kimo-Desktop': '1' }),
      );
      expect(old.status, path).toBe(401);
    }
    expect(metaCalls()).toHaveLength(0);
  });

  it('refuses a validly signed token whose identity is not on the allowlist (403)', async () => {
    const { call, metaCalls } = setup();
    const t = await token({ sub: 'github:someone', lg: 'someone', pid: '9' });
    for (const [path, init] of SPENDING) {
      const r = await call(path, withHeaders(init, bearer(t)));
      expect(r.status, path).toBe(403);
      expect((await r.json()).code).toBe('owner_only');
    }
    expect(metaCalls()).toHaveLength(0);
  });

  it('locks an owner out as soon as the allowlist drops them', async () => {
    const { call, metaCalls } = setup({ OWNER_ALLOWLIST: 'github:other' });
    const r = await call(
      '/v1/desktop/ai',
      withHeaders(route(0), bearer(await token())),
    );
    expect(r.status).toBe(403);
    expect(metaCalls()).toHaveLength(0);
  });

  it('refuses forged, tampered and expired tokens, and fails closed without a server secret', async () => {
    const { call, metaCalls } = setup();
    const forged = await token({}, 'some-other-secret-some-other-secret-00');
    const good = await token();
    const [p, payload, mac] = good.split('.') as [string, string, string];
    const claims = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
    );
    const tampered = `${p}.${btoa(JSON.stringify({ ...claims, sub: 'github:x', exp: claims.exp + 9999 })).replace(/=+$/, '')}.${mac}`;
    const expired = await token({
      iat: Math.floor(Date.now() / 1000) - 4000,
      exp: Math.floor(Date.now() / 1000) - 100,
    });
    const tooLong = await token({ exp: Math.floor(Date.now() / 1000) + 86400 });
    for (const t of [
      forged,
      tampered,
      expired,
      tooLong,
      'garbage',
      `${good}x`,
    ]) {
      const r = await call('/v1/desktop/ai', withHeaders(route(0), bearer(t)));
      expect(r.status).toBe(401);
    }
    const noSecret = setup({ DESKTOP_TOKEN_SECRET: '' });
    const r = await noSecret.call(
      '/v1/desktop/ai',
      withHeaders(route(0), bearer(good)),
    );
    expect(r.status).toBe(401);
    expect(metaCalls()).toHaveLength(0);
    expect(noSecret.metaCalls()).toHaveLength(0);
  });

  it('lets an allowlisted owner spend kimo’s key (mocked Meta) and meters it', async () => {
    const { call, env, metaCalls } = setup();
    const r = await call(
      '/v1/desktop/ai',
      withHeaders(route(0), bearer(await token())),
    );
    expect(r.status).toBe(200);
    expect(metaCalls()[0]?.auth).toBe('Bearer meta-key');
    expect((await spentUsd(env)).calls).toBe(1);
    const del = await call(
      '/v1/desktop/sam/file/delete',
      withHeaders(route(3), bearer(await token())),
    );
    expect(del.status).toBe(200);
    const img = await call(
      '/v1/desktop/image',
      withHeaders(route(4), bearer(await token())),
    );
    expect(img.status).toBe(200);
    expect((await img.json()).image).toMatch(/^data:image\/png;base64,/);
  });

  it('keeps BYOK on the user’s key: META_API_KEY is never sent and nothing is metered', async () => {
    const { call, env, calls } = setup();
    const byok = {
      'X-AI-Key': 'sk-user-key-123456',
      'X-AI-Provider': 'openai',
      'X-AI-Model': 'gpt-test',
    };
    const r = await call('/v1/desktop/ai', withHeaders(route(0), byok));
    expect(r.status).toBe(200);
    const img = await call('/v1/desktop/image', withHeaders(route(4), byok));
    expect(img.status).toBe(200);
    // SAM on BYOK needs the user's own Meta key
    const sam = await call(
      '/v1/desktop/sam/file/delete',
      withHeaders(route(3), byok),
    );
    expect(sam.status).toBe(400);
    const metaByok = await call(
      '/v1/desktop/sam/file/delete',
      withHeaders(route(3), {
        ...byok,
        'X-AI-Provider': 'meta',
        'X-AI-Key': 'user-meta-key-1',
      }),
    );
    expect(metaByok.status).toBe(200);
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c.auth).not.toContain('meta-key ');
    expect(calls.some((c) => c.auth === 'Bearer meta-key')).toBe(false);
    expect(calls.some((c) => c.auth === 'Bearer sk-user-key-123456')).toBe(
      true,
    );
    expect((await spentUsd(env)).calls).toBe(0);
  });
});

describe('desktop sign-in (loopback + PKCE)', () => {
  async function signIn(h: ReturnType<typeof setup>, verifier: string) {
    const challenge = await pkceChallenge(verifier);
    const start = await h.call(
      `/v1/desktop/auth/start?provider=github&port=53123&state=appstate123&challenge=${challenge}`,
    );
    expect(start.status).toBe(302);
    const github = new URL(start.headers.get('Location') ?? '');
    expect(github.host).toBe('github.com');
    const state = github.searchParams.get('state') ?? '';
    const back = await h.call(
      `/v1/auth/github/callback?code=gh-code&state=${state}`,
      { headers: { Cookie: `kimo_oauth_state=${state}` } },
    );
    expect(back.status).toBe(302);
    return new URL(back.headers.get('Location') ?? '');
  }

  it('hands an owner a one-time code on loopback and redeems it with the verifier only', async () => {
    const h = setup();
    const verifier = 'v'.repeat(20) + 'erifier-0123456789-abcdefghijk';
    const loop = await signIn(h, verifier);
    expect(loop.origin).toBe('http://127.0.0.1:53123');
    expect(loop.pathname).toBe('/callback');
    expect(loop.searchParams.get('state')).toBe('appstate123');
    const code = loop.searchParams.get('code') ?? '';
    expect(code.length).toBeGreaterThan(16);
    const post = (path: string, body: unknown) =>
      h.call(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    // wrong verifier: refused, and the code is spent
    const bad = await post('/v1/desktop/auth/token', {
      code,
      verifier: 'x'.repeat(50),
    });
    expect(bad.status).toBe(401);
    const again = await post('/v1/desktop/auth/token', { code, verifier });
    expect(again.status).toBe(401);
    // a fresh sign-in redeems properly
    const loop2 = await signIn(h, verifier);
    const ok = await post('/v1/desktop/auth/token', {
      code: loop2.searchParams.get('code'),
      verifier,
    });
    expect(ok.status).toBe(200);
    const tokens = await ok.json();
    expect(tokens.subject).toBe('github:naman-sharma12345');
    const ai = await h.call(
      '/v1/desktop/ai',
      withHeaders(route(0), bearer(tokens.access_token)),
    );
    expect(ai.status).toBe(200);
    // refresh rotates: the old refresh token works once
    const r1 = await post('/v1/desktop/auth/refresh', {
      refresh_token: tokens.refresh_token,
    });
    expect(r1.status).toBe(200);
    const r2 = await post('/v1/desktop/auth/refresh', {
      refresh_token: tokens.refresh_token,
    });
    expect(r2.status).toBe(401);
  });

  it('refuses a non-allowlisted GitHub sign-in on loopback and keeps no account', async () => {
    const h = setup();
    h.setLogin('random-person');
    const loop = await signIn(h, 'w'.repeat(48));
    expect(loop.searchParams.get('error')).toBe('not_allowed');
    expect(loop.searchParams.get('code')).toBeNull();
    const users = await h.env.DB.prepare(
      'SELECT COUNT(*) AS n FROM users',
    ).first<{
      n: number;
    }>();
    expect(users?.n).toBe(0);
  });

  it('rejects malformed desktop sign-in requests', async () => {
    const { call } = setup();
    for (const q of [
      'provider=github&port=80&state=appstate123&challenge=' + 'a'.repeat(43),
      'provider=github&port=53123&state=a&challenge=' + 'a'.repeat(43),
      'provider=evil&port=53123&state=appstate123&challenge=' + 'a'.repeat(43),
      'provider=github&port=53123&state=appstate123&challenge=short',
    ]) {
      const r = await call(`/v1/desktop/auth/start?${q}`);
      expect(r.status).toBe(400);
    }
  });
});
