'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
export function RouteFocus() {
  const pathname = usePathname();
  useEffect(() => {
    const focus = () => {
      const target =
        document.querySelector<HTMLElement>('#main h1') ??
        document.querySelector<HTMLElement>(
          '#main textarea, #main [contenteditable="true"]',
        ) ??
        document.querySelector<HTMLElement>('#main');
      if (!target) return false;
      if (
        !target.hasAttribute('tabindex') &&
        !target.matches('textarea,[contenteditable]')
      )
        target.tabIndex = -1;
      target.focus({ preventScroll: true });
      return true;
    };
    if (focus()) return;
    const observer = new MutationObserver(() => {
      if (focus()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);
  return null;
}
