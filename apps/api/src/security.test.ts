import { describe, expect, it } from 'vitest';
import { exportSchema, meSchema, projectResponseSchema } from '@kimo/client';
import { createApp } from './app.ts';
import { createTestDb } from './d1-fake.ts';
import type { Env } from './env.ts';
import { cleanAvatar, cleanName, verifyGoogleIdToken } from './oauth.ts';

const APP = 'https://app.getkimo.tech';
const API = 'https://api.getkimo.tech';

function b64url(value: unknown) {
  return btoa(JSON.stringify(value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

interface Fixture {
  githubEmail: string;
  githubName: string;
  googleEmail: string;
  googleVerified: boolean;
  googleAud: string;
  googleNonce: string | null;
}

function setup(overrides: Partial<Fixture> = {}) {
  const db = createTestDb();
  const env: Env = {
    DB: db,
    APP_ORIGIN: APP,
    API_ORIGIN: API,
    COOKIE_DOMAIN: '.getkimo.tech',
    GITHUB_CLIENT_ID: 'gh-client',
    GITHUB_CLIENT_SECRET: 'gh-secret',
    GOOGLE_CLIENT_ID: 'g-client',
    GOOGLE_CLIENT_SECRET: 'g-secret',
  };
  const fixture: Fixture = {
    githubEmail: 'naman@example.com',
    githubName: 'Naman Sharma',
    googleEmail: 'Naman@Example.com',
    googleVerified: true,
    googleAud: 'g-client',
    googleNonce: null,
    ...overrides,
  };
  const bodies: Record<string, string> = {};
  let nonce = '';
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    bodies[url] = String(init?.body ?? '');
    if (url === 'https://github.com/login/oauth/access_token')
      return Response.json({ access_token: 'gh-token' });
    if (url === 'https://api.github.com/user')
      return Response.json({
        id: 42,
        login: 'naman',
        name: fixture.githubName,
        email: null,
        avatar_url: 'https://avatars.githubusercontent.com/u/42',
      });
    if (url === 'https://api.github.com/user/emails')
      return Response.json([
        { email: fixture.githubEmail, primary: true, verified: true },
      ]);
    if (url === 'https://oauth2.googleapis.com/token')
      return Response.json({
        access_token: 'g-token',
        id_token: `${b64url({ alg: 'RS256' })}.${b64url({
          iss: 'https://accounts.google.com',
          aud: fixture.googleAud,
          exp: Math.floor(Date.now() / 1000) + 600,
          sub: 'google-sub-1',
          nonce: fixture.googleNonce ?? nonce,
          email: fixture.googleEmail,
          email_verified: fixture.googleVerified,
          name: 'Naman S',
          picture: 'https://lh3.googleusercontent.com/a/x',
        })}.sig`,
      });
    return new Response('nope', { status: 404 });
  };
  const app = createApp({ fetcher });
  const call = (path: string, init: RequestInit = {}) =>
    app.fetch(new Request(`${API}${path}`, init), env);

  async function signIn(
    provider: 'github' | 'google',
    returnTo = `${APP}/signin?state=returning`,
    extraCookie = '',
  ) {
    const start = await call(
      `/v1/auth/${provider}?returnTo=${encodeURIComponent(returnTo)}`,
      { headers: { 'CF-Connecting-IP': '203.0.113.9' } },
    );
    const location = new URL(start.headers.get('Location') ?? '');
    const state = location.searchParams.get('state') ?? '';
    nonce = location.searchParams.get('nonce') ?? '';
    const done = await call(
      `/v1/auth/${provider}/callback?code=abc&state=${state}`,
      {
        headers: {
          Cookie: `kimo_oauth_state=${state}${extraCookie ? `; ${extraCookie}` : ''}`,
        },
      },
    );
    const session = done.headers
      .getSetCookie()
      .find((c) => c.startsWith('kimo_session='));
    return {
      start,
      location,
      done,
      cookieHeader: session?.split(';')[0] ?? '',
    };
  }
  const count = async (table: string) =>
    (
      await db
        .prepare(`SELECT COUNT(*) AS n FROM ${table}`)
        .first<{ n: number }>()
    )?.n ?? 0;
  return { env, db, call, signIn, bodies, count };
}

const writeHeaders = (cookie: string) => ({
  Cookie: cookie,
  Origin: APP,
  'Content-Type': 'application/json',
});

describe('oauth hardening', () => {
  it('uses PKCE S256 and sends the verifier on the token exchange', async () => {
    const { signIn, bodies } = setup();
    const { location, done } = await signIn('github');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    const challenge = location.searchParams.get('code_challenge') ?? '';
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(location.searchParams.get('scope')).toBe('user:email');
    const sent = JSON.parse(
      bodies['https://github.com/login/oauth/access_token'] ?? '{}',
    ) as { code_verifier?: string };
    expect(sent.code_verifier).toMatch(/^[A-Za-z0-9_-]{64}$/);
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(sent.code_verifier),
    );
    const expected = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(challenge).toBe(expected);
    expect(done.headers.get('Location')).toBe(`${APP}/signin?state=returning`);
  });

  it('signs in with Google (id_token + nonce + PKCE) and links by verified email', async () => {
    const { signIn, call, bodies, count } = setup();
    const github = await signIn('github');
    const google = await signIn('google');
    expect(google.location.origin).toBe('https://accounts.google.com');
    expect(google.location.searchParams.get('nonce')).toBeTruthy();
    expect(
      new URLSearchParams(bodies['https://oauth2.googleapis.com/token']).get(
        'code_verifier',
      ),
    ).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(google.done.headers.get('Location')).toBe(
      `${APP}/signin?state=returning`,
    );
    expect(await count('users')).toBe(1);
    expect(await count('user_identities')).toBe(2);
    const me = meSchema.parse(
      await (
        await call('/v1/me', { headers: { Cookie: google.cookieHeader } })
      ).json(),
    );
    expect(me.user.provider).toBe('google');
    expect(me.user.email).toBe('naman@example.com');
    const meGithub = meSchema.parse(
      await (
        await call('/v1/me', { headers: { Cookie: github.cookieHeader } })
      ).json(),
    );
    expect(meGithub.user.id).toBe(me.user.id);
    expect(meGithub.user.provider).toBe('github');
  });

  it('never links an unverified Google email to an existing account', async () => {
    const { signIn, count } = setup({ googleVerified: false });
    await signIn('github');
    await signIn('google');
    expect(await count('users')).toBe(2);
  });

  it('rejects an id_token for another client or with a wrong nonce', async () => {
    for (const fixture of [
      { googleAud: 'someone-else' },
      { googleNonce: 'x' },
    ]) {
      const { signIn, count } = setup(fixture);
      const { done } = await signIn('google');
      expect(done.headers.get('Location')).toBe(
        `${APP}/signin?error=not_allowed&provider=google`,
      );
      expect(await count('users')).toBe(0);
    }
    expect(() => verifyGoogleIdToken('a.b.c', 'g-client', 'n', 0)).toThrow();
  });

  it('distinguishes cancel, expired state and a missing state cookie', async () => {
    const { call } = setup();
    const start = await call(
      `/v1/auth/github?returnTo=${encodeURIComponent(`${APP}/signin?state=returning&next=%2Faccount`)}`,
    );
    const state =
      new URL(start.headers.get('Location') ?? '').searchParams.get('state') ??
      '';
    const cancelled = await call(
      `/v1/auth/github/callback?error=access_denied&state=${state}`,
      { headers: { Cookie: `kimo_oauth_state=${state}` } },
    );
    expect(cancelled.headers.get('Location')).toBe(
      `${APP}/signin?error=cancelled&provider=github&next=%2Faccount`,
    );
    // The state was consumed: replaying it is an expired sign-in.
    const replay = await call(
      `/v1/auth/github/callback?code=abc&state=${state}`,
      { headers: { Cookie: `kimo_oauth_state=${state}` } },
    );
    expect(replay.headers.get('Location')).toContain('error=expired');
    // A valid state without the matching cookie (login CSRF) is refused.
    const start2 = await call('/v1/auth/github');
    const state2 =
      new URL(start2.headers.get('Location') ?? '').searchParams.get('state') ??
      '';
    const noCookie = await call(
      `/v1/auth/github/callback?code=abc&state=${state2}`,
    );
    expect(noCookie.headers.get('Location')).toContain('error=expired');
    expect(noCookie.headers.getSetCookie().join()).not.toContain(
      'kimo_session=',
    );
  });

  it('rotates the session on sign-in and stores only token hashes', async () => {
    const { signIn, db, call } = setup();
    const first = await signIn('github');
    const second = await signIn('github', undefined, first.cookieHeader);
    expect(
      (await call('/v1/me', { headers: { Cookie: first.cookieHeader } }))
        .status,
    ).toBe(401);
    expect(
      (await call('/v1/me', { headers: { Cookie: second.cookieHeader } }))
        .status,
    ).toBe(200);
    const token = second.cookieHeader.split('=')[1] ?? '';
    const rows = await db
      .prepare('SELECT id, expires_at FROM auth_sessions')
      .all<{ id: string; expires_at: string }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]?.id).toMatch(/^[0-9a-f]{64}$/);
    expect(rows.results[0]?.id).not.toContain(token);
    const days =
      (Date.parse(rows.results[0]?.expires_at ?? '') - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(30);
  });

  it('rate limits the auth endpoints per client with a D1 counter', async () => {
    const { call } = setup();
    let last: Response | null = null;
    for (let i = 0; i < 31; i += 1)
      last = await call('/v1/auth/github', {
        headers: { 'CF-Connecting-IP': '198.51.100.7' },
      });
    expect(last?.headers.get('Location')).toBe(
      `${APP}/signin?error=rate_limited&provider=github`,
    );
    const other = await call('/v1/auth/github', {
      headers: { 'CF-Connecting-IP': '198.51.100.8' },
    });
    expect(new URL(other.headers.get('Location') ?? '').origin).toBe(
      'https://github.com',
    );
  });
});

describe('open redirect protection', () => {
  const attacks = [
    'https://evil.example.com',
    '//evil.example.com',
    '/\\evil.example.com',
    'https://app.getkimo.tech.evil.example.com/',
    'https://app.getkimo.tech@evil.example.com/',
    'https://user:pass@app.getkimo.tech/projects',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'http://app.getkimo.tech/projects',
    'https://app.getkimo.tech/\nSet-Cookie:x=1',
  ];
  it.each(attacks)('never returns to %s', async (returnTo) => {
    const { signIn } = setup();
    const { done } = await signIn('github', returnTo);
    const location = new URL(done.headers.get('Location') ?? '');
    expect(location.origin).toBe(APP);
    expect(location.username).toBe('');
  });
});

describe('csrf, injection and input validation', () => {
  it('refuses cookie-authenticated writes without the app Origin', async () => {
    const { signIn, call } = setup();
    const { cookieHeader } = await signIn('github');
    for (const origin of [
      undefined,
      'https://evil.example',
      'https://other.getkimo.tech',
      'null',
    ]) {
      const response = await call('/v1/projects', {
        method: 'POST',
        headers: {
          Cookie: cookieHeader,
          'Content-Type': 'application/json',
          ...(origin ? { Origin: origin } : {}),
        },
        body: JSON.stringify({ title: 'x' }),
      });
      expect(response.status).toBe(403);
    }
    const deletion = await call('/v1/me', {
      method: 'DELETE',
      headers: { Cookie: cookieHeader },
    });
    expect(deletion.status).toBe(403);
    // A form post (text/plain) from the app origin is still refused.
    const form = await call('/v1/projects', {
      method: 'POST',
      headers: {
        Cookie: cookieHeader,
        Origin: APP,
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify({ title: 'x' }),
    });
    expect(form.status).toBe(415);
  });

  it('stores SQL injection and XSS payloads as inert text', async () => {
    const { signIn, call, count } = setup({
      githubName: '<img src=x onerror=alert(1)>\u0000\u202e',
    });
    const { cookieHeader } = await signIn('github');
    const payloads = [
      "'; DROP TABLE users; --",
      "x' OR '1'='1",
      '<script>alert(document.cookie)</script>',
      '"><svg onload=alert(1)>',
    ];
    for (const title of payloads) {
      const response = await call('/v1/projects', {
        method: 'POST',
        headers: writeHeaders(cookieHeader),
        body: JSON.stringify({ title, prompt: title }),
      });
      expect(response.status).toBe(201);
      expect(response.headers.get('Content-Type')).toContain(
        'application/json',
      );
      expect(
        projectResponseSchema.parse(await response.json()).project.title,
      ).toBe(title);
    }
    expect(await count('users')).toBe(1);
    expect(await count('projects')).toBe(payloads.length);
    const me = meSchema.parse(
      await (
        await call('/v1/me', { headers: { Cookie: cookieHeader } })
      ).json(),
    );
    expect(me.user.name).toBe('<img src=x onerror=alert(1)>');
    // Injection through ids in the path is a plain 404.
    for (const id of ["1' OR '1'='1", '%E0%A4%A', 'x'.repeat(200), '..%2F..']) {
      const response = await call(`/v1/projects/${id}`, {
        headers: { Cookie: cookieHeader },
      });
      expect(response.status).toBe(404);
      expect(await response.text()).not.toMatch(/sqlite|SELECT|stack|at /i);
    }
  });

  it('validates and length-limits inputs', async () => {
    const { signIn, call } = setup();
    const { cookieHeader } = await signIn('github');
    const bad = [
      { title: 'x'.repeat(121) },
      { title: 'tab\there' },
      { title: 'ok', prompt: 'p'.repeat(4001) },
      { title: 'ok', aspect: '4:3' },
      { title: 'ok', sessionId: '../../etc' },
      { title: 'ok', extra: true },
      { duplicateOf: "1' OR 1=1 --" },
    ];
    for (const body of bad) {
      const response = await call('/v1/projects', {
        method: 'POST',
        headers: writeHeaders(cookieHeader),
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
    }
    const prefs = await call('/v1/me/preferences', {
      method: 'PATCH',
      headers: writeHeaders(cookieHeader),
      body: JSON.stringify({ defaultAspect: "'; DROP TABLE preferences; --" }),
    });
    expect(prefs.status).toBe(400);
    const huge = await call('/v1/me/preferences', {
      method: 'PATCH',
      headers: writeHeaders(cookieHeader),
      body: JSON.stringify({ reduceMotion: true, pad: 'x'.repeat(70_000) }),
    });
    expect(huge.status).toBe(413);
    const notJson = await call('/v1/me/preferences', {
      method: 'PATCH',
      headers: writeHeaders(cookieHeader),
      body: '{"reduceMotion":',
    });
    expect(notJson.status).toBe(400);
    expect(await notJson.json()).toEqual({
      code: 'invalid_request',
      message: 'Body is not valid JSON',
    });
  });

  it('cleans provider profile fields', () => {
    expect(cleanName(' a\u0000b\u202ec ')).toBe('abc');
    expect(cleanName('n'.repeat(300))).toHaveLength(100);
    expect(cleanAvatar('javascript:alert(1)')).toBeNull();
    expect(cleanAvatar('http://example.com/a.png')).toBeNull();
    expect(cleanAvatar('https://avatars.githubusercontent.com/u/1')).toBe(
      'https://avatars.githubusercontent.com/u/1',
    );
  });
});

describe('headers and errors', () => {
  it('sends security headers on every answer, including errors and redirects', async () => {
    const { call } = setup();
    for (const response of [
      await call('/v1/auth/session'),
      await call('/nope'),
      await call('/v1/auth/github'),
    ]) {
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('Content-Security-Policy')).toContain(
        "frame-ancestors 'none'",
      );
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    }
    const txt = await call('/.well-known/security.txt');
    expect(await txt.text()).toContain('Contact: mailto:');
  });

  it('never leaks internals when something breaks', async () => {
    const { env, call } = setup();
    const broken: Env = {
      ...env,
      DB: {
        prepare: () => {
          throw new Error('D1_ERROR: no such table: users: SQLITE_ERROR');
        },
        batch: async () => [],
      },
    };
    const app = createApp();
    const original = console.error;
    console.error = () => undefined;
    try {
      const response = await app.fetch(
        new Request(`${API}/v1/me`, { headers: { Cookie: 'kimo_session=x' } }),
        broken,
      );
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        code: 'internal',
        message: 'Something went wrong',
      });
    } finally {
      console.error = original;
    }
    void call;
  });
});

describe('privacy: export and deletion', () => {
  it('exports everything kept about the user and deletion removes every row', async () => {
    const { signIn, call, count, db } = setup();
    await signIn('github');
    const { cookieHeader } = await signIn('google');
    const headers = writeHeaders(cookieHeader);
    const created = projectResponseSchema.parse(
      await (
        await call('/v1/projects', {
          method: 'POST',
          headers,
          body: JSON.stringify({ title: 'keep' }),
        })
      ).json(),
    ).project;
    const gone = projectResponseSchema.parse(
      await (
        await call('/v1/projects', {
          method: 'POST',
          headers,
          body: JSON.stringify({ title: 'binned' }),
        })
      ).json(),
    ).project;
    await call(`/v1/projects/${gone.id}`, { method: 'DELETE', headers });
    await call('/v1/me/preferences', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ captionsDefault: false }),
    });
    const user = await db
      .prepare('SELECT id FROM users')
      .first<{ id: string }>();
    await db
      .prepare(
        "INSERT INTO daily_usage (user_id, day, videos, render_seconds) VALUES (?, '2026-10-28', 2, 60)",
      )
      .bind(user?.id)
      .run();
    const exported = exportSchema.parse(
      await (await call('/v1/me/export', { headers })).json(),
    );
    expect(exported.identities?.map((i) => i.provider).sort()).toEqual([
      'github',
      'google',
    ]);
    expect(exported.sessions?.length).toBe(2);
    expect(JSON.stringify(exported.sessions)).not.toMatch(/[0-9a-f]{64}/);
    expect(exported.projects.map((p) => p.id)).toEqual([created.id]);
    expect(exported.deletedProjects?.map((p) => p.project.id)).toEqual([
      gone.id,
    ]);
    expect(exported.preferences.captionsDefault).toBe(false);
    expect(exported.usage).toEqual([
      { day: '2026-10-28', videos: 2, renderSeconds: 60 },
    ]);

    const deleted = await call('/v1/me', { method: 'DELETE', headers });
    expect(deleted.status).toBe(204);
    for (const table of [
      'users',
      'user_identities',
      'auth_sessions',
      'projects',
      'preferences',
      'daily_usage',
    ])
      expect(await count(table)).toBe(0);
  });
});
