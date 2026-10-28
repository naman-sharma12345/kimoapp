import { videoResponseSchema } from '../../packages/kimo-client/src/schema';
import { securityHeaders, type SecurityEnv } from '../security';
type Context = {
  request: Request;
  env: SecurityEnv & {
    ASSETS: { fetch: (request: Request) => Promise<Response> };
  };
  next: () => Promise<Response>;
};
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] ?? c,
  );
/** Pages Function preserves public per-video metadata around the static player shell. */
export async function onRequest(context: Context) {
  const url = new URL(context.request.url);
  const id = url.pathname.split('/').filter(Boolean)[1];
  if (!id || id === 'shell') return context.next();
  const shell = await context.env.ASSETS.fetch(
    new Request(new URL('/v/shell/index.html', url), context.request),
  );
  const headers = new Headers(shell.headers);
  for (const [name, value] of Object.entries(securityHeaders(context.env)))
    headers.set(name, value);
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  );
  headers.set('X-Frame-Options', 'DENY');
  let html = await shell.text();
  try {
    const api = context.env.KIMO_API_URL ?? 'http://localhost:8787';
    const response = await fetch(
      new URL(`/v1/videos/${encodeURIComponent(id)}`, api),
      { signal: AbortSignal.timeout(5000) },
    );
    if (response.status === 404)
      return new Response(html, { status: 404, headers });
    if (response.ok) {
      const video = videoResponseSchema.parse(await response.json());
      const title = escape(video.title);
      html = html
        .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
        .replace(
          '</head>',
          `<meta property="og:type" content="video.other"/><meta property="og:title" content="${title}"/><meta property="og:image" content="${escape(video.posterUrl)}"/><meta property="og:video" content="${escape(video.url)}"/><meta property="og:video:type" content="video/${video.format ?? 'mp4'}"/></head>`,
        );
    }
  } catch {
    /* The browser shell can retry a temporary API outage. */
  }
  return new Response(html, { status: shell.status, headers });
}
