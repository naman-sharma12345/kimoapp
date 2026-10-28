import type { Env } from './env.ts';

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export function errorResponse(status: number, code: string, message: string) {
  return json({ code, message }, status);
}

export function noContent(headers: Record<string, string> = {}): Response {
  return new Response(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

export function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({
    Location: location,
    'Cache-Control': 'no-store',
  });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
}

export function withCors(request: Request, response: Response, env: Env) {
  const origin = request.headers.get('Origin');
  const headers = new Headers(response.headers);
  if (origin && origin === env.APP_ORIGIN) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set(
      'Access-Control-Allow-Methods',
      'GET, POST, PATCH, DELETE, OPTIONS',
    );
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Access-Control-Max-Age', '600');
  }
  headers.append('Vary', 'Origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Headers every API answer carries: JSON only, never framed or sniffed. */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy':
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-site',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS))
    headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** decodeURIComponent that answers null instead of throwing on bad escapes. */
export function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export async function readJson(request: Request): Promise<unknown> {
  const type = request.headers.get('Content-Type') ?? '';
  const text = await request.text();
  if (text && !/^application\/json(;|$)/i.test(type.trim()))
    throw new HttpError(
      415,
      'unsupported_media_type',
      'Send JSON with Content-Type: application/json',
    );
  if (text.length > 64_000)
    throw new HttpError(413, 'too_large', 'Request body is too large');
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, 'invalid_request', 'Body is not valid JSON');
  }
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') ?? '';
  for (const part of header.split(/;\s*/)) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index) === name)
      return safeDecode(part.slice(index + 1));
  }
  return null;
}

export function cookie(
  env: Env,
  name: string,
  value: string,
  maxAgeSeconds: number,
  path = '/',
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${path}`,
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ];
  if (env.COOKIE_DOMAIN) parts.push(`Domain=${env.COOKIE_DOMAIN}`);
  return parts.join('; ');
}
