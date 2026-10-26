/** Hold the browser snapshot until the destination has committed. */
export function navigateToWarmup(
  router: { push: (url: string) => void },
  sessionId: string,
  reduced: boolean,
) {
  const url = `/warmup/${encodeURIComponent(sessionId)}`;
  if (reduced || typeof document.startViewTransition !== 'function') {
    router.push(url);
    return;
  }
  document.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        const finish = () => {
          observer.disconnect();
          clearTimeout(fallback);
          resolve();
        };
        const observer = new MutationObserver(() => {
          if (document.querySelector('[data-warmup-ready="true"]')) finish();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        const fallback = setTimeout(finish, 5000);
        router.push(url);
      }),
  );
}
