/**
 * Security headers for every app.getkimo.tech response (wired up in
 * next.config.ts). Kept in a plain module so tests can check them.
 */
function origin(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy(env: {
  apiUrl?: string;
  posthogHost?: string;
  sentryDsn?: string;
  dev?: boolean;
}): string {
  const api = origin(env.apiUrl ?? 'http://localhost:8787');
  const ws = api?.replace(/^http/, 'ws') ?? null;
  const connect = [
    "'self'",
    api,
    ws,
    origin(env.posthogHost),
    origin(env.sentryDsn),
  ].filter(Boolean);
  const script = ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"];
  if (env.dev) script.push("'unsafe-eval'");
  return [
    "default-src 'self'",
    `script-src ${script.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    `connect-src ${connect.join(' ')}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function securityHeaders(
  env: Parameters<typeof contentSecurityPolicy>[0],
) {
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(env) },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    },
    {
      key: 'Strict-Transport-Security',
      value: 'max-age=31536000; includeSubDomains',
    },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ];
}
