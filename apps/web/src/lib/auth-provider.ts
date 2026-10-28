import type { AuthProvider } from '@kimo/client';

/**
 * The sign-in provider the app offers. GitHub is live on api.getkimo.tech;
 * set NEXT_PUBLIC_KIMO_AUTH_PROVIDER=google once a Google client exists.
 */
export const AUTH_PROVIDER: AuthProvider =
  process.env.NEXT_PUBLIC_KIMO_AUTH_PROVIDER === 'google' ? 'google' : 'github';

/** Lowercase name for UI copy ("continue with github"). */
export const AUTH_PROVIDER_LABEL = AUTH_PROVIDER;
