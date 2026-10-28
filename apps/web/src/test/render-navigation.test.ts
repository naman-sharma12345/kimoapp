import { afterEach, describe, expect, it, vi } from 'vitest';
import { navigateToStudio } from '../lib/warmup/transition';
import { navigateRendered } from '../lib/render';
import { cancelNavigationGuard } from '../lib/navigation';
const original = Object.getOwnPropertyDescriptor(
  document,
  'startViewTransition',
);
afterEach(() => {
  cancelNavigationGuard();
  vi.clearAllTimers();
  vi.useRealTimers();
  if (original)
    Object.defineProperty(document, 'startViewTransition', original);
  else Reflect.deleteProperty(document, 'startViewTransition');
  delete document.documentElement.dataset.warmupUnfold;
  delete document.documentElement.dataset.renderTransition;
});
describe('navigation survives native transition failure', () => {
  it.each(['warmup', 'render'] as const)(
    'bounds %s readiness and handles every rejected transition promise',
    async (kind) => {
      vi.useFakeTimers();
      let updateSettled = false;
      Object.defineProperty(document, 'startViewTransition', {
        configurable: true,
        value: (update: () => Promise<void>) => {
          const work = update().then(() => {
            updateSettled = true;
          });
          const rejected = () =>
            work.then(() => {
              throw new DOMException('DOM update timed out', 'TimeoutError');
            });
          return {
            ready: rejected(),
            updateCallbackDone: rejected(),
            finished: rejected(),
          } as unknown as ViewTransition;
        },
      });
      const router = { push: vi.fn() };
      if (kind === 'warmup') navigateToStudio(router, 'session', false);
      else navigateRendered(router, '/render/session', 'render', false);
      expect(router.push).toHaveBeenCalledWith(
        kind === 'warmup' ? '/studio/session' : '/render/session',
      );
      await vi.advanceTimersByTimeAsync(2500);
      expect(updateSettled).toBe(true);
      expect(document.documentElement.dataset.warmupUnfold).toBeUndefined();
      expect(document.documentElement.dataset.renderTransition).toBeUndefined();
    },
  );
});
