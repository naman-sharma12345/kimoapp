'use client';
import { uiTiming } from '../motion';
import { guardNavigation } from '../navigation';

let activeTransition: ViewTransition | undefined;
export function navigateToStudio(
  router: { push: (url: string) => void },
  sessionId: string,
  reduced: boolean,
) {
  const url = `/studio/${encodeURIComponent(sessionId)}`;
  guardNavigation(url, '[data-studio-transition-ready]');
  const root = document.documentElement;
  if (typeof document.startViewTransition === 'function') {
    root.dataset.warmupUnfold = reduced ? 'reduced' : 'native';
    activeTransition = document.startViewTransition(
      () =>
        new Promise<void>((resolve) => {
          const finish = () => {
            observer.disconnect();
            clearTimeout(timeout);
            resolve();
          };
          const observer = new MutationObserver(() => {
            if (document.querySelector('[data-studio-mounted="true"]'))
              finish();
          });
          observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
          });
          const timeout = setTimeout(finish, 2000);
          router.push(url);
        }),
    );
    void activeTransition.ready.catch(() => undefined);
    void activeTransition.updateCallbackDone.catch(() => undefined);
    void activeTransition.finished
      .catch(() => undefined)
      .finally(() => {
        delete root.dataset.warmupUnfold;
        activeTransition = undefined;
      });
    return;
  }
  if (reduced) {
    root.dataset.warmupUnfold = 'reduced';
    router.push(url);
    setTimeout(() => {
      delete root.dataset.warmupUnfold;
    }, uiTiming.placeholderFade);
    return;
  }
  root.dataset.warmupUnfold = 'fallback';
  setTimeout(() => {
    router.push(url);
    setTimeout(() => {
      delete root.dataset.warmupUnfold;
    }, uiTiming.warmupUnfold);
  }, uiTiming.warmupUnfold);
}
export function isUnfolding() {
  return (
    typeof document !== 'undefined' &&
    Boolean(document.documentElement.dataset.warmupUnfold)
  );
}
