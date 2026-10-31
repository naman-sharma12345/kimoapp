// Who pays for kimo's AI calls (Phase 7 key lockdown).
//
// kimo's own Meta key lives only on the kimo-api Worker and answers only
// allowlisted kimo owners. The app holds no shared secret: an owner signs in
// through the system browser (GitHub/Google OAuth on the Worker, loopback
// redirect to 127.0.0.1 + PKCE), and the Worker mints a 30-minute signed
// token plus a rotating refresh token. Everyone else brings their own key
// (BYOK): it is held in this process's memory only, never written to disk,
// and sent with each call as X-AI-* headers to the Worker's passthrough,
// which never falls back to kimo's key. With neither, AI steps throw
// AiLockedError (a clear message in the UI), while offline captions and all
// non-AI editing keep working.
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';

export const API_BASE = (process.env.KIMO_API_BASE || (process.env.KIMO_AI_URL ? process.env.KIMO_AI_URL.replace(/\/v1\/desktop\/ai$/, '') : 'https://api.getkimo.tech')).replace(/\/+$/, '');
export const BYOK_PROVIDERS = ['meta', 'openai', 'anthropic', 'gemini', 'groq', 'openrouter', 'custom'];
export const LOCKED_MESSAGE =
  "kimo's built-in AI is reserved for the kimo team. Add your own AI key in Settings (kept in memory only, never saved) to use AI edits; captions, manual edits and exports work without one.";

export class AiLockedError extends Error {
  constructor(message = LOCKED_MESSAGE, code = 'ai_locked') {
    super(message);
    this.code = code;
  }
}
export const isLockedError = (e) => e instanceof AiLockedError || ['ai_locked', 'owner_only', 'sign_in_required', 'token_invalid'].includes(e?.code);

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const pkceChallenge = (verifier) => b64url(createHash('sha256').update(verifier).digest());

const state = {
  /** {access, exp (ms), refresh, subject} — access in memory only */
  session: null,
  /** {provider, key, model, baseUrl} — memory only, never persisted */
  byok: null,
  /** optional persistence for the refresh token (main.cjs wires Electron safeStorage) */
  store: null,
  fetch: (...a) => fetch(...a),
  now: () => Date.now(),
};

/** Test/main hooks: {store: {load(), save(text), clear()}, fetch, now}. */
export function configureAuth({ store, fetch: f, now } = {}) {
  if (store !== undefined) state.store = store;
  if (f) state.fetch = f;
  if (now) state.now = now;
  if (state.store && !state.session) {
    try {
      const saved = state.store.load?.();
      const parsed = saved ? JSON.parse(saved) : null;
      if (parsed?.refresh && typeof parsed.refresh === 'string') state.session = { access: null, exp: 0, refresh: parsed.refresh, subject: parsed.subject ?? null };
    } catch {
      /* unreadable store: signed out */
    }
  }
}

/** Sets the user's own key for this run of the app (memory only). */
export function setByok(input) {
  if (!input || !input.key) {
    state.byok = null;
    return accessStatus();
  }
  const provider = String(input.provider ?? 'openai').toLowerCase();
  if (!BYOK_PROVIDERS.includes(provider)) throw new Error('pick a supported AI provider');
  const key = String(input.key).trim();
  if (!/^[\x21-\x7e]{8,512}$/.test(key)) throw new Error('that API key does not look right');
  const model = String(input.model ?? '').trim();
  if (!model) throw new Error('pick a model for your key');
  state.byok = { provider, key, model, baseUrl: provider === 'custom' ? String(input.baseUrl ?? '').trim() : '' };
  return accessStatus();
}
export const clearByok = () => setByok(null);

/** What the UI shows; never includes the key itself. */
export function accessStatus() {
  return {
    owner: Boolean(state.session?.refresh || state.session?.access),
    subject: state.session?.subject ?? null,
    byok: state.byok ? { provider: state.byok.provider, model: state.byok.model, last4: state.byok.key.slice(-4) } : null,
    ai: Boolean(state.byok || state.session),
  };
}

function persist() {
  try {
    if (state.session?.refresh) state.store?.save?.(JSON.stringify({ refresh: state.session.refresh, subject: state.session.subject }));
    else state.store?.clear?.();
  } catch {
    /* best effort */
  }
}

async function readError(r) {
  const body = await r.json().catch(() => ({}));
  return { code: body?.code ?? body?.error?.code ?? '', message: body?.message ?? body?.error?.message ?? `kimo answered ${r.status}` };
}

function takeTokens(body) {
  state.session = { access: body.access_token, exp: state.now() + Math.max(60, Number(body.expires_in) || 1800) * 1000, refresh: body.refresh_token, subject: body.subject ?? null };
  persist();
  return accessStatus();
}

async function refresh() {
  const token = state.session?.refresh;
  if (!token) return false;
  const r = await state.fetch(`${API_BASE}/v1/desktop/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: token }) });
  if (!r.ok) {
    const e = await readError(r);
    // a refused refresh ends the session; a network/server error keeps it for a retry
    if (r.status === 401 || r.status === 403) {
      state.session = null;
      persist();
    }
    if (r.status === 403) throw new AiLockedError(e.message, 'owner_only');
    return false;
  }
  takeTokens(await r.json());
  return true;
}

/**
 * Headers for one AI/SAM/image call: the user's own key when set, else the
 * owner's bearer token (refreshed when it is about to expire). Throws
 * AiLockedError when there is neither.
 */
export async function aiHeaders() {
  if (state.byok) {
    const h = { 'X-AI-Key': state.byok.key, 'X-AI-Provider': state.byok.provider, 'X-AI-Model': state.byok.model };
    if (state.byok.baseUrl) h['X-AI-Base-URL'] = state.byok.baseUrl;
    return h;
  }
  if (state.session) {
    if (!state.session.access || state.session.exp - state.now() < 60_000) await refresh();
    if (state.session?.access) return { Authorization: `Bearer ${state.session.access}` };
  }
  // CI / bench runs: an owner access token minted by the Worker, passed at run time (never bundled)
  const envToken = envOwnerToken();
  if (envToken) return { Authorization: `Bearer ${envToken}` };
  throw new AiLockedError();
}
const envOwnerToken = () => (/^kd1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(process.env.KIMO_DESKTOP_TOKEN ?? '') ? process.env.KIMO_DESKTOP_TOKEN : null);
/** True when an AI call could be made right now (owner session, BYOK or a run-time owner token). */
export const hasAiAccess = () => Boolean(state.byok || state.session || envOwnerToken());
/** Which key a call uses: 'byok' | 'owner' | null. */
export const payer = () => (state.byok ? 'byok' : state.session || envOwnerToken() ? 'owner' : null);

/** Turns a refused proxy answer into a clear error (locked → AiLockedError). */
export async function proxyError(r, what = 'kimo AI') {
  const e = await readError(r);
  if (r.status === 401 && state.session && !state.byok) {
    state.session = null;
    persist();
  }
  if (r.status === 401 || r.status === 403) return new AiLockedError(e.code === 'owner_only' || e.code === 'sign_in_required' ? LOCKED_MESSAGE : e.message, e.code || 'ai_locked');
  const err = new Error(e.message || `${what} answered ${r.status}`);
  err.code = e.code;
  err.status = r.status;
  return err;
}

/**
 * Owner sign-in through the system browser. openExternal(url) opens the
 * default browser; resolves with accessStatus() or rejects with a clear
 * error (cancelled, not allowed, timed out).
 */
export async function signIn(provider = 'github', { openExternal, timeoutMs = 5 * 60_000 } = {}) {
  if (!['github', 'google'].includes(provider)) throw new Error('sign in with GitHub or Google');
  if (typeof openExternal !== 'function') throw new Error('no browser to sign in with');
  const verifier = b64url(randomBytes(48));
  const appState = b64url(randomBytes(16));
  let finish;
  const result = new Promise((resolve, reject) => (finish = { resolve, reject }));
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== '/callback') {
      res.writeHead(404).end();
      return;
    }
    const ok = url.searchParams.get('state') === appState && url.searchParams.get('code');
    const error = url.searchParams.get('error');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(`<!doctype html><meta charset="utf-8"><title>kimo</title><body style="font:16px system-ui;background:#141210;color:#f4efe6;display:grid;place-items:center;height:100vh;margin:0"><p>${ok ? 'Signed in to kimo. You can close this tab.' : error === 'not_allowed' ? "This account can't use kimo's built-in AI. Add your own AI key in kimo's Settings instead." : 'Sign-in did not finish. Go back to kimo and try again.'}</p>`);
    if (url.searchParams.get('state') !== appState) return finish.reject(new Error('sign-in answered for another request; try again'));
    if (error) return finish.reject(error === 'not_allowed' ? new AiLockedError() : new Error(error === 'cancelled' ? 'sign-in cancelled' : `sign-in failed (${error})`));
    finish.resolve(url.searchParams.get('code'));
  });
  await new Promise((r, j) => server.listen(0, '127.0.0.1', r).once('error', j));
  const port = server.address().port;
  const timer = setTimeout(() => finish.reject(new Error('sign-in timed out')), timeoutMs);
  try {
    const q = new URLSearchParams({ provider, port: String(port), state: appState, challenge: pkceChallenge(verifier) });
    await openExternal(`${API_BASE}/v1/desktop/auth/start?${q}`);
    const code = await result;
    const r = await state.fetch(`${API_BASE}/v1/desktop/auth/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, verifier }) });
    if (!r.ok) throw await proxyError(r, 'kimo sign-in');
    return takeTokens(await r.json());
  } finally {
    clearTimeout(timer);
    server.close();
  }
}

export async function signOut() {
  const token = state.session?.refresh;
  state.session = null;
  persist();
  if (token) await state.fetch(`${API_BASE}/v1/desktop/auth/signout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: token }) }).catch(() => undefined);
  return accessStatus();
}

/** Test helper: forget everything in memory. */
export function _resetAuth() {
  state.session = null;
  state.byok = null;
  state.store = null;
  state.fetch = (...a) => fetch(...a);
  state.now = () => Date.now();
}
