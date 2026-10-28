type EventName =
  | 'prompt_sent'
  | 'warmup_duration'
  | 'first_op_latency'
  | 'interrupt_sent'
  | 'user_edit'
  | 'review_shown'
  | 'render_started'
  | 'render_done'
  | 'download_clicked'
  | 'share_clicked';
const fields = new Set([
  'length',
  'video',
  'image',
  'audio',
  'doc',
  'duration',
  'op',
]);
const opTypes = new Set([
  'project.update',
  'track.add',
  'track.remove',
  'track.update',
  'clip.add',
  'clip.remove',
  'clip.update',
  'clip.move',
  'clip.trim',
  'clip.split',
  'clip.unset',
  'text.update',
  'effect.set',
  'keyframe.set',
  'marker.add',
  'marker.remove',
]);
/** localStorage key holding the visitor's analytics choice. */
export const ANALYTICS_CONSENT_KEY = 'kimo.analytics-consent';

/** Product analytics run only after an explicit opt-in ("granted"). */
export function analyticsConsented(): boolean {
  try {
    return window.localStorage.getItem(ANALYTICS_CONSENT_KEY) === 'granted';
  } catch {
    return false;
  }
}

/**
 * Explicit event allowlist, no autocapture, cookies, page URLs or session
 * replay. Off unless PostHog is configured AND the visitor opted in.
 */
export function track(
  event: EventName,
  values: Record<string, number | string> = {},
) {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (
    !key ||
    !host ||
    typeof window === 'undefined' ||
    navigator.doNotTrack === '1' ||
    !analyticsConsented()
  )
    return;
  const properties: Record<string, number | string | boolean> = {
    $process_person_profile: false,
  };
  for (const [name, value] of Object.entries(values)) {
    if (!fields.has(name)) continue;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0)
      properties[name] = value;
    if (name === 'op' && typeof value === 'string' && opTypes.has(value))
      properties[name] = value;
  }
  try {
    const id = sessionStorage.getItem('kimo.analytics') ?? crypto.randomUUID();
    sessionStorage.setItem('kimo.analytics', id);
    void fetch(new URL('/capture/', host), {
      method: 'POST',
      credentials: 'omit',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        event,
        properties: { ...properties, distinct_id: id },
      }),
    }).catch(() => undefined);
  } catch {
    /* Analytics never interrupt editing. */
  }
}
export function rememberPrompt(prompt: string) {
  try {
    const previous = recentPrompts();
    sessionStorage.setItem(
      'kimo.recent-prompts',
      JSON.stringify(
        [prompt, ...previous.filter((p) => p !== prompt)].slice(0, 8),
      ),
    );
  } catch {
    /* Recent prompts are local to this tab and never sent to analytics. */
  }
}
export function recentPrompts(): string[] {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem('kimo.recent-prompts') ?? '[]',
    );
    return Array.isArray(value)
      ? value.filter((p): p is string => typeof p === 'string').slice(0, 8)
      : [];
  } catch {
    return [];
  }
}
/** Sentry envelope protocol. Deliberately omit URLs, messages, stack and user data. */
export function reportError(digest?: string) {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  try {
    const url = new URL(dsn);
    const project = url.pathname.split('/').pop();
    if (!project) return;
    const endpoint = `${url.protocol}//${url.host}/api/${project}/envelope/?sentry_key=${encodeURIComponent(url.username)}&sentry_version=7`;
    const event = {
      event_id: crypto.randomUUID().replaceAll('-', ''),
      timestamp: Date.now() / 1000,
      platform: 'javascript',
      level: 'error',
      message: 'kimo route failed',
      tags: {
        digest: digest?.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) ?? 'client',
      },
    };
    void fetch(endpoint, {
      method: 'POST',
      credentials: 'omit',
      keepalive: true,
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body:
        JSON.stringify({ dsn }) +
        '\n' +
        JSON.stringify({ type: 'event' }) +
        '\n' +
        JSON.stringify(event),
    }).catch(() => undefined);
  } catch {
    /* Reporting must not throw inside an error boundary. */
  }
}
