import { guardNavigation } from './navigation';
export const renderTiming = {
  barsCollapse: 1000,
  checkDelay: 1000,
  poll: 800,
  frameFade: 180,
  chunk: 1000,
  reviewOverlay: 3000,
  completion: 1400,
  completionReduced: 220,
  finalSweep: 400,
  barStagger: 60,
  hold: 300,
  entranceStagger: 70,
  actionStagger: 50,
  sheenDelay: 1200,
  sheen: 900,
  transitionTimeout: 2000,
} as const;
export function videoTime(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}
export function renderStage(progress: number) {
  return progress < 0.85
    ? 'composing frames'
    : progress < 0.95
      ? 'mixing audio'
      : progress < 0.99
        ? 'encoding 1080p'
        : 'finishing up';
}
export function videoFilename(title: string) {
  const slug =
    title
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'video';
  return `${slug}-kimo-1080p.mp4`;
}
export type RenderContext = {
  renderId: string;
  poster?: string;
  title: string;
  burnInCaptions: boolean;
};
export function saveRenderContext(sessionId: string, value: RenderContext) {
  try {
    sessionStorage.setItem(`kimo.render.${sessionId}`, JSON.stringify(value));
  } catch {
    /* The server render remains restorable without local storage. */
  }
}
export function readRenderContext(
  sessionId: string,
): RenderContext | undefined {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(`kimo.render.${sessionId}`) ?? 'null',
    );
    if (
      value &&
      typeof value === 'object' &&
      'renderId' in value &&
      typeof value.renderId === 'string' &&
      'title' in value &&
      typeof value.title === 'string' &&
      'burnInCaptions' in value &&
      typeof value.burnInCaptions === 'boolean'
    ) {
      return {
        renderId: value.renderId,
        title: value.title,
        burnInCaptions: value.burnInCaptions,
        poster:
          'poster' in value && typeof value.poster === 'string'
            ? value.poster
            : undefined,
      };
    }
  } catch {
    /* Storage is optional. */
  }
}
export function navigateRendered(
  router: { push: (url: string) => void },
  url: string,
  ready: 'render' | 'delivery',
  reduced: boolean,
) {
  guardNavigation(url, `[data-${ready}-ready]`);
  const root = document.documentElement;
  root.dataset.renderTransition = reduced
    ? 'reduced'
    : ready === 'delivery'
      ? 'completion'
      : 'native';
  if (reduced || typeof document.startViewTransition !== 'function') {
    router.push(url);
    setTimeout(() => {
      delete root.dataset.renderTransition;
    }, renderTiming.completionReduced);
    return;
  }
  const transition = document.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        const finish = () => {
          observer.disconnect();
          clearTimeout(timeout);
          resolve();
        };
        const observer = new MutationObserver(() => {
          if (document.querySelector(`[data-${ready}-ready]`)) finish();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        const timeout = setTimeout(finish, renderTiming.transitionTimeout);
        router.push(url);
      }),
  );
  void transition.ready.catch(() => undefined);
  void transition.updateCallbackDone.catch(() => undefined);
  void transition.finished
    .catch(() => undefined)
    .finally(() => {
      delete root.dataset.renderTransition;
    });
}
