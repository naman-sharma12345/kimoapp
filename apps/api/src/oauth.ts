import { z } from 'zod';
import type { AuthProvider } from '@kimo/client/account';
import type { Env } from './env.ts';
import { HttpError } from './http.ts';

/**
 * The only profile data kimo keeps from a sign-in provider: a stable id,
 * a verified email (or ''), a display name and an https avatar url.
 */
export interface OAuthIdentity {
  providerId: string;
  /** Lowercased and verified by the provider, or '' when none is verified. */
  email: string;
  name: string;
  avatarUrl: string | null;
}

interface ProviderConfig {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  scope: string;
}

export function providerConfig(
  env: Env,
  provider: AuthProvider,
): ProviderConfig | null {
  if (provider === 'github') {
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return null;
    return {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      authorizeUrl: 'https://github.com/login/oauth/authorize',
      // Public profile needs no scope; user:email reads the verified primary email.
      scope: 'user:email',
    };
  }
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scope: 'openid email profile',
  };
}

export function callbackUrl(env: Env, provider: AuthProvider) {
  return `${env.API_ORIGIN}/v1/auth/${provider}/callback`;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** RFC 7636 S256 code challenge for a code verifier. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return base64Url(new Uint8Array(digest));
}

export interface AuthorizeParams {
  state: string;
  codeChallenge: string;
  nonce: string;
}

export function authorizeUrl(
  env: Env,
  provider: AuthProvider,
  config: ProviderConfig,
  params: AuthorizeParams,
): string {
  const url = new URL(config.authorizeUrl);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', callbackUrl(env, provider));
  url.searchParams.set('scope', config.scope);
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (provider === 'google') {
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('prompt', 'select_account');
    url.searchParams.set('nonce', params.nonce);
  } else url.searchParams.set('allow_signup', 'true');
  return url.toString();
}

const USER_AGENT = 'kimo-api (+https://getkimo.tech)';
const CONTROL = /[\p{Cc}\p{Cf}]/gu;

/** Trims, strips control characters and caps a provider-supplied display name. */
export function cleanName(raw: string | null | undefined): string {
  return (raw ?? '').replace(CONTROL, '').trim().slice(0, 100);
}

export function cleanEmail(raw: string | null | undefined): string {
  const email = (raw ?? '').trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email
    : '';
}

/** Only https avatar urls of a sane length survive. */
export function cleanAvatar(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 500) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

const tokenSchema = z.object({
  access_token: z.string().min(1),
  id_token: z.string().min(1).optional(),
});
const githubUserSchema = z.object({
  id: z.number(),
  login: z.string(),
  name: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
});
const githubEmailsSchema = z.array(
  z.object({
    email: z.string(),
    primary: z.boolean(),
    verified: z.boolean(),
  }),
);
const googleClaimsSchema = z.object({
  iss: z.enum(['https://accounts.google.com', 'accounts.google.com']),
  aud: z.union([z.string(), z.array(z.string())]),
  exp: z.number(),
  sub: z.string().min(1).max(255),
  nonce: z.string().optional(),
  email: z.string().optional(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
  picture: z.string().optional(),
});

async function fetchJson(
  fetcher: typeof fetch,
  input: string,
  init: RequestInit,
): Promise<unknown> {
  const response = await fetcher(input, init);
  if (!response.ok)
    throw new HttpError(
      502,
      'provider_error',
      `Sign-in provider answered ${response.status}`,
    );
  return response.json();
}

function decodeJwtPayload(token: string): unknown {
  const part = token.split('.')[1];
  if (!part) throw new HttpError(401, 'not_allowed', 'Bad id token');
  const padded = part.replace(/-/g, '+').replace(/_/g, '/');
  const json = new TextDecoder().decode(
    Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)),
  );
  return JSON.parse(json) as unknown;
}

/**
 * Verifies a Google id_token received directly from Google's token endpoint
 * over TLS (OIDC Core 3.1.3.7 allows TLS server validation in place of a
 * signature check here): issuer, audience, expiry and nonce must all match.
 */
export function verifyGoogleIdToken(
  idToken: string,
  clientId: string,
  nonce: string,
  nowSeconds: number,
) {
  const claims = googleClaimsSchema.safeParse(decodeJwtPayload(idToken));
  if (!claims.success)
    throw new HttpError(401, 'not_allowed', 'Bad id token claims');
  const audiences = Array.isArray(claims.data.aud)
    ? claims.data.aud
    : [claims.data.aud];
  if (
    !audiences.includes(clientId) ||
    claims.data.exp < nowSeconds ||
    !nonce ||
    claims.data.nonce !== nonce
  )
    throw new HttpError(401, 'not_allowed', 'id token not for kimo');
  return claims.data;
}

export interface ExchangeInput {
  code: string;
  codeVerifier: string;
  nonce: string;
  nowSeconds: number;
}

/** Exchanges an authorization code (with PKCE) and reads the identity. */
export async function exchangeCode(
  env: Env,
  provider: AuthProvider,
  config: ProviderConfig,
  input: ExchangeInput,
  fetcher: typeof fetch = fetch,
): Promise<OAuthIdentity> {
  if (provider === 'github') {
    const token = tokenSchema.safeParse(
      await fetchJson(fetcher, 'https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
        },
        body: JSON.stringify({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code: input.code,
          redirect_uri: callbackUrl(env, provider),
          code_verifier: input.codeVerifier,
        }),
      }),
    );
    if (!token.success)
      throw new HttpError(401, 'not_allowed', 'GitHub sign-in was refused');
    const headers = {
      Authorization: `Bearer ${token.data.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': USER_AGENT,
    };
    const user = githubUserSchema.parse(
      await fetchJson(fetcher, 'https://api.github.com/user', { headers }),
    );
    // Only the verified primary email is trusted (used to link accounts).
    const emails = githubEmailsSchema.safeParse(
      await fetchJson(fetcher, 'https://api.github.com/user/emails', {
        headers,
      }).catch(() => []),
    );
    const primary = emails.success
      ? emails.data.find((entry) => entry.primary && entry.verified)
      : undefined;
    return {
      providerId: String(user.id),
      email: cleanEmail(primary?.email),
      name: cleanName(user.name) || cleanName(user.login),
      avatarUrl: cleanAvatar(user.avatar_url),
    };
  }
  const token = tokenSchema.safeParse(
    await fetchJson(fetcher, 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code: input.code,
        code_verifier: input.codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: callbackUrl(env, provider),
      }).toString(),
    }),
  );
  if (!token.success || !token.data.id_token)
    throw new HttpError(401, 'not_allowed', 'Google sign-in was refused');
  const claims = verifyGoogleIdToken(
    token.data.id_token,
    config.clientId,
    input.nonce,
    input.nowSeconds,
  );
  const email = claims.email_verified === true ? cleanEmail(claims.email) : '';
  return {
    providerId: claims.sub,
    email,
    name: cleanName(claims.name) || email.split('@')[0] || 'kimo user',
    avatarUrl: cleanAvatar(claims.picture),
  };
}
