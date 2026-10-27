'use client';
import { useEffect, useRef, useState } from 'react';
import type { Asset, KimoProject } from '@kimo/client';
import type { CompositorController, PreviewMetrics } from '@kimo/compositor';

const origin = process.env.NEXT_PUBLIC_KIMO_API ?? 'http://localhost:8787';
const tracks: KimoProject['tracks'] = Array.from({ length: 5 }, (_, index) => ({
  id: `track-${index}`,
  kind: index === 0 ? 'video' : 'overlay',
  name: `track ${index + 1}`,
  muted: false,
  hidden: false,
  locked: false,
  height: 64,
}));
const assets: Asset[] = [1, 2, 3].map((index) => ({
  id: `sample-${index}`,
  kind: 'video',
  name: `study-${index}.mp4`,
  url: `${origin}/fixtures/study-${index}.mp4`,
  source: 'user',
}));
const project: KimoProject = {
  id: 'benchmark',
  version: 1,
  fps: 30,
  width: 1920,
  height: 1080,
  duration: 32,
  tracks,
  clips: Object.fromEntries(
    Array.from({ length: 20 }, (_, index) => {
      const id = `clip-${index}`;
      return [
        id,
        {
          id,
          trackId: `track-${index % 5}`,
          assetId: `sample-${(index % 3) + 1}`,
          kind: 'video',
          start: Math.floor(index / 5) * 8,
          duration: 8,
          in: 0,
          transform: {
            x: 0,
            y: 0,
            scale: 1,
            rotation: 0,
            opacity: index % 5 === 0 ? 1 : 0.15,
          },
          effects: [],
          keyframes: [],
          speed: 1,
        },
      ];
    }),
  ),
  markers: [],
};

export function CompositorBench() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<CompositorController | null>(null);
  const [metrics, setMetrics] = useState<PreviewMetrics | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false;
    void import('@kimo/compositor').then(async ({ CompositorController }) => {
      if (disposed || !canvas.current) return;
      const instance = new CompositorController(
        canvas.current,
        project,
        assets,
        setMetrics,
      );
      controller.current = instance;
      await instance.mount();
      if (!disposed) setReady(true);
    });
    return () => {
      disposed = true;
      controller.current?.destroy();
      controller.current = null;
    };
  }, []);
  return (
    <main id="main" data-ready="true" className="compositor-benchmark">
      <button disabled={!ready} onClick={() => void controller.current?.play()}>
        start benchmark
      </button>
      <p data-benchmark-fps={metrics?.fps ?? 0}>
        preview {metrics?.fps ?? 0} fps ·{' '}
        {metrics?.lowQuality ? '720p adaptive' : 'full quality'}
      </p>
      <canvas
        ref={canvas}
        className="compositor-benchmark-canvas"
        aria-label="compositor benchmark"
      />
      <div>
        {Array.from({ length: 12 }, (_, index) => (
          <button
            key={index}
            onClick={() => {
              controller.current?.pause();
              controller.current?.seek(index * 2);
            }}
          >
            frame {index + 1}
          </button>
        ))}
      </div>
    </main>
  );
}
