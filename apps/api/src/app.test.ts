import { describe, expect, it } from 'vitest';
import {
  authSchema,
  exportSchema,
  meSchema,
  projectListSchema,
  projectResponseSchema,
} from '@kimo/client';
import { createApp } from './app.ts';
import { createTestDb } from './d1-fake.ts';
import type { Env } from './env.ts';

const APP = 'https://app.getkimo.tech';
const API = 'https://api.getkimo.tech';

function setup(extra: Partial<Env> = {}) {
  const env: Env = {
    DB: createTestDb(),
    APP_ORIGIN: APP,
    API_ORIGIN: API,
    COOKIE_DOMAIN: '.getkimo.tech',
    GITHUB_CLIENT_ID: 'gh-client',
    GITHUB_CLIENT_SECRET: 'gh-secret',
    ...extra,
  };
  const providerCalls: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    providerCalls.push(url);
    if (url === 'https://github.com/login/oauth/access_token')
      return Response.json({ access_token: 'gh-token' });
    if (url === 'https://api.github.com/user')
      return Response.json({
        id: 42,
        login: 'naman',
        name: 'Naman Sharma',
        email: null,
        avatar_url: 'https://avatars.githubusercontent.com/u/42',
      });
    if (url === 'https://api.github.com/user/emails')
      return Response.json([
        { email: 'other@example.com', primary: false, verified: true },
        { email: 'naman@example.com', primary: true, verified: true },
      ]);
    return new Response('nope', { status: 404 });
  };
  const app = createApp({ fetcher });
  const call = (path: string, init: RequestInit = {}) =>
    app.fetch(new Request(`${API}${path}`, init), env);
  return { env, app, call, providerCalls };
}

async function signIn(call: ReturnType<typeof setup>['call']) {
  const start = await call(
    `/v1/auth/github?returnTo=${encodeURIComponent(`${APP}/signin?state=returning`)}`,
  );
  const location = new URL(start.headers.get('Location') ?? '');
  const state = location.searchParams.get('state') ?? '';
  const done = await call(`/v1/auth/github/callback?code=abc&state=${state}`, {
    headers: { Cookie: `kimo_oauth_state=${state}` },
  });
  const cookies = done.headers.getSetCookie();
  const session = cookies.find((c) => c.startsWith('kimo_session='));
  const token = session?.split(';')[0] ?? '';
  return { done, cookies, session, cookieHeader: token };
}

describe('kimo api worker', () => {
  it('answers a signed-out session in the client contract shape', async () => {
    const { call } = setup();
    const response = await call('/v1/auth/session', {
      headers: { Origin: APP },
    });
    expect(response.status).toBe(200);
    expect(authSchema.parse(await response.json())).toEqual({
      signedIn: false,
      remaining: 0,
      mock: false,
    });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(APP);
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe(
      'true',
    );
  });

  it('answers CORS preflight only for the app origin', async () => {
    const { call } = setup();
    const ok = await call('/v1/projects', {
      method: 'OPTIONS',
      headers: { Origin: APP, 'Access-Control-Request-Method': 'PATCH' },
    });
    expect(ok.status).toBe(204);
    expect(ok.headers.get('Access-Control-Allow-Methods')).toContain('PATCH');
    const other = await call('/v1/projects', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example' },
    });
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const write = await call('/v1/auth/signout', {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
    });
    expect(write.status).toBe(403);
  });

  it('redirects to the provider and rejects foreign return addresses', async () => {
    const { call } = setup({
      GOOGLE_CLIENT_ID: 'g-client',
      GOOGLE_CLIENT_SECRET: 'g-secret',
    });
    const github = await call(
      `/v1/auth/github?returnTo=${encodeURIComponent(`${APP}/projects`)}`,
    );
    expect(github.status).toBe(302);
    const url = new URL(github.headers.get('Location') ?? '');
    expect(url.origin).toBe('https://github.com');
    expect(url.searchParams.get('client_id')).toBe('gh-client');
    expect(url.searchParams.get('redirect_uri')).toBe(
      `${API}/v1/auth/github/callback`,
    );
    const google = await call('/v1/auth/google');
    const gurl = new URL(google.headers.get('Location') ?? '');
    expect(gurl.origin).toBe('https://accounts.google.com');
    expect(gurl.searchParams.get('client_id')).toBe('g-client');
    const bad = await call(
      `/v1/auth/github?returnTo=${encodeURIComponent('https://evil.example/')}`,
    );
    expect(bad.status).toBe(302);
    expect(new URL(bad.headers.get('Location') ?? '').origin).toBe(
      'https://github.com',
    );
  });

  it('reports an unconfigured provider plainly', async () => {
    const { call } = setup();
    const response = await call('/v1/auth/google');
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(
      `${APP}/signin?error=unavailable&provider=google`,
    );
    const providers = await call('/v1/auth/providers');
    expect(await providers.json()).toEqual({ providers: ['github'] });
  });

  it('refuses a callback whose state does not match', async () => {
    const { call } = setup();
    const response = await call('/v1/auth/github/callback?code=x&state=nope', {
      headers: { Cookie: 'kimo_oauth_state=nope' },
    });
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(
      `${APP}/signin?error=expired&provider=github`,
    );
  });

  it('signs in with GitHub and sets a secure cross-subdomain cookie', async () => {
    const { call } = setup();
    const { done, session, cookieHeader } = await signIn(call);
    expect(done.status).toBe(302);
    expect(done.headers.get('Location')).toBe(`${APP}/signin?state=returning`);
    expect(session).toContain('HttpOnly');
    expect(session).toContain('Secure');
    expect(session).toContain('SameSite=Lax');
    expect(session).toContain('Domain=.getkimo.tech');
    const auth = await call('/v1/auth/session', {
      headers: { Cookie: cookieHeader },
    });
    expect(authSchema.parse(await auth.json())).toEqual({
      signedIn: true,
      remaining: 10,
      mock: false,
    });
    const me = meSchema.parse(
      await (
        await call('/v1/me', { headers: { Cookie: cookieHeader } })
      ).json(),
    );
    expect(me.user).toMatchObject({
      name: 'Naman Sharma',
      email: 'naman@example.com',
      provider: 'github',
    });
    expect(me.usage.videosLimit).toBe(10);
  });

  it('manages projects for the signed-in user only', async () => {
    const { call } = setup();
    const { cookieHeader } = await signIn(call);
    const headers = {
      Cookie: cookieHeader,
      Origin: APP,
      'Content-Type': 'application/json',
    };
    expect((await call('/v1/projects')).status).toBe(401);
    const created = projectResponseSchema.parse(
      await (
        await call('/v1/projects', {
          method: 'POST',
          headers,
          body: JSON.stringify({ title: 'mountain drive', prompt: 'dusk' }),
        })
      ).json(),
    ).project;
    expect(created).toMatchObject({ title: 'mountain drive', status: 'draft' });
    const renamed = await call(`/v1/projects/${created.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ title: 'night drive' }),
    });
    expect(
      projectResponseSchema.parse(await renamed.json()).project.title,
    ).toBe('night drive');
    const copy = await call('/v1/projects', {
      method: 'POST',
      headers,
      body: JSON.stringify({ duplicateOf: created.id }),
    });
    expect(copy.status).toBe(201);
    let list = projectListSchema.parse(
      await (await call('/v1/projects', { headers })).json(),
    );
    expect(list.projects).toHaveLength(2);
    expect(
      (await call(`/v1/projects/${created.id}`, { method: 'DELETE', headers }))
        .status,
    ).toBe(204);
    list = projectListSchema.parse(
      await (await call('/v1/projects', { headers })).json(),
    );
    expect(list.projects).toHaveLength(1);
    const restored = await call(`/v1/projects/${created.id}/restore`, {
      method: 'POST',
      headers,
    });
    expect(restored.status).toBe(200);
    const invalid = await call('/v1/projects', {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: '' }),
    });
    expect(invalid.status).toBe(400);
  });

  it('saves preferences, exports data, signs out and deletes the account', async () => {
    const { call, env } = setup();
    const { cookieHeader } = await signIn(call);
    const headers = {
      Cookie: cookieHeader,
      Origin: APP,
      'Content-Type': 'application/json',
    };
    const patched = await call('/v1/me/preferences', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ defaultAspect: '9:16', reduceMotion: true }),
    });
    expect(await patched.json()).toMatchObject({
      preferences: { defaultAspect: '9:16', reduceMotion: true },
    });
    const exported = await call('/v1/me/export', { headers });
    expect(exported.headers.get('Content-Disposition')).toContain('attachment');
    expect(
      exportSchema.parse(await exported.json()).preferences.defaultAspect,
    ).toBe('9:16');
    const signedOut = await call('/v1/auth/signout', {
      method: 'POST',
      headers: { Cookie: cookieHeader, Origin: APP },
    });
    expect(signedOut.status).toBe(204);
    expect(signedOut.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect((await call('/v1/me', { headers })).status).toBe(401);

    const again = await signIn(call);
    const deleted = await call('/v1/me', {
      method: 'DELETE',
      headers: { ...headers, Cookie: again.cookieHeader },
    });
    expect(deleted.status).toBe(204);
    const users = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM users',
    ).first<{
      n: number;
    }>();
    expect(users?.n).toBe(0);
  });

  it('says video editing is not available yet', async () => {
    const { call } = setup();
    const response = await call('/v1/sessions', {
      method: 'POST',
      headers: { Origin: APP },
    });
    expect(response.status).toBe(501);
  });
});
