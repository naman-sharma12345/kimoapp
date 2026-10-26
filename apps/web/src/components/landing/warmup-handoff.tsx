'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { KimoClient } from '@kimo/client';
import { useSessionStore } from '@/stores/session';
import { Spinner } from '@/components/ui/spinner';

export function WarmupHandoff({ sessionId }: { sessionId: string }) {
  const sameSession = useSessionStore((state) => state.sessionId === sessionId);
  const uploadStatus = useSessionStore((state) => state.uploadStatus);
  const [remote, setRemote] = useState<'checking' | 'ready' | 'missing'>(
    'checking',
  );
  useEffect(() => {
    if (sameSession) return;
    let active = true;
    void new KimoClient().session(sessionId).then(
      () => {
        if (active) setRemote('ready');
      },
      () => {
        if (active) setRemote('missing');
      },
    );
    return () => {
      active = false;
    };
  }, [sameSession, sessionId]);
  const checking = !sameSession && remote === 'checking';
  const failed = sameSession && uploadStatus === 'failed';
  const missing = !sameSession && remote === 'missing';
  const uploading = sameSession && uploadStatus === 'uploading';
  return (
    <main
      id="main"
      className="landing-handoff"
      data-warmup-ready="true"
      data-ready="true"
    >
      <div className="landing-handoff-seed">
        {uploading || checking ? (
          <Spinner size={20} label="preparing your video" />
        ) : (
          <span>ready</span>
        )}
      </div>
      <h1>getting your video ready</h1>
      <p>
        {failed
          ? 'a file couldn’t upload. your files are still here; return to try again.'
          : missing
            ? 'couldn’t find this session. return to start and try again.'
            : uploading
              ? 'your clips are uploading.'
              : checking
                ? 'checking your session.'
                : 'your session is ready. the editor will be available soon.'}
      </p>
      {failed || missing ? (
        <Link href="/" className="replay">
          back to start
        </Link>
      ) : null}
    </main>
  );
}
