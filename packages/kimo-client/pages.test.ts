import { afterEach, expect, it, vi } from 'vitest';
import { onRequest } from '../../functions/v/[[path]]';
afterEach(() => vi.unstubAllGlobals());
it('escapes delivery metadata and preserves security headers on the Pages Function', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      Response.json({
        url: 'https://media.example.test/file.mp4',
        posterUrl: 'https://media.example.test/poster.jpg',
        durationSec: 3,
        width: 1920,
        height: 1080,
        sizeBytes: 100,
        title: '<script>bad()</script>',
      }),
    ),
  );
  const response = await onRequest({
    request: new Request('https://app.example.test/v/test'),
    env: {
      KIMO_API_URL: 'https://api.example.test',
      NEXT_PUBLIC_R2_ORIGIN: 'https://media.example.test',
      ASSETS: {
        fetch: async () =>
          new Response(
            '<html><head><title>kimo</title></head><body></body></html>',
            { headers: { 'Content-Type': 'text/html' } },
          ),
      },
    },
    next: async () => new Response(),
  });
  const html = await response.text();
  expect(html).toContain('&lt;script&gt;bad()&lt;/script&gt;');
  expect(html).not.toContain('<script>bad()');
  expect(response.headers.get('content-security-policy')).toContain(
    'https://media.example.test',
  );
  expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
});
