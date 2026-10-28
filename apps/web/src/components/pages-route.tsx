'use client';
import { useEffect, useState } from 'react';
import { UploadsProvider } from '@/components/uploads/uploads-provider';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  KimoClient,
  type DeliveredVideo,
  type RenderSnapshot,
  type SessionSnapshot,
} from '@kimo/client';
const Studio = dynamic(
  () => import('./studio/studio-shell').then((m) => m.StudioShell),
  { ssr: false },
);
const Warmup = dynamic(
  () => import('./warmup/warmup-screen').then((m) => m.WarmupScreen),
  { ssr: false },
);
const Render = dynamic(
  () => import('./render/render-screen').then((m) => m.RenderScreen),
  { ssr: false },
);
const Delivery = dynamic(
  () => import('./render/delivery-page').then((m) => m.DeliveryPage),
  { ssr: false },
);
type Loaded = {
  id: string;
  session?: SessionSnapshot;
  video?: DeliveredVideo;
  render?: RenderSnapshot;
  renderId?: string;
};
function RemoteRoute({ kind }: { kind: 'studio' | 'warmup' | 'render' | 'v' }) {
  const [loaded, setLoaded] = useState<Loaded>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    const id = decodeURIComponent(
      location.pathname.split('/').filter(Boolean)[1] ?? '',
    );
    const client = new KimoClient();
    void (async () => {
      if (kind === 'v') return { id, video: await client.video(id) };
      const session = await client.session(id);
      if (kind !== 'render') return { id, session };
      if (!session.renderId) {
        location.replace(`/studio/${encodeURIComponent(id)}`);
        return undefined;
      }
      const render = await client.render(session.renderId);
      return { id, session, render, renderId: session.renderId };
    })()
      .then((value) => {
        if (alive) setLoaded(value);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [kind]);
  if (error)
    return (
      <main id="main" className="privacy-page">
        <h1>could not load this {kind === 'v' ? 'video' : 'session'}</h1>
        <p>it may have expired, or the connection is unavailable.</p>
        <button onClick={() => location.reload()}>try again</button>{' '}
        <Link href="/">start a new video</Link>
      </main>
    );
  if (!loaded)
    return (
      <main id="main" className="privacy-page" aria-busy="true">
        <h1>opening {kind === 'v' ? 'your video' : kind}…</h1>
      </main>
    );
  if (kind === 'v' && loaded.video)
    return <Delivery videoId={loaded.id} video={loaded.video} />;
  if (kind === 'render' && loaded.render && loaded.renderId)
    return (
      <Render
        sessionId={loaded.id}
        initial={loaded.render}
        initialRenderId={loaded.renderId}
      />
    );
  if (kind === 'warmup')
    return <Warmup sessionId={loaded.id} snapshot={loaded.session ?? null} />;
  return <Studio sessionId={loaded.id} snapshot={loaded.session ?? null} />;
}

export function PagesRoute(props: React.ComponentProps<typeof RemoteRoute>) {
  return (
    <UploadsProvider>
      <RemoteRoute {...props} />
    </UploadsProvider>
  );
}
