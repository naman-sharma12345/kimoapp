export type SecurityEnv = {
  KIMO_API_URL?: string;
  NEXT_PUBLIC_KIMO_WS?: string;
  NEXT_PUBLIC_R2_ORIGIN?: string;
  NEXT_PUBLIC_POSTHOG_HOST?: string;
  NEXT_PUBLIC_SENTRY_DSN?: string;
};
export function securityHeaders(env: SecurityEnv) {
  const origin = (value: string | undefined, fallback: string) => {
    if (!value) return fallback;
    try {
      const url = new URL(value);
      return ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)
        ? url.origin
        : fallback;
    } catch {
      return fallback;
    }
  };
  const api = origin(env.KIMO_API_URL, 'http://localhost:8787');
  const ws = origin(env.NEXT_PUBLIC_KIMO_WS, 'ws://localhost:8787');
  const r2 = origin(env.NEXT_PUBLIC_R2_ORIGIN, 'https://R2_HOST.invalid');
  const posthog = origin(
    env.NEXT_PUBLIC_POSTHOG_HOST,
    'https://POSTHOG_HOST.invalid',
  );
  const sentry = origin(
    env.NEXT_PUBLIC_SENTRY_DSN,
    'https://SENTRY_HOST.invalid',
  );
  return {
    'Content-Security-Policy': `default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' blob: data: ${api} ${r2}; media-src 'self' blob: ${api} ${r2}; connect-src 'self' ${api} ${ws} ${r2} ${posthog} ${sentry}; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self' ${api}`,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy':
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'X-Frame-Options': 'DENY',
  };
}
