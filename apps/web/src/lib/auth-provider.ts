import type { AuthProvider } from '@kimo/client';

/** Every sign-in provider the app knows how to offer, in display order. */
export const ALL_AUTH_PROVIDERS: readonly AuthProvider[] = ['github', 'google'];

/**
 * Providers shown before /v1/auth/providers answers. Override with
 * NEXT_PUBLIC_KIMO_AUTH_PROVIDERS=github,google (comma separated). The API's
 * answer always wins, so a provider it reports unavailable is hidden.
 */
export const DEFAULT_AUTH_PROVIDERS: readonly AuthProvider[] = (() => {
  const raw = process.env.NEXT_PUBLIC_KIMO_AUTH_PROVIDERS;
  if (!raw) return ALL_AUTH_PROVIDERS;
  const wanted = raw.split(',').map((value) => value.trim());
  const list = ALL_AUTH_PROVIDERS.filter((p) => wanted.includes(p));
  return list.length ? list : ALL_AUTH_PROVIDERS;
})();

export function isAuthProvider(value: unknown): value is AuthProvider {
  return value === 'github' || value === 'google';
}

/** Lowercase name for UI copy ("continue with github"). */
export function providerLabel(provider: AuthProvider): string {
  return provider;
}

/** Keeps known providers, in display order, without duplicates. */
export function orderProviders(list: readonly string[]): AuthProvider[] {
  return ALL_AUTH_PROVIDERS.filter((provider) => list.includes(provider));
}
