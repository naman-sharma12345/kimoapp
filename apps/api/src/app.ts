import { z } from 'zod';
import {
  DAILY_AI_EDIT_LIMIT,
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
  createEditing,
  meteredConfig,
  roomBroadcast,
  sessionIdFrom,
  type Broadcast,
} from './editing.ts';
import { aiConfig, chatJson } from './ai.ts';
import { BUILD_PROMPT, REVIEW_PROMPT } from './engine.ts';
import { assertBudget, recordUsage } from './ai-budget.ts';
import {
  samDelete,
  samDeleteSchema,
  samSchema,
  samSegment,
  samUpload,
} from './sam.ts';
import {
  AI_HEADERS,
  listModels,
  redact,
  userAiConfig,
} from './ai-providers.ts';
import {
  DESKTOP_TOKEN_SECONDS,
  OWNER_ONLY_MESSAGE,
  ownerSubject,
  parseAllowlist,
  requireOwnerToken,
  signDesktopToken,
  type OwnerIdentity,
} from './owner.ts';
import {
  EXPLAIN_PROMPT,
  PICK_PROMPT,
  DESCRIBE_PROMPT,
} from './desktop-prompts.ts';
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
const desktopAiSchema = z
  .object({
    kind: z.enum(['build', 'review', 'explain', 'pick', 'describe']),
    text: z.string().max(60_000),
    images: z
      .array(
        z.object({
          label: z.string().max(80),
          url: z
            .string()
            .max(400_000)
            .regex(/^data:image\/(jpeg|png);base64,/),
        }),
      )
      .max(12)
      .default([]),
  })
  .refine(
    (body) =>
      body.kind === 'pick' ||
      body.kind === 'describe' ||
      body.images.length <= 4,
    { message: 'at most 4 images', path: ['images'] },
  );
const desktopTokenSchema = z.object({
  code: z.string().min(16).max(128),
  verifier: z.string().min(43).max(128),
});
const desktopRefreshSchema = z.object({
  refresh_token: z.string().min(16).max(256),
});
const desktopImageSchema = z.object({
  prompt: z.string().min(3).max(600),
  style: z.string().max(120).default('clean flat editorial illustration'),
});
/** Desktop sign-in codes and refresh tokens live this long. */
const DESKTOP_CODE_SECONDS = 120;
const DESKTOP_REFRESH_DAYS = 30;

const RATE_WINDOW_MS = 10 * 60_000;
const RATE_LIMITS = {
  auth: 30,
  write: 300,
  ai: 20,
  models: 30,
  desktop: 80,
  sam: 60,
  desktop_byok: 120,
  desktop_image: 6,
} as const;

export type SignInErrorKind =
  'cancelled' | 'expired' | 'not_allowed' | 'unavailable' | 'rate_limited';

export interface AppOptions {
  fetcher?: typeof fetch;
  now?: () => Date;
  broadcast?: Broadcast;
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
  const editing = createEditing({
    now,
    fetcher,
    broadcast: options.broadcast ?? roomBroadcast,
  });

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
      'SELECT videos, render_seconds, ai_edits FROM daily_usage WHERE user_id = ? AND day = ?',
    )
      .bind(userId, day())
      .first<{ videos: number; render_seconds: number; ai_edits: number }>();
    return {
      videosToday: row?.videos ?? 0,
      videosLimit: DAILY_VIDEO_LIMIT,
      renderMinutes: Math.round(((row?.render_seconds ?? 0) / 60) * 10) / 10,
      renderMinutesLimit: DAILY_RENDER_MINUTES_LIMIT,
      aiEditsToday: row?.ai_edits ?? 0,
      aiEditsLimit: DAILY_AI_EDIT_LIMIT,
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
    await env.DB.prepare(
      `DELETE FROM edit_sessions WHERE user_id = ?
         AND project_id NOT IN (SELECT id FROM projects WHERE user_id = ?)`,
    )
      .bind(userId, userId)
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
    desktopReturn?: string,
  ) {
    const returnTo =
      desktopReturn ??
      safeReturnTo(env, new URL(request.url).searchParams.get('returnTo'));
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
    const desktop = parseDesktopReturn(stored?.return_to);
    const fail = (kind: SignInErrorKind, returnTo?: string) =>
      desktop
        ? redirect(loopbackUrl(desktop, { error: kind }), [clearState])
        : redirect(signinError(env, kind, provider, returnTo), [clearState]);
    const config = providerConfig(env, provider);
    if (!config) return fail('unavailable');
    const denied = url.searchParams.get('error');
    if (
      !stored ||
      stored.provider !== provider ||
      stored.expires_at < now().toISOString() ||
      readCookie(request, STATE_COOKIE) !== state
    )
      return fail(
        denied === 'access_denied' ? 'cancelled' : 'expired',
        desktop ? undefined : stored?.return_to,
      );
    if (!code || denied)
      return fail(
        denied === 'access_denied' ? 'cancelled' : 'not_allowed',
        desktop ? undefined : stored.return_to,
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
      return fail('not_allowed', desktop ? undefined : stored.return_to);
    }
    const stamp = now().toISOString();
    if (desktop)
      return finishDesktopSignIn(env, provider, identity, desktop, clearState);
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

  // ------------------------------------------------------------ desktop sign-in
  // The desktop app signs in through the system browser: it opens
  // /v1/desktop/auth/start with a PKCE challenge and a loopback port, the
  // normal GitHub/Google OAuth runs here, and the callback hands a one-time
  // code back to http://127.0.0.1:<port>/callback. The app redeems it with
  // its PKCE verifier for a 30-minute signed access token plus a rotating
  // refresh token. Only allowlisted owners get either; nobody else's
  // sign-in leaves a row behind.

  interface DesktopReturn {
    port: number;
    state: string;
    challenge: string;
  }
  const B64URL = /^[A-Za-z0-9_-]+$/;
  function parseDesktopReturn(raw: string | undefined): DesktopReturn | null {
    const m =
      /^desktop:(\d{4,5}):([A-Za-z0-9_-]{8,128}):([A-Za-z0-9_-]{43})$/.exec(
        raw ?? '',
      );
    if (!m) return null;
    const port = Number(m[1]);
    if (port < 1024 || port > 65535) return null;
    return { port, state: m[2] as string, challenge: m[3] as string };
  }
  function loopbackUrl(target: DesktopReturn, params: Record<string, string>) {
    const url = new URL(`http://127.0.0.1:${target.port}/callback`);
    url.searchParams.set('state', target.state);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return url.toString();
  }

  async function startDesktopSignIn(request: Request, env: Env) {
    const q = new URL(request.url).searchParams;
    const provider = authProviderSchema.safeParse(q.get('provider'));
    const port = Number(q.get('port'));
    const state = q.get('state') ?? '';
    const challenge = q.get('challenge') ?? '';
    if (
      !provider.success ||
      !Number.isInteger(port) ||
      port < 1024 ||
      port > 65535 ||
      !B64URL.test(state) ||
      state.length < 8 ||
      state.length > 128 ||
      !B64URL.test(challenge) ||
      challenge.length !== 43
    )
      throw new HttpError(
        400,
        'invalid_request',
        'Bad desktop sign-in request',
      );
    return startOAuth(
      request,
      env,
      provider.data,
      `desktop:${port}:${state}:${challenge}`,
    );
  }

  async function finishDesktopSignIn(
    env: Env,
    provider: AuthProvider,
    identity: OAuthIdentity,
    target: DesktopReturn,
    clearState: string,
  ) {
    const owner: OwnerIdentity = {
      provider,
      providerId: identity.providerId,
      email: identity.email,
      ...(identity.login ? { login: identity.login } : {}),
    };
    const subject = ownerSubject(parseAllowlist(env.OWNER_ALLOWLIST), owner);
    // Not an owner: no account row, no code; the app shows the BYOK path.
    if (!subject)
      return redirect(loopbackUrl(target, { error: 'not_allowed' }), [
        clearState,
      ]);
    const stamp = now().toISOString();
    const userId = await resolveUser(env, provider, identity, stamp);
    const code = randomToken(32);
    await env.DB.prepare(
      'INSERT INTO oauth_states (state, provider, return_to, expires_at, code_verifier, nonce) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(
        `dc_${await sha256(code)}`.slice(0, 64),
        'desktop-code',
        JSON.stringify({ ...owner, uid: userId, sub: subject }),
        new Date(now().getTime() + DESKTOP_CODE_SECONDS * 1000).toISOString(),
        target.challenge,
        '',
      )
      .run();
    return redirect(loopbackUrl(target, { code }), [clearState]);
  }

  async function issueDesktopTokens(
    env: Env,
    owner: OwnerIdentity & { uid: string; sub: string },
  ) {
    const iat = Math.floor(now().getTime() / 1000);
    const access = await signDesktopToken(env, {
      sub: owner.sub,
      uid: owner.uid,
      idp: owner.provider,
      pid: owner.providerId,
      em: owner.email,
      ...(owner.login ? { lg: owner.login } : {}),
      iat,
      exp: iat + DESKTOP_TOKEN_SECONDS,
    });
    if (!access)
      throw new HttpError(
        503,
        'auth_unavailable',
        'Desktop sign-in is not set up',
      );
    const refresh = `kdr_${randomToken(32)}`;
    await env.DB.prepare(
      'INSERT INTO auth_sessions (id, user_id, created_at, expires_at, provider) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(
        await sha256(`desktop-refresh:${refresh}`),
        owner.uid,
        now().toISOString(),
        new Date(now().getTime() + DESKTOP_REFRESH_DAYS * DAY_MS).toISOString(),
        `desktop:${JSON.stringify({ provider: owner.provider, providerId: owner.providerId, email: owner.email, login: owner.login ?? '', sub: owner.sub })}`,
      )
      .run();
    return json({
      access_token: access,
      token_type: 'Bearer',
      expires_in: DESKTOP_TOKEN_SECONDS,
      refresh_token: refresh,
      subject: owner.sub,
    });
  }

  async function desktopToken(request: Request, env: Env) {
    if (await rateLimited(env, 'auth', clientKey(request)))
      throw new HttpError(429, 'rate_limited', 'Too many sign-in attempts');
    const body = desktopTokenSchema.parse(await readJson(request, 4_000));
    const key = `dc_${await sha256(body.code)}`.slice(0, 64);
    const row = await env.DB.prepare(
      "SELECT return_to, expires_at, code_verifier FROM oauth_states WHERE state = ? AND provider = 'desktop-code'",
    )
      .bind(key)
      .first<{
        return_to: string;
        expires_at: string;
        code_verifier: string;
      }>();
    // single use, whatever happens next
    if (row)
      await env.DB.prepare('DELETE FROM oauth_states WHERE state = ?')
        .bind(key)
        .run();
    if (
      !row ||
      row.expires_at < now().toISOString() ||
      (await pkceChallenge(body.verifier)) !== row.code_verifier
    )
      throw new HttpError(
        401,
        'token_invalid',
        'That sign-in code is not valid',
      );
    const owner = JSON.parse(row.return_to) as OwnerIdentity & {
      uid: string;
      sub: string;
    };
    // recheck: the allowlist may have changed since the browser step
    const subject = ownerSubject(parseAllowlist(env.OWNER_ALLOWLIST), owner);
    if (!subject) throw new HttpError(403, 'owner_only', OWNER_ONLY_MESSAGE);
    return issueDesktopTokens(env, { ...owner, sub: subject });
  }

  async function desktopRefresh(request: Request, env: Env, revoke = false) {
    if (await rateLimited(env, 'auth', clientKey(request)))
      throw new HttpError(429, 'rate_limited', 'Too many sign-in attempts');
    const body = desktopRefreshSchema.parse(await readJson(request, 4_000));
    const id = await sha256(`desktop-refresh:${body.refresh_token}`);
    const row = await env.DB.prepare(
      "SELECT user_id, expires_at, provider FROM auth_sessions WHERE id = ? AND provider LIKE 'desktop:%'",
    )
      .bind(id)
      .first<{ user_id: string; expires_at: string; provider: string }>();
    // rotation: a refresh token works once
    if (row)
      await env.DB.prepare('DELETE FROM auth_sessions WHERE id = ?')
        .bind(id)
        .run();
    if (revoke) return noContent();
    if (!row || row.expires_at < now().toISOString())
      throw new HttpError(
        401,
        'token_invalid',
        'Your kimo sign-in expired; sign in again',
      );
    let stored: OwnerIdentity & { sub?: string };
    try {
      stored = JSON.parse(row.provider.slice('desktop:'.length));
    } catch {
      throw new HttpError(
        401,
        'token_invalid',
        'Your kimo sign-in expired; sign in again',
      );
    }
    const owner: OwnerIdentity = {
      provider: stored.provider === 'github' ? 'github' : 'google',
      providerId: String(stored.providerId ?? ''),
      email: String(stored.email ?? ''),
      ...(stored.login ? { login: String(stored.login) } : {}),
    };
    const subject = ownerSubject(parseAllowlist(env.OWNER_ALLOWLIST), owner);
    if (!subject) throw new HttpError(403, 'owner_only', OWNER_ONLY_MESSAGE);
    return issueDesktopTokens(env, {
      ...owner,
      uid: row.user_id,
      sub: subject,
    });
  }

  /**
   * Who pays for one desktop AI/SAM/image call: the user's own key from the
   * X-AI-* headers (passed through for this call only, never kimo's key),
   * or, with no key, kimo's Meta key for an allowlisted owner's signed
   * token. Anything else is 401/403 before any upstream call.
   */
  async function desktopPayer(
    request: Request,
    env: Env,
    bucket: 'desktop' | 'sam' | 'desktop_image',
  ): Promise<{ owner: string | null; byok: ReturnType<typeof userAiConfig> }> {
    const byok = userAiConfig(request.headers);
    if (byok) {
      if (await rateLimited(env, 'desktop_byok', clientKey(request)))
        throw new HttpError(
          429,
          'rate_limited',
          'Too many AI steps; wait a few minutes',
        );
      return { owner: null, byok };
    }
    const claims = await requireOwnerToken(
      request,
      env,
      Math.floor(now().getTime() / 1000),
    );
    if (await rateLimited(env, bucket, `owner:${claims.sub}`))
      throw new HttpError(
        429,
        'rate_limited',
        'Too many AI steps; wait a few minutes',
      );
    return { owner: claims.sub, byok: null };
  }

  /**
   * AI proxy for the kimo desktop app (apps/desktop). The app runs kimo-mcp,
   * FFmpeg and whisper on the user's PC; only the edit prompt and sampled
   * frames reach this route, never the media. The system prompts live here
   * so the route only answers kimo edit and render-check requests, the Meta
   * key never ships in the app, and the shared AI budget still applies.
   */
  async function desktopAi(request: Request, env: Env): Promise<Response> {
    const payer = await desktopPayer(request, env, 'desktop');
    const body = desktopAiSchema.parse(await readJson(request, 6_000_000));
    let config;
    if (payer.byok) config = payer.byok;
    else {
      const base = aiConfig(env);
      if (!base)
        throw new HttpError(
          503,
          'ai_unavailable',
          "AI editing isn't switched on yet",
        );
      await assertBudget(env);
      config = meteredConfig(env, base);
    }
    const visual = body.kind !== 'build' && body.kind !== 'explain';
    const review = visual;
    const lead =
      body.kind === 'review'
        ? REVIEW_PROMPT
        : body.kind === 'pick'
          ? PICK_PROMPT
          : DESCRIBE_PROMPT;
    const content: string | Record<string, unknown>[] = review
      ? [
          { type: 'text', text: `${lead}\n${body.text}` },
          ...body.images.flatMap((image) => [
            { type: 'text', text: image.label },
            { type: 'image_url', image_url: { url: image.url } },
          ]),
        ]
      : body.text;
    const answer = await chatJson(
      review && config.source === 'kimo'
        ? {
            ...config,
            model: (env.META_MEDIA_MODEL ?? '').trim() || config.model,
          }
        : config,
      fetcher,
      body.kind === 'review'
        ? 'you are kimo, a world-class video editor checking your own render.'
        : body.kind === 'explain'
          ? EXPLAIN_PROMPT
          : body.kind === 'build'
            ? BUILD_PROMPT
            : 'you are kimo, a world-class video editor choosing on-screen visuals.',
      content,
      review ? 4_000 : 6_000,
    ).catch((error: unknown) => {
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        502,
        'ai_upstream',
        'kimo AI could not answer; try again',
      );
    });
    return json({ record: answer.record });
  }

  /**
   * SAM 3.1 for the desktop app: /v1/desktop/sam/file uploads a downscaled
   * clip segment, /v1/desktop/sam streams one segmentation back, and
   * /v1/desktop/sam/file/delete removes the upload. Same key, rate limit
   * family and shared AI budget as /v1/desktop/ai.
   */
  async function desktopSam(
    request: Request,
    env: Env,
    path: string,
  ): Promise<Response> {
    const payer = await desktopPayer(request, env, 'sam');
    if (payer.byok && payer.byok.provider !== 'meta')
      throw new HttpError(
        400,
        'sam_needs_meta_key',
        'Subject tracking needs a Meta AI key',
      );
    const base = payer.byok ?? aiConfig(env);
    if (!base)
      throw new HttpError(
        503,
        'ai_unavailable',
        "AI editing isn't switched on yet",
      );
    if (path === '/v1/desktop/sam/file/delete') {
      const body = samDeleteSchema.parse(await request.json());
      return json(await samDelete(base, fetcher, body.file_id));
    }
    if (!payer.byok) await assertBudget(env);
    if (path === '/v1/desktop/sam/file')
      return json(await samUpload(request, base, fetcher));
    if (path !== '/v1/desktop/sam')
      throw new HttpError(404, 'not_found', 'Not found');
    const body = samSchema.parse(await request.json());
    return samSegment(env, base, fetcher, body);
  }

  /**
   * Opt-in explainer illustration (Phase 7, off by default): one image from
   * the configured image model. Owners only on kimo's key (budgeted), or the
   * user's own OpenAI-compatible key. 501 until META_IMAGE_MODEL is set.
   */
  async function desktopImage(request: Request, env: Env): Promise<Response> {
    const payer = await desktopPayer(request, env, 'desktop_image');
    const body = desktopImageSchema.parse(await readJson(request, 8_000));
    let config;
    if (payer.byok) {
      if (payer.byok.wire !== 'openai')
        throw new HttpError(
          400,
          'image_unsupported',
          'Use an OpenAI-compatible key for images',
        );
      config = payer.byok;
    } else {
      const base = aiConfig(env);
      const model = (env.META_IMAGE_MODEL ?? '').trim();
      if (!base || !model)
        throw new HttpError(
          501,
          'image_unavailable',
          'AI images are not switched on',
        );
      await assertBudget(env);
      config = { ...base, model };
    }
    let response: Response;
    try {
      response = await fetcher(`${config.baseUrl}/images/generations`, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.key}`,
        },
        body: JSON.stringify({
          model: config.model,
          prompt: `${body.prompt.replace(/[\p{Cc}\p{Cf}]/gu, ' ')}. Style: ${body.style}. No text, no logos, no real people.`,
          n: 1,
          size: '1024x1024',
          response_format: 'b64_json',
        }),
        signal: AbortSignal.timeout(90_000),
      });
    } catch {
      throw new HttpError(502, 'ai_upstream', 'The image model did not answer');
    }
    if (response.status === 401 || response.status === 403)
      throw new HttpError(
        400,
        'ai_key_rejected',
        'The provider refused that key',
      );
    if (!response.ok)
      throw new HttpError(502, 'ai_upstream', 'The image model did not answer');
    const data = (await response.json().catch(() => ({}))) as {
      data?: { b64_json?: unknown }[];
    };
    const b64 = data.data?.[0]?.b64_json;
    if (typeof b64 !== 'string' || b64.length > 8_000_000)
      throw new HttpError(502, 'ai_upstream', 'The image model did not answer');
    if (!payer.byok)
      await recordUsage(env, 'image-generation', { prompt: 1, completion: 0 });
    return json({ image: `data:image/png;base64,${b64}` });
  }

  async function route(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = request.method;

    if (path === '/v1/desktop/auth/start' && method === 'GET')
      return startDesktopSignIn(request, env);
    if (path === '/v1/desktop/auth/token' && method === 'POST')
      return desktopToken(request, env);
    if (path === '/v1/desktop/auth/refresh' && method === 'POST')
      return desktopRefresh(request, env);
    if (path === '/v1/desktop/auth/signout' && method === 'POST')
      return desktopRefresh(request, env, true);
    if (path === '/v1/desktop/auth/me' && method === 'GET') {
      const claims = await requireOwnerToken(
        request,
        env,
        Math.floor(now().getTime() / 1000),
      );
      return json({ owner: true, subject: claims.sub, expires_at: claims.exp });
    }
    if (path === '/v1/desktop/image' && method === 'POST')
      return desktopImage(request, env);
    if (path === '/v1/desktop/ai' && method === 'POST')
      return desktopAi(request, env);
    if (path.startsWith('/v1/desktop/sam') && method === 'POST')
      return desktopSam(request, env, path);

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
          'DELETE FROM asset_analysis WHERE user_id = ?',
          'DELETE FROM session_mutations WHERE session_id IN (SELECT id FROM edit_sessions WHERE user_id = ?)',
          'DELETE FROM edit_sessions WHERE user_id = ?',
          'DELETE FROM assets WHERE user_id = ?',
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
        const timeline = await env.DB.prepare(
          'SELECT project_json, asset_ids, version FROM edit_sessions WHERE id = ? AND user_id = ?',
        )
          .bind(source.session_id, user.id)
          .first<{
            project_json: string;
            asset_ids: string;
            version: number;
          }>();
        const copy = await env.DB.prepare(
          'SELECT session_id FROM projects WHERE id = ? AND user_id = ?',
        )
          .bind(id, user.id)
          .first<{ session_id: string }>();
        if (timeline && copy)
          await env.DB.prepare(
            `INSERT OR IGNORE INTO edit_sessions (id, user_id, project_id, status, version, project_json, asset_ids, created_at, updated_at)
             VALUES (?, ?, ?, 'editing', ?, ?, ?, ?, ?)`,
          )
            .bind(
              copy.session_id,
              user.id,
              id,
              timeline.version,
              JSON.stringify({
                ...(JSON.parse(timeline.project_json) as object),
                id: copy.session_id,
              }),
              timeline.asset_ids,
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

    // The user's own provider key lists that provider's models. The key is
    // read from the header, used for this one call and never kept.
    if (path === '/v1/ai/models' && method === 'GET') {
      if (request.headers.get('Origin') !== env.APP_ORIGIN)
        throw new HttpError(403, 'forbidden_origin', 'Origin not allowed');
      const config = userAiConfig(request.headers, { requireModel: false });
      if (!config)
        throw new HttpError(
          400,
          'ai_key_missing',
          'Add your API key to list models',
        );
      const user = await requireUser(request, env);
      if (await rateLimited(env, 'models', user.id))
        throw new HttpError(429, 'rate_limited', 'Too many requests');
      return json({ models: await listModels(config, fetcher) });
    }

    if (path === '/v1/ai/status' && method === 'GET') {
      const config = aiConfig(env);
      return json(
        config
          ? { available: true, model: config.model }
          : { available: false },
      );
    }

    const socket = /^\/v1\/sessions\/([^/]+)\/ws$/.exec(path);
    if (socket?.[1] && method === 'GET') {
      // Browsers always send Origin on WebSocket handshakes; refuse others.
      if (request.headers.get('Origin') !== env.APP_ORIGIN)
        throw new HttpError(403, 'forbidden_origin', 'Origin not allowed');
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
        throw new HttpError(426, 'upgrade_required', 'Expected a WebSocket');
      const user = await requireUser(request, env);
      const sessionId = sessionIdFrom(socket[1]);
      const row = await editing.loadSession(env, user.id, sessionId);
      if (!env.ROOMS)
        throw new HttpError(503, 'realtime_unavailable', 'Realtime is off');
      const headers = new Headers(request.headers);
      headers.set('X-Kimo-User', user.id);
      headers.set('X-Kimo-Session', sessionId);
      headers.set('X-Kimo-Version', String(row.version));
      return env.ROOMS.get(env.ROOMS.idFromName(sessionId)).fetch(
        new Request('https://room/connect', { headers }),
      );
    }

    if (/^\/v1\/(sessions|uploads)(\/|$)/.test(path)) {
      const user = await requireUser(request, env);
      if (
        /^\/v1\/sessions\/[^/]+\/(messages|perceive|review)$/.test(path) &&
        method === 'POST' &&
        (await rateLimited(env, 'ai', user.id))
      )
        throw new HttpError(429, 'rate_limited', 'Too many AI edits at once');
      const handled = await editing.route(request, env, user.id, path, method);
      if (handled) return handled;
    }

    // Finished videos are never stored: exports download in the browser.
    if (/^\/v1\/(renders|videos)(\/|$)/.test(path))
      throw new HttpError(
        410,
        'not_stored',
        'kimo does not store videos; export downloads in your browser',
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
        // A WebSocket handshake answer is passed through untouched.
        if (response.status === 101) return response;
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
          // Log without any user-supplied AI key, whatever the error holds.
          const text =
            error instanceof Error
              ? `${error.name}: ${error.message}\n${error.stack ?? ''}`
              : String(error);
          console.error(redact(text, request.headers.get(AI_HEADERS.key)));
          response = errorResponse(500, 'internal', 'Something went wrong');
        }
      }
      return withSecurityHeaders(withCors(request, response, env));
    },
  };
}
