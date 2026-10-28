'use client';
import { reportError } from '@/lib/telemetry';
import { SystemState } from './system-state';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SystemState
      variant="error"
      error={{
        message: error.message || 'unexpected error',
        digest: error.digest,
      }}
      reset={reset}
      onReport={(e) => reportError(e.digest)}
    />
  );
}
