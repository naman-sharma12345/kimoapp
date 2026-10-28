import { z } from 'zod';
import {
  DAILY_RENDER_MINUTES_LIMIT,
  DAILY_VIDEO_LIMIT,
  authProviderSchema,
  defaultPreferences,
  preferencesPatchSchema,
  preferencesSchema,
  projectCreateSchema,
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
  withCors,
} from './http.ts';
import { authorizeUrl, exchangeCode, providerConfig } from './oauth.ts';

export const SESSION_COOKIE = 'kimo_session';
export const STATE_COOKIE = 'kimo_oauth_state';
const SESSION_DAYS = 30;
const STATE_MINUTES = 10;

export interface AppOptions {
  fetcher?: typeof fetch;
  now?: () => Date;
}

interface UserRow {
  id: string;
  provider: AuthProvider;
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
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    ...(row.avatar_url ? { avatarUrl: row.avatar_url } : {}),
    provider: row.provider,
    createdAt: row.created_at,
  };
}

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
      `SELECT u.id, u.provider, u.email, u.name, u.avatar_url, u.created_at
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
    const parsed = preferencesSchema.safeParse({
      ...defaultPreferences,
      ...(JSON.parse(row.data) as object),
    });
    return parsed.success ? parsed.data : defaultPreferences;
  }

  async function listProjects(env: Env, userId: string) {
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

  function safeReturnTo(env: Env, raw: string | null): string {
    const fallback = `${env.APP_ORIGIN}/projects`;
    if (!raw) return fallback;
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new HttpError(400, 'invalid_return', 'invalid return address');
    }
    if (url.origin !== env.APP_ORIGIN)
      throw new HttpError(400, 'invalid_return', 'invalid return address');
    return url.toString();
  }

  function signinError(env: Env, kind: 'popup_closed' | 'not_allowed') {
    return `${env.APP_ORIGIN}/signin?error=${kind}`;
  }

  async function startOAuth(
    request: Request,
    env: Env,
    provider: AuthProvider,
  ) {
    const config = providerConfig(env, provider);
    if (!config)
      throw new HttpError(
        503,
        'provider_unavailable',
        `${provider} sign-in is not configured yet`,
      );
    const returnTo = safeReturnTo(
      env,
      new URL(request.url).searchParams.get('returnTo'),
    );
    const state = randomToken(24);
    const expires = new Date(now().getTime() + STATE_MINUTES * 60_000);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM oauth_states WHERE expires_at < ?').bind(
        now().toISOString(),
      ),
      env.DB.prepare(
        'INSERT INTO oauth_states (state, provider, return_to, expires_at) VALUES (?, ?, ?, ?)',
      ).bind(state, provider, returnTo, expires.toISOString()),
    ]);
    return redirect(authorizeUrl(env, provider, config, state), [
      cookie(
        env,
        STATE_COOKIE,
        state,
        STATE_MINUTES * 60,
        `/v1/auth/${provider}/callback`,
      ),
    ]);
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
    const stored = state
      ? await env.DB.prepare(
          'SELECT return_to, provider, expires_at FROM oauth_states WHERE state = ?',
        )
          .bind(state)
          .first<{ return_to: string; provider: string; expires_at: string }>()
      : null;
    if (state)
      await env.DB.prepare('DELETE FROM oauth_states WHERE state = ?')
        .bind(state)
        .run();
    const config = providerConfig(env, provider);
    if (
      !stored ||
      stored.provider !== provider ||
      stored.expires_at < now().toISOString() ||
      readCookie(request, STATE_COOKIE) !== state ||
      !config
    )
      return redirect(signinError(env, 'popup_closed'), [clearState]);
    if (!code) {
      const denied = url.searchParams.get('error') === 'access_denied';
      return redirect(
        signinError(env, denied ? 'popup_closed' : 'not_allowed'),
        [clearState],
      );
    }
    let identity;
    try {
      identity = await exchangeCode(env, provider, config, code, fetcher);
    } catch {
      return redirect(signinError(env, 'not_allowed'), [clearState]);
    }
    const stamp = now().toISOString();
    await env.DB.prepare(
      `INSERT INTO users (id, provider, provider_id, email, name, avatar_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (provider, provider_id) DO UPDATE SET
         email = excluded.email, name = excluded.name,
         avatar_url = excluded.avatar_url, updated_at = excluded.updated_at`,
    )
      .bind(
        crypto.randomUUID(),
        provider,
        identity.providerId,
        identity.email,
        identity.name,
        identity.avatarUrl,
        stamp,
        stamp,
      )
      .run();
    const user = await env.DB.prepare(
      'SELECT id FROM users WHERE provider = ? AND provider_id = ?',
    )
      .bind(provider, identity.providerId)
      .first<{ id: string }>();
    if (!user) return redirect(signinError(env, 'not_allowed'), [clearState]);
    const token = randomToken();
    const expires = new Date(now().getTime() + SESSION_DAYS * 24 * 60 * 60_000);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').bind(
        stamp,
      ),
      env.DB.prepare(
        'INSERT INTO auth_sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
      ).bind(await sha256(token), user.id, stamp, expires.toISOString()),
    ]);
    return redirect(stored.return_to, [
      clearState,
      cookie(env, SESSION_COOKIE, token, SESSION_DAYS * 24 * 60 * 60),
    ]);
  }

  async function route(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = request.method;

    // Browser writes must come from the app itself.
    if (method !== 'GET' && method !== 'HEAD') {
      const origin = request.headers.get('Origin');
      if (origin && origin !== env.APP_ORIGIN)
        throw new HttpError(403, 'forbidden_origin', 'Origin not allowed');
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
      return json(
        {
          exportedAt: now().toISOString(),
          user: toUser(user),
          preferences: await readPreferences(env, user.id),
          projects: await listProjects(env, user.id),
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
      const id = decodeURIComponent(restore[1]);
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
      const id = decodeURIComponent(one[1]);
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
        return withCors(request, noContent(), env);
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
      return withCors(request, response, env);
    },
  };
}
