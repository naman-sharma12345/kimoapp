import { z } from 'zod';
import {
  DAILY_RENDER_MINUTES_LIMIT,
  DAILY_VIDEO_LIMIT,
  authProviderSchema,
  defaultPreferences,
  preferencesPatchSchema,
  preferencesSchema,
  projectCreateSchema,
  projectIdSchema,
  projectPatchSchema,
  type ApiProject,
  type AuthProvider,
  type Preferences,
} from '@kimo/client/account';
import type { Env } from './env.ts';
import {
  HttpError,
  cookie,
  errorResponse,
  json,
  noContent,
  readCookie,
  readJson,
  redirect,
  safeDecode,
  withCors,
  withSecurityHeaders,
} from './http.ts';
import {
  authorizeUrl,
  exchangeCode,
  pkceChallenge,
  providerConfig,
  type OAuthIdentity,
} from './oauth.ts';

export const SESSION_COOKIE = 'kimo_session';
export const STATE_COOKIE = 'kimo_oauth_state';
const SESSION_DAYS = 30;
const STATE_MINUTES = 10;
/** Most sessions one account may hold; older ones are signed out. */
const MAX_SESSIONS = 10;
/** Deleted projects stay restorable this long, then are purged. */
const BIN_DAYS = 30;
const DAY_MS = 24 * 60 * 60_000;
/** Free D1 counters: requests per client per 10-minute window. */
const RATE_WINDOW_MS = 10 * 60_000;
const RATE_LIMITS = { auth: 30, write: 300 } as const;

export type SignInErrorKind =
  'cancelled' | 'expired' | 'not_allowed' | 'unavailable' | 'rate_limited';

export interface AppOptions {
  fetcher?: typeof fetch;
  now?: () => Date;
}

interface UserRow {
  id: string;
  provider: AuthProvider;
  session_provider?: string;
  email: string;
  name: string;
  avatar_url: string | null;
  created_at: string;
}
interface ProjectRow {
  id: string;
  session_id: string;
  video_id: string | null;
  title: string;
  prompt: string;
  status: ApiProject['status'];
  aspect: ApiProject['aspect'];
  duration_sec: number;
  poster_url: string | null;
  clip_count: number;
  track_count: number;
  created_at: string;
  updated_at: string;
}

function randomToken(bytes = 32): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function toProject(row: ProjectRow): ApiProject {
  return {
    id: row.id,
    sessionId: row.session_id,
    ...(row.video_id ? { videoId: row.video_id } : {}),
    title: row.title,
    prompt: row.prompt,
    status: row.status,
    aspect: row.aspect,
    durationSec: row.duration_sec,
    ...(row.poster_url ? { posterUrl: row.poster_url } : {}),
    clipCount: row.clip_count,
    trackCount: row.track_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toUser(row: UserRow) {
  const signedInWith = authProviderSchema.safeParse(row.session_provider);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    ...(row.avatar_url ? { avatarUrl: row.avatar_url } : {}),
    provider: signedInWith.success ? signedInWith.data : row.provider,
    createdAt: row.created_at,
  };
}

/** The visitor's IP, hashed before it is ever stored (rate limits only). */
function clientKey(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ??
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

/** Validates a project id taken from the URL path; bad ids are a 404. */
function projectId(raw: string): string {
  const parsed = projectIdSchema.safeParse(safeDecode(raw));
  if (!parsed.success)
    throw new HttpError(404, 'not_found', 'Project not found');
  return parsed.data;
}

export const SECURITY_TXT = `Contact: mailto:namanthesharma123@gmail.com
Expires: 2027-10-28T00:00:00.000Z
Preferred-Languages: en, hi
Canonical: https://api.getkimo.tech/.well-known/security.txt
Policy: https://app.getkimo.tech/privacy
`;

const PROJECT_COLUMNS =
  'id, session_id, video_id, title, prompt, status, aspect, duration_sec, poster_url, clip_count, track_count, created_at, updated_at';

export function createApp(options: AppOptions = {}) {
  const fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
  const now = options.now ?? (() => new Date());

  const day = () => now().toISOString().slice(0, 10);
  const nextReset = () => {
    const reset = new Date(`${day()}T00:00:00.000Z`);
    reset.setUTCDate(reset.getUTCDate() + 1);
    return reset.toISOString();
  };

  async function currentUser(request: Request, env: Env) {
    const token = readCookie(request, SESSION_COOKIE);
    if (!token) return null;
    const row = await env.DB.prepare(
      `SELECT u.id, u.provider, s.provider AS session_provider, u.email, u.name, u.avatar_url, u.created_at
         FROM auth_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ? AND s.expires_at > ?`,
    )
      .bind(await sha256(token), now().toISOString())
      .first<UserRow>();
    return row;
  }

  async function requireUser(request: Request, env: Env) {
    const user = await currentUser(request, env);
    if (!user) throw new HttpError(401, 'unauthorized', 'Sign in first');
    return user;
  }

  async function usageToday(env: Env, userId: string) {
    const row = await env.DB.prepare(
      'SELECT videos, render_seconds FROM daily_usage WHERE user_id = ? AND day = ?',
    )
      .bind(userId, day())
      .first<{ videos: number; render_seconds: number }>();
    return {
      videosToday: row?.videos ?? 0,
      videosLimit: DAILY_VIDEO_LIMIT,
      renderMinutes: Math.round(((row?.render_seconds ?? 0) / 60) * 10) / 10,
      renderMinutesLimit: DAILY_RENDER_MINUTES_LIMIT,
      resetsAt: nextReset(),
    };
  }

  async function readPreferences(env: Env, userId: string) {
    const row = await env.DB.prepare(
      'SELECT data FROM preferences WHERE user_id = ?',
    )
      .bind(userId)
      .first<{ data: string }>();
    if (!row) return defaultPreferences;
    let stored: unknown;
    try {
      stored = JSON.parse(row.data);
    } catch {
      return defaultPreferences;
    }
    const parsed = preferencesSchema.safeParse({
      ...defaultPreferences,
      ...(stored && typeof stored === 'object' ? stored : {}),
    });
    return parsed.success ? parsed.data : defaultPreferences;
  }

  /** Increments a D1 counter and refuses once the window's limit is passed. */
  async function rateLimited(
    env: Env,
    bucket: keyof typeof RATE_LIMITS,
    who: string,
  ): Promise<boolean> {
    const at = now().getTime();
    const window = new Date(at - (at % RATE_WINDOW_MS)).toISOString();
    const key = `${bucket}:${await sha256(who)}`;
    const row = await env.DB.prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
      .bind(key, window)
      .first<{ count: number }>();
    if (bucket === 'auth')
      await env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?')
        .bind(new Date(at - 6 * RATE_WINDOW_MS).toISOString())
        .run();
    return (row?.count ?? 0) > RATE_LIMITS[bucket];
  }

  async function purgeBin(env: Env, userId: string) {
    await env.DB.prepare(
      'DELETE FROM projects WHERE user_id = ? AND deleted_at IS NOT NULL AND deleted_at < ?',
    )
      .bind(userId, new Date(now().getTime() - BIN_DAYS * DAY_MS).toISOString())
      .run();
  }

  async function listProjects(env: Env, userId: string) {
    await purgeBin(env, userId);
    const { results } = await env.DB.prepare(
      `SELECT ${PROJECT_COLUMNS} FROM projects
        WHERE user_id = ? AND deleted_at IS NULL
        ORDER BY updated_at DESC LIMIT 500`,
    )
      .bind(userId)
      .all<ProjectRow>();
    return results.map(toProject);
  }

  async function getProject(
    env: Env,
    userId: string,
    id: string,
    includeDeleted = false,
  ) {
    const row = await env.DB.prepare(
      `SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = ? AND user_id = ?${
        includeDeleted ? '' : ' AND deleted_at IS NULL'
      }`,
    )
      .bind(id, userId)
      .first<ProjectRow>();
    if (!row) throw new HttpError(404, 'not_found', 'Project not found');
    return row;
  }

  /**
   * Post sign-in destination: only an absolute https URL on the app origin
   * (path + query kept, credentials and hash dropped); anything else falls
   * back to /projects instead of failing.
   */
  function safeReturnTo(env: Env, raw: string | null): string {
    const fallback = `${env.APP_ORIGIN}/projects`;
    if (!raw || raw.length > 2048 || /[\\\p{Cc}\s]/u.test(raw)) return fallback;
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return fallback;
    }
    if (url.origin !== env.APP_ORIGIN || url.username || url.password)
      return fallback;
    return `${env.APP_ORIGIN}${url.pathname}${url.search}`;
  }

  /** /signin?error=…&provider=…, keeping the page the user was heading to. */
  function signinError(
    env: Env,
    kind: SignInErrorKind,
    provider: AuthProvider,
    returnTo?: string,
  ) {
    const url = new URL('/signin', env.APP_ORIGIN);
    url.searchParams.set('error', kind);
    url.searchParams.set('provider', provider);
    if (returnTo) {
      try {
        const back = new URL(returnTo);
        const next =
          back.pathname === '/signin'
            ? back.searchParams.get('next')
            : `${back.pathname}${back.search}`;
        if (next && next !== '/projects') url.searchParams.set('next', next);
      } catch {
        // No destination to keep.
      }
    }
    return url.toString();
  }

  async function startOAuth(
    request: Request,
    env: Env,
    provider: AuthProvider,
  ) {
    const returnTo = safeReturnTo(
      env,
      new URL(request.url).searchParams.get('returnTo'),
    );
    const config = providerConfig(env, provider);
    if (!config)
      return redirect(signinError(env, 'unavailable', provider, returnTo));
    if (await rateLimited(env, 'auth', clientKey(request)))
      return redirect(signinError(env, 'rate_limited', provider, returnTo));
    const state = randomToken(24);
    const codeVerifier = randomToken(48);
    const nonce = randomToken(16);
    const expires = new Date(now().getTime() + STATE_MINUTES * 60_000);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM oauth_states WHERE expires_at < ?').bind(
        now().toISOString(),
      ),
      env.DB.prepare(
        'INSERT INTO oauth_states (state, provider, return_to, expires_at, code_verifier, nonce) VALUES (?, ?, ?, ?, ?, ?)',
      ).bind(
        state,
        provider,
        returnTo,
        expires.toISOString(),
        codeVerifier,
        nonce,
      ),
    ]);
    return redirect(
      authorizeUrl(env, provider, config, {
        state,
        codeChallenge: await pkceChallenge(codeVerifier),
        nonce,
      }),
      [
        cookie(
          env,
          STATE_COOKIE,
          state,
          STATE_MINUTES * 60,
          `/v1/auth/${provider}/callback`,
        ),
      ],
    );
  }

  /**
   * Finds the kimo account for a provider identity: the identity itself,
   * else an account with the same provider-verified email (so GitHub and
   * Google sign-ins land in one account), else a new account.
   */
  async function resolveUser(
    env: Env,
    provider: AuthProvider,
    identity: OAuthIdentity,
    stamp: string,
  ): Promise<string> {
    const linked = await env.DB.prepare(
      'SELECT user_id FROM user_identities WHERE provider = ? AND provider_id = ?',
    )
      .bind(provider, identity.providerId)
      .first<{ user_id: string }>();
    let userId = linked?.user_id ?? null;
    if (!userId && identity.email) {
      const byEmail = await env.DB.prepare(
        'SELECT id FROM users WHERE lower(email) = ? ORDER BY created_at LIMIT 1',
      )
        .bind(identity.email)
        .first<{ id: string }>();
      userId = byEmail?.id ?? null;
    }
    if (!userId) {
      userId = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO users (id, provider, provider_id, email, name, avatar_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          userId,
          provider,
          identity.providerId,
          identity.email,
          identity.name,
          identity.avatarUrl,
          stamp,
          stamp,
        )
        .run();
    } else {
      await env.DB.prepare(
        `UPDATE users SET name = ?, avatar_url = COALESCE(?, avatar_url),
           email = CASE WHEN ? <> '' THEN ? ELSE email END, updated_at = ?
         WHERE id = ?`,
      )
        .bind(
          identity.name,
          identity.avatarUrl,
          identity.email,
          identity.email,
          stamp,
          userId,
        )
        .run();
    }
    await env.DB.prepare(
      `INSERT INTO user_identities (provider, provider_id, user_id, email, created_at, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (provider, provider_id) DO UPDATE SET
         email = excluded.email, last_used_at = excluded.last_used_at`,
    )
      .bind(provider, identity.providerId, userId, identity.email, stamp, stamp)
      .run();
    return userId;
  }

  async function finishOAuth(
    request: Request,
    env: Env,
    provider: AuthProvider,
  ) {
    const url = new URL(request.url);
    const state = url.searchParams.get('state') ?? '';
    const code = url.searchParams.get('code');
    const clearState = cookie(
      env,
      STATE_COOKIE,
      '',
      0,
      `/v1/auth/${provider}/callback`,
    );
    if (await rateLimited(env, 'auth', clientKey(request)))
      return redirect(signinError(env, 'rate_limited', provider), [clearState]);
    const validState = /^[A-Za-z0-9_-]{16,64}$/.test(state);
    const stored = validState
      ? await env.DB.prepare(
          'SELECT return_to, provider, expires_at, code_verifier, nonce FROM oauth_states WHERE state = ?',
        )
          .bind(state)
          .first<{
            return_to: string;
            provider: string;
            expires_at: string;
            code_verifier: string;
            nonce: string;
          }>()
      : null;
    // Each state is single use, whatever happens next.
    if (stored)
      await env.DB.prepare('DELETE FROM oauth_states WHERE state = ?')
        .bind(state)
        .run();
    const config = providerConfig(env, provider);
    if (!config)
      return redirect(signinError(env, 'unavailable', provider), [clearState]);
    const denied = url.searchParams.get('error');
    if (
      !stored ||
      stored.provider !== provider ||
      stored.expires_at < now().toISOString() ||
      readCookie(request, STATE_COOKIE) !== state
    )
      return redirect(
        signinError(
          env,
          denied === 'access_denied' ? 'cancelled' : 'expired',
          provider,
          stored?.return_to,
        ),
        [clearState],
      );
    if (!code || denied)
      return redirect(
        signinError(
          env,
          denied === 'access_denied' ? 'cancelled' : 'not_allowed',
          provider,
          stored.return_to,
        ),
        [clearState],
      );
    let identity: OAuthIdentity;
    try {
      identity = await exchangeCode(
        env,
        provider,
        config,
        {
          code: code.slice(0, 512),
          codeVerifier: stored.code_verifier,
          nonce: stored.nonce,
          nowSeconds: Math.floor(now().getTime() / 1000),
        },
        fetcher,
      );
    } catch {
      return redirect(
        signinError(env, 'not_allowed', provider, stored.return_to),
        [clearState],
      );
    }
    const stamp = now().toISOString();
    const userId = await resolveUser(env, provider, identity, stamp);
    // Rotate: the session this browser had (if any) ends, a fresh one starts.
    const previous = readCookie(request, SESSION_COOKIE);
    const token = randomToken();
    const expires = new Date(now().getTime() + SESSION_DAYS * DAY_MS);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').bind(
        stamp,
      ),
      env.DB.prepare('DELETE FROM auth_sessions WHERE id = ?').bind(
        previous ? await sha256(previous) : '',
      ),
      env.DB.prepare(
        'INSERT INTO auth_sessions (id, user_id, created_at, expires_at, provider) VALUES (?, ?, ?, ?, ?)',
      ).bind(
        await sha256(token),
        userId,
        stamp,
        expires.toISOString(),
        provider,
      ),
      env.DB.prepare(
        `DELETE FROM auth_sessions WHERE user_id = ? AND id NOT IN (
           SELECT id FROM auth_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?)`,
      ).bind(userId, userId, MAX_SESSIONS),
    ]);
    await purgeBin(env, userId);
    return redirect(stored.return_to, [
      clearState,
      cookie(env, SESSION_COOKIE, token, SESSION_DAYS * 24 * 60 * 60),
    ]);
  }

  async function route(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = request.method;

    // CSRF: every write must come from the app itself. A missing Origin is
    // refused too, so forms or scripts on other sites (or sibling
    // subdomains, which SameSite=Lax treats as same-site) cannot write.
    if (method !== 'GET' && method !== 'HEAD') {
      const origin = request.headers.get('Origin');
      if (origin !== env.APP_ORIGIN)
        throw new HttpError(403, 'forbidden_origin', 'Origin not allowed');
      if (await rateLimited(env, 'write', clientKey(request)))
        throw new HttpError(429, 'rate_limited', 'Too many requests');
    }

    if (path === '/' || path === '/health')
      return json({ ok: true, service: 'kimo-api' });

    if (path === '/v1/auth/session' && method === 'GET') {
      const user = await currentUser(request, env);
      if (!user) return json({ signedIn: false, remaining: 0, mock: false });
      const usage = await usageToday(env, user.id);
      return json({
        signedIn: true,
        remaining: Math.max(0, usage.videosLimit - usage.videosToday),
        mock: false,
      });
    }

    if (path === '/v1/auth/providers' && method === 'GET')
      return json({
        providers: authProviderSchema.options.filter(
          (provider) => providerConfig(env, provider) !== null,
        ),
      });

    const oauth = /^\/v1\/auth\/(github|google)(\/callback)?$/.exec(path);
    if (oauth && method === 'GET') {
      const provider = authProviderSchema.parse(oauth[1]);
      return oauth[2]
        ? finishOAuth(request, env, provider)
        : startOAuth(request, env, provider);
    }

    if (path === '/.well-known/security.txt' && method === 'GET')
      return new Response(SECURITY_TXT, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });

    if (path === '/v1/auth/signout' && method === 'POST') {
      const token = readCookie(request, SESSION_COOKIE);
      if (token)
        await env.DB.prepare('DELETE FROM auth_sessions WHERE id = ?')
          .bind(await sha256(token))
          .run();
      return noContent({
        'Set-Cookie': cookie(env, SESSION_COOKIE, '', 0),
      });
    }

    if (path === '/v1/me' && method === 'GET') {
      const user = await requireUser(request, env);
      return json({
        user: toUser(user),
        usage: await usageToday(env, user.id),
        storage: { bytesUsed: 0 },
        preferences: await readPreferences(env, user.id),
      });
    }

    if (path === '/v1/me/preferences' && method === 'PATCH') {
      const user = await requireUser(request, env);
      const patch = preferencesPatchSchema.parse(await readJson(request));
      const next: Preferences = {
        ...(await readPreferences(env, user.id)),
        ...patch,
      };
      await env.DB.prepare(
        `INSERT INTO preferences (user_id, data, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      )
        .bind(user.id, JSON.stringify(next), now().toISOString())
        .run();
      return json({ preferences: next });
    }

    if (path === '/v1/me/export' && method === 'GET') {
      const user = await requireUser(request, env);
      const { results } = await env.DB.prepare(
        'SELECT day, videos, render_seconds FROM daily_usage WHERE user_id = ? ORDER BY day',
      )
        .bind(user.id)
        .all<{ day: string; videos: number; render_seconds: number }>();
      const identities = await env.DB.prepare(
        'SELECT provider, email, created_at, last_used_at FROM user_identities WHERE user_id = ? ORDER BY created_at',
      )
        .bind(user.id)
        .all<{
          provider: AuthProvider;
          email: string;
          created_at: string;
          last_used_at: string;
        }>();
      const sessions = await env.DB.prepare(
        'SELECT provider, created_at, expires_at FROM auth_sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at',
      )
        .bind(user.id, now().toISOString())
        .all<{ provider: string; created_at: string; expires_at: string }>();
      const projects = await listProjects(env, user.id);
      const bin = await env.DB.prepare(
        `SELECT ${PROJECT_COLUMNS}, deleted_at FROM projects
          WHERE user_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC`,
      )
        .bind(user.id)
        .all<ProjectRow & { deleted_at: string }>();
      return json(
        {
          exportedAt: now().toISOString(),
          user: toUser(user),
          identities: identities.results.map((row) => ({
            provider: row.provider,
            email: row.email,
            linkedAt: row.created_at,
            lastUsedAt: row.last_used_at,
          })),
          sessions: sessions.results.map((row) => ({
            provider: row.provider,
            createdAt: row.created_at,
            expiresAt: row.expires_at,
          })),
          preferences: await readPreferences(env, user.id),
          projects,
          deletedProjects: bin.results.map((row) => ({
            project: toProject(row),
            deletedAt: row.deleted_at,
          })),
          usage: results.map((row) => ({
            day: row.day,
            videos: row.videos,
            renderSeconds: row.render_seconds,
          })),
        },
        200,
        {
          'Content-Disposition': 'attachment; filename="kimo-export.json"',
        },
      );
    }

    if (path === '/v1/me' && method === 'DELETE') {
      const user = await requireUser(request, env);
      await env.DB.batch(
        [
          'DELETE FROM auth_sessions WHERE user_id = ?',
          'DELETE FROM user_identities WHERE user_id = ?',
          'DELETE FROM projects WHERE user_id = ?',
          'DELETE FROM preferences WHERE user_id = ?',
          'DELETE FROM daily_usage WHERE user_id = ?',
          'DELETE FROM users WHERE id = ?',
        ].map((sql) => env.DB.prepare(sql).bind(user.id)),
      );
      return noContent({
        'Set-Cookie': cookie(env, SESSION_COOKIE, '', 0),
      });
    }

    if (path === '/v1/projects' && method === 'GET') {
      const user = await requireUser(request, env);
      return json({ projects: await listProjects(env, user.id) });
    }

    if (path === '/v1/projects' && method === 'POST') {
      const user = await requireUser(request, env);
      const body = projectCreateSchema.parse(await readJson(request));
      const stamp = now().toISOString();
      const id = crypto.randomUUID();
      if ('duplicateOf' in body) {
        const source = await getProject(env, user.id, body.duplicateOf);
        await env.DB.prepare(
          `INSERT INTO projects (id, user_id, session_id, title, prompt, status, aspect, duration_sec, poster_url, clip_count, track_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            id,
            user.id,
            crypto.randomUUID(),
            `${source.title} copy`.slice(0, 120),
            source.prompt,
            source.aspect,
            source.duration_sec,
            source.poster_url,
            source.clip_count,
            source.track_count,
            stamp,
            stamp,
          )
          .run();
      } else {
        await env.DB.prepare(
          `INSERT INTO projects (id, user_id, session_id, title, prompt, status, aspect, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
        )
          .bind(
            id,
            user.id,
            body.sessionId ?? crypto.randomUUID(),
            body.title,
            body.prompt,
            body.aspect,
            stamp,
            stamp,
          )
          .run();
      }
      return json(
        { project: toProject(await getProject(env, user.id, id)) },
        201,
      );
    }

    const restore = /^\/v1\/projects\/([^/]+)\/restore$/.exec(path);
    if (restore?.[1] && method === 'POST') {
      const user = await requireUser(request, env);
      const id = projectId(restore[1]);
      await getProject(env, user.id, id, true);
      await env.DB.prepare(
        'UPDATE projects SET deleted_at = NULL WHERE id = ? AND user_id = ?',
      )
        .bind(id, user.id)
        .run();
      return json({ project: toProject(await getProject(env, user.id, id)) });
    }

    const one = /^\/v1\/projects\/([^/]+)$/.exec(path);
    if (one?.[1]) {
      const id = projectId(one[1]);
      if (method === 'GET') {
        const user = await requireUser(request, env);
        return json({ project: toProject(await getProject(env, user.id, id)) });
      }
      if (method === 'PATCH') {
        const user = await requireUser(request, env);
        const patch = projectPatchSchema.parse(await readJson(request));
        await getProject(env, user.id, id);
        await env.DB.prepare(
          `UPDATE projects SET title = COALESCE(?, title), status = COALESCE(?, status), updated_at = ?
            WHERE id = ? AND user_id = ?`,
        )
          .bind(
            patch.title ?? null,
            patch.status ?? null,
            now().toISOString(),
            id,
            user.id,
          )
          .run();
        return json({ project: toProject(await getProject(env, user.id, id)) });
      }
      if (method === 'DELETE') {
        const user = await requireUser(request, env);
        await getProject(env, user.id, id);
        await env.DB.prepare(
          'UPDATE projects SET deleted_at = ? WHERE id = ? AND user_id = ?',
        )
          .bind(now().toISOString(), id, user.id)
          .run();
        return noContent();
      }
    }

    if (
      /^\/v1\/(sessions|uploads|renders|videos)(\/|$)/.test(path) ||
      path === '/v1/realtime'
    )
      throw new HttpError(
        501,
        'not_available',
        'Video editing is not available on this server yet',
      );

    throw new HttpError(404, 'not_found', 'No such route');
  }

  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      if (request.method === 'OPTIONS')
        return withSecurityHeaders(withCors(request, noContent(), env));
      let response: Response;
      try {
        response = await route(request, env);
      } catch (error) {
        if (error instanceof HttpError)
          response = errorResponse(error.status, error.code, error.message);
        else if (error instanceof z.ZodError)
          response = errorResponse(
            400,
            'invalid_request',
            'The request does not match the contract',
          );
        else {
          console.error(error);
          response = errorResponse(500, 'internal', 'Something went wrong');
        }
      }
      return withSecurityHeaders(withCors(request, response, env));
    },
  };
}
