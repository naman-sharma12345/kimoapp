'use client';
import { useEffect, useState } from 'react';
import { UploadsProvider } from '@/components/uploads/uploads-provider';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { KimoApiError, KimoClient, type SessionSnapshot } from '@kimo/client';
import { sessionDestination } from '@/lib/session-routing';
import { useRouter } from '@/lib/app-router';
const Studio = dynamic(
  () => import('./studio/studio-shell').then((m) => m.StudioShell),
  { ssr: false },
);
const Warmup = dynamic(
  () => import('./warmup/warmup-screen').then((m) => m.WarmupScreen),
  { ssr: false },
);
const Render = dynamic(
  () => import('./render/local-render-screen').then((m) => m.LocalRenderScreen),
  { ssr: false },
);
type Loaded = { id: string; session?: SessionSnapshot };
/**
 * Loads a session in the browser, with the user's sign-in cookie, so the
 * studio, warm-up and export screens never depend on a server-side fetch.
 */
export function ClientRoute({
  kind,
}: {
  kind: 'studio' | 'warmup' | 'render';
}) {
  const [loaded, setLoaded] = useState<Loaded>();
  const [error, setError] = useState<'missing' | 'signin' | 'failed'>();
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    const id = decodeURIComponent(
      location.pathname.split('/').filter(Boolean)[1] ?? '',
    );
    const client = new KimoClient();
    void client
      .session(id)
      .then((session) => {
        if (!alive) return;
        const destination = sessionDestination(session, id);
        const here = `/${kind}/${encodeURIComponent(id)}`;
        if (
          kind !== 'render' &&
          destination &&
          destination !== here &&
          destination.startsWith('/studio/')
        ) {
          // Soft navigation: the clips picked in this tab stay in memory.
          router.replace(destination);
          return;
        }
        setLoaded({ id, session });
      })
      .catch((caught: unknown) => {
        if (!alive) return;
        if (caught instanceof KimoApiError && caught.status === 401) {
          location.replace(
            `/signin?next=${encodeURIComponent(location.pathname)}`,
          );
          setError('signin');
        } else if (caught instanceof KimoApiError && caught.status === 404)
          setError('missing');
        else setError('failed');
      });
    return () => {
      alive = false;
    };
  }, [kind, router]);
  if (error)
    return (
      <main id="main" className="privacy-page">
        <h1>
          {error === 'missing'
            ? 'we couldn’t find this project'
            : error === 'signin'
              ? 'sign in to open this project'
              : 'could not load this project'}
        </h1>
        <p>
          {error === 'missing'
            ? 'it may have been deleted, or it belongs to another account.'
            : 'check your connection and try again.'}
        </p>
        <button onClick={() => location.reload()}>try again</button>{' '}
        <Link href="/projects">your projects</Link>
      </main>
    );
  if (!loaded)
    return (
      <main id="main" className="privacy-page" aria-busy="true">
        <h1>opening your project…</h1>
      </main>
    );
  if (kind === 'render')
    return <Render sessionId={loaded.id} snapshot={loaded.session ?? null} />;
  if (kind === 'warmup')
    return <Warmup sessionId={loaded.id} snapshot={loaded.session ?? null} />;
  return <Studio sessionId={loaded.id} snapshot={loaded.session ?? null} />;
}

export function PagesRoute(props: React.ComponentProps<typeof ClientRoute>) {
  return (
    <UploadsProvider>
      <ClientRoute {...props} />
    </UploadsProvider>
  );
}
