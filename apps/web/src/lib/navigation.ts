// An interrupted App Router stream must not leave a shared-frame handoff blank.
let pending: (() => void) | undefined;
export function cancelNavigationGuard() {
  pending?.();
}
export function guardNavigation(url: string, selector: string) {
  cancelNavigationGuard();
  const source = location.pathname;
  const target = new URL(url, location.href).pathname;
  const cancel = () => {
    clearTimeout(timer);
    window.removeEventListener('popstate', cancel);
    if (pending === cancel) pending = undefined;
  };
  const timer = setTimeout(() => {
    const missing = !document.querySelector(selector)?.getClientRects().length;
    const expected =
      location.pathname === source || location.pathname === target;
    cancel();
    if (expected && missing) location.replace(url);
  }, 3000);
  pending = cancel;
  window.addEventListener('popstate', cancel, { once: true });
}
