'use client';
import { useRouter } from '@/lib/app-router';
import { useState } from 'react';

export function StartNewVideo() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="ui-button ui-button-primary ui-size-md"
      disabled={busy}
      aria-busy={busy}
      onClick={() => {
        setBusy(true);
        void Promise.all([
          import('@/lib/uploads/manager'),
          import('@/stores/session'),
        ])
          .then(([uploads, session]) => {
            uploads.uploadManager.reset();
            session.useSessionStore.getState().reset();
            router.push('/');
          })
          .catch(() => {
            window.location.assign('/');
          });
      }}
    >
      start a new video
    </button>
  );
}
