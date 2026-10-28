import { z } from 'zod';
import type { AuthProvider } from '@kimo/client/account';
import type { Env } from './env.ts';
import { HttpError } from './http.ts';

export interface OAuthIdentity {
  providerId: string;
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
      scope: 'read:user user:email',
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

export function authorizeUrl(
  env: Env,
  provider: AuthProvider,
  config: ProviderConfig,
  state: string,
): string {
  const url = new URL(config.authorizeUrl);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', callbackUrl(env, provider));
  url.searchParams.set('scope', config.scope);
  url.searchParams.set('state', state);
  if (provider === 'google') {
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('prompt', 'select_account');
  } else url.searchParams.set('allow_signup', 'true');
  return url.toString();
}

const USER_AGENT = 'kimo-api (+https://getkimo.tech)';

const tokenSchema = z.object({ access_token: z.string().min(1) });
const githubUserSchema = z.object({
  id: z.number(),
  login: z.string(),
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  avatar_url: z.string().url().nullable().optional(),
});
const githubEmailsSchema = z.array(
  z.object({
    email: z.string(),
    primary: z.boolean(),
    verified: z.boolean(),
  }),
);
const googleUserSchema = z.object({
  sub: z.string().min(1),
  email: z.string().optional(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
  picture: z.string().url().optional(),
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

/** Exchanges an authorization code and reads the signed-in identity. */
export async function exchangeCode(
  env: Env,
  provider: AuthProvider,
  config: ProviderConfig,
  code: string,
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
          code,
          redirect_uri: callbackUrl(env, provider),
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
    let email = user.email ?? '';
    if (!email) {
      const emails = githubEmailsSchema.safeParse(
        await fetchJson(fetcher, 'https://api.github.com/user/emails', {
          headers,
        }).catch(() => []),
      );
      const primary = emails.success
        ? emails.data.find((entry) => entry.primary && entry.verified)
        : undefined;
      email = primary?.email ?? '';
    }
    return {
      providerId: String(user.id),
      email,
      name: user.name || user.login,
      avatarUrl: user.avatar_url ?? null,
    };
  }
  const token = tokenSchema.safeParse(
    await fetchJson(fetcher, 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: callbackUrl(env, provider),
      }).toString(),
    }),
  );
  if (!token.success)
    throw new HttpError(401, 'not_allowed', 'Google sign-in was refused');
  const user = googleUserSchema.parse(
    await fetchJson(
      fetcher,
      'https://openidconnect.googleapis.com/v1/userinfo',
      { headers: { Authorization: `Bearer ${token.data.access_token}` } },
    ),
  );
  return {
    providerId: user.sub,
    email: user.email_verified === false ? '' : (user.email ?? ''),
    name: user.name ?? user.email ?? '',
    avatarUrl: user.picture ?? null,
  };
}
