import type { AuthProvider } from '@kimo/client/account';
import type { Env } from './env.ts';
import { HttpError } from './http.ts';

/**
 * Owner lockdown for kimo's own Meta key.
 *
 * Every route that spends META_API_KEY (desktop AI, SAM, explainer asset
 * generation, and the web editor's kimo-key fallback) answers only to an
 * identity on the server-side allowlist OWNER_ALLOWLIST (a Worker secret;
 * comma or newline separated). Entries:
 *   github:<login>      GitHub login, case-insensitive
 *   github-id:<id>      GitHub numeric account id (survives renames)
 *   google:<email>      Google account, verified email
 *   <email>             any provider's verified email
 * An empty or missing allowlist allows nobody (fail closed).
 *
 * The desktop app proves an identity with a short-lived HMAC-SHA256 token
 * minted by this Worker after a GitHub/Google sign-in (loopback + PKCE).
 * The signing key is the Worker secret DESKTOP_TOKEN_SECRET; nothing in the
 * installer can mint or forge one.
 */

export interface OwnerIdentity {
  provider: AuthProvider;
  providerId: string;
  /** Verified email ('' when none). */
  email: string;
  /** GitHub login (GitHub only). */
  login?: string;
}

export interface Allowlist {
  githubLogins: Set<string>;
  githubIds: Set<string>;
  googleEmails: Set<string>;
  emails: Set<string>;
  size: number;
}

export function parseAllowlist(raw: string | undefined | null): Allowlist {
  const list: Allowlist = {
    githubLogins: new Set(),
    githubIds: new Set(),
    googleEmails: new Set(),
    emails: new Set(),
    size: 0,
  };
  for (const part of String(raw ?? '').split(/[\s,;]+/)) {
    const entry = part.trim().toLowerCase();
    if (!entry) continue;
    const colon = entry.indexOf(':');
    const kind = colon > 0 ? entry.slice(0, colon) : '';
    const value = colon > 0 ? entry.slice(colon + 1) : entry;
    if (!value) continue;
    if (kind === 'github') list.githubLogins.add(value);
    else if (kind === 'github-id') list.githubIds.add(value);
    else if (kind === 'google') list.googleEmails.add(value);
    else if (!kind && value.includes('@')) list.emails.add(value);
    else continue;
    list.size++;
  }
  return list;
}

/** The allowlist subject an identity matches ("github:login", "google:email", …), or null. */
export function ownerSubject(
  list: Allowlist,
  identity: OwnerIdentity,
): string | null {
  if (!list.size) return null;
  const email = identity.email.trim().toLowerCase();
  if (identity.provider === 'github') {
    const login = (identity.login ?? '').trim().toLowerCase();
    if (login && list.githubLogins.has(login)) return `github:${login}`;
    if (identity.providerId && list.githubIds.has(identity.providerId))
      return `github-id:${identity.providerId}`;
  }
  if (identity.provider === 'google' && email && list.googleEmails.has(email))
    return `google:${email}`;
  if (email && list.emails.has(email)) return `email:${email}`;
  return null;
}

/** True when the signed-in web user has a linked identity on the allowlist. */
export async function isOwnerUser(env: Env, userId: string): Promise<boolean> {
  const list = parseAllowlist(env.OWNER_ALLOWLIST);
  if (!list.size || !userId) return false;
  const { results } = await env.DB.prepare(
    `SELECT provider, provider_id, email FROM user_identities WHERE user_id = ?
     UNION ALL SELECT provider, provider_id, email FROM users WHERE id = ?`,
  )
    .bind(userId, userId)
    .all<{ provider: string; provider_id: string; email: string }>();
  return results.some((row) =>
    Boolean(
      ownerSubject(list, {
        provider: row.provider === 'github' ? 'github' : 'google',
        providerId: row.provider_id,
        email: row.email,
      }),
    ),
  );
}

export const OWNER_ONLY_MESSAGE =
  'kimo’s built-in AI is reserved for the kimo team. Add your own AI key in settings; captions and manual editing work without one.';

/** Throws 403 owner_only unless the web user is an allowlisted owner. */
export async function assertOwnerUser(env: Env, userId: string) {
  if (!(await isOwnerUser(env, userId)))
    throw new HttpError(403, 'owner_only', OWNER_ONLY_MESSAGE);
}

// ---------------------------------------------------------------- tokens

export const DESKTOP_TOKEN_AUDIENCE = 'kimo-desktop';
/** Access tokens live 30 minutes; the app refreshes them with its refresh token. */
export const DESKTOP_TOKEN_SECONDS = 30 * 60;

export interface DesktopClaims {
  v: 1;
  aud: typeof DESKTOP_TOKEN_AUDIENCE;
  /** Allowlist subject, e.g. github:naman-sharma12345 */
  sub: string;
  /** kimo user id */
  uid: string;
  /** The identity the token was minted for (rechecked on every call). */
  idp: AuthProvider;
  pid: string;
  em: string;
  lg?: string;
  iat: number;
  exp: number;
}

function b64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
function fromB64url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function tokenSecret(env: Env): string | null {
  const secret = env.DESKTOP_TOKEN_SECRET?.trim() ?? '';
  return secret.length >= 32 ? secret : null;
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

const PREFIX = 'kd1';

/** Mints a desktop access token, or null when the signing secret is missing. */
export async function signDesktopToken(
  env: Env,
  claims: Omit<DesktopClaims, 'v' | 'aud'>,
): Promise<string | null> {
  const secret = tokenSecret(env);
  if (!secret) return null;
  const payload = b64url(
    new TextEncoder().encode(
      JSON.stringify({ v: 1, aud: DESKTOP_TOKEN_AUDIENCE, ...claims }),
    ),
  );
  const signed = `${PREFIX}.${payload}`;
  const mac = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(secret),
    new TextEncoder().encode(signed),
  );
  return `${signed}.${b64url(new Uint8Array(mac))}`;
}

/** Verifies signature, audience and expiry; null for anything else. */
export async function verifyDesktopToken(
  env: Env,
  token: string,
  nowSeconds: number,
): Promise<DesktopClaims | null> {
  const secret = tokenSecret(env);
  if (!secret || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const [prefix, payload, mac] = parts as [string, string, string];
  let ok = false;
  try {
    ok = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      fromB64url(mac),
      new TextEncoder().encode(`${prefix}.${payload}`),
    );
  } catch {
    return null;
  }
  if (!ok) return null;
  let claims: DesktopClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
  } catch {
    return null;
  }
  if (
    !claims ||
    claims.v !== 1 ||
    claims.aud !== DESKTOP_TOKEN_AUDIENCE ||
    typeof claims.exp !== 'number' ||
    typeof claims.iat !== 'number' ||
    claims.exp <= nowSeconds ||
    claims.iat > nowSeconds + 60 ||
    claims.exp - claims.iat > DESKTOP_TOKEN_SECONDS + 60 ||
    typeof claims.sub !== 'string' ||
    typeof claims.uid !== 'string'
  )
    return null;
  return claims;
}

/**
 * The owner behind a request's bearer token, rechecked against the current
 * allowlist (so removing an entry locks it out at once). Throws 401 for a
 * missing/forged/expired token and 403 for an identity not on the list.
 */
export async function requireOwnerToken(
  request: Request,
  env: Env,
  nowSeconds: number,
): Promise<DesktopClaims> {
  const header = request.headers.get('Authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match?.[1])
    throw new HttpError(
      401,
      'sign_in_required',
      'Sign in to use kimo’s built-in AI, or add your own AI key',
    );
  const claims = await verifyDesktopToken(env, match[1], nowSeconds);
  if (!claims)
    throw new HttpError(
      401,
      'token_invalid',
      'Your kimo sign-in expired; sign in again',
    );
  const subject = ownerSubject(parseAllowlist(env.OWNER_ALLOWLIST), {
    provider: claims.idp,
    providerId: claims.pid,
    email: claims.em,
    ...(claims.lg ? { login: claims.lg } : {}),
  });
  if (!subject) throw new HttpError(403, 'owner_only', OWNER_ONLY_MESSAGE);
  return claims;
}
