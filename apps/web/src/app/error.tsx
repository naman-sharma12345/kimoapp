'use client';
import { useEffect } from 'react';
import { reportError } from '@/lib/telemetry';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => reportError(error.digest), [error.digest]);
  return (
    <main id="main" className="token-page" data-ready="true">
      <h1 className="text-t28">something went wrong</h1>
      <p className="mt-4 text-cream-60">try loading this page again.</p>
      <button className="replay mt-6" onClick={reset}>
        try again
      </button>
    </main>
  );
}
