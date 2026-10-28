'use client';
import { useMemo } from 'react';
import { useRouter as useNextRouter } from 'next/navigation';
/** Pages serves static route shells. Full navigation preserves their real URL. */
export function useRouter() {
  const router = useNextRouter();
  return useMemo(
    () =>
      process.env.NEXT_PUBLIC_PAGES_EXPORT === '1'
        ? {
            ...router,
            push: (href: string) => window.location.assign(href),
            replace: (href: string) => window.location.replace(href),
            prefetch: () => {},
          }
        : router,
    [router],
  );
}
