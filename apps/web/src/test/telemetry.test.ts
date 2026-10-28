import { afterEach, expect, it, vi } from 'vitest';
import { track, reportError } from '../lib/telemetry';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  localStorage.clear();
});
it('is disabled by default and allowlists only counts, timings and operation names', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response());
  vi.stubGlobal('fetch', fetcher);
  track('prompt_sent', { length: 20 });
  expect(fetcher).not.toHaveBeenCalled();
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'public-test-key');
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'https://eu.i.posthog.com');
  // Configured but no opt-in: still nothing is sent.
  track('prompt_sent', { length: 20 });
  expect(fetcher).not.toHaveBeenCalled();
  localStorage.setItem('kimo.analytics-consent', 'granted');
  track('prompt_sent', {
    length: 20,
    video: 2,
    prompt: 'private prompt',
    filename: 'private.srt',
    op: 'private prompt',
  });
  const body = String((fetcher.mock.calls[0]?.[1] as RequestInit).body);
  expect(body).toContain('prompt_sent');
  expect(body).toContain('"length":20');
  expect(body).not.toContain('private');
  expect(body).not.toContain('localhost');
  expect(body).not.toContain('$current_url');
});
it('reports only a sanitized digest to the configured Sentry envelope endpoint', () => {
  const fetcher = vi.fn().mockResolvedValue(new Response());
  vi.stubGlobal('fetch', fetcher);
  reportError('digest');
  expect(fetcher).not.toHaveBeenCalled();
  vi.stubEnv(
    'NEXT_PUBLIC_SENTRY_DSN',
    'https://public-key@errors.example.test/123',
  );
  reportError('safe-digest');
  expect(String(fetcher.mock.calls[0]?.[0])).toContain('/api/123/envelope/');
  expect(String((fetcher.mock.calls[0]?.[1] as RequestInit).body)).toContain(
    'safe-digest',
  );
});
