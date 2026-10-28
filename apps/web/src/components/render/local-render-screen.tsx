'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'motion/react';
import { KimoClient, type SessionSnapshot } from '@kimo/client';
import { exportProject, pickExportFormat } from '@kimo/compositor';
import { useRouter } from '@/lib/app-router';
import { Button } from '@/components/ui/button';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import { durations, springs } from '@/lib/motion';
import { renderTiming, videoTime } from '@/lib/render';
import { track } from '@/lib/telemetry';
import { cancelNavigationGuard } from '@/lib/navigation';
import {
  exportCut,
  getExportJob,
  markExported,
  type ExportJob,
} from '@/lib/export-job';
import { missingAssets } from '@/lib/local-media';
import { OutputAtmosphere, OutputBrand } from './output-shell';

type Status = 'exporting' | 'done' | 'failed' | 'missing';
type Frame = { n: number; url: string };

function filename(title: string, extension: string, resolution: string) {
  const slug =
    title
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'video';
  return `${slug}-kimo-${resolution}.${extension}`;
}

function stage(progress: number) {
  return progress < 0.97 ? 'recording your cut' : 'finishing up';
}

/**
 * Exports the cut in this tab: the compositor plays it once into a hidden
 * canvas and MediaRecorder captures picture and sound. The file is offered
 * as a download and is not kept anywhere, by kimo or on this device.
 */
export function LocalRenderScreen({
  sessionId,
  snapshot,
}: {
  sessionId: string;
  snapshot: SessionSnapshot | null;
}) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [job, setJob] = useState<ExportJob>();
  const [status, setStatus] = useState<Status>('exporting');
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [error, setError] = useState('');
  const [download, setDownload] = useState<{
    url: string;
    name: string;
    size: number;
  }>();
  const abort = useRef<AbortController | null>(null);
  const started = useRef(0);
  const run = useRef(0);

  useEffect(() => {
    const saved = getExportJob(sessionId);
    if (saved) {
      setJob(saved);
      return;
    }
    if (snapshot) {
      const fallback: ExportJob = {
        sessionId,
        project: snapshot.project,
        assets: snapshot.assets,
        title: 'untitled video',
        burnInCaptions: true,
        resolution: '1080p',
        format: 'mp4',
      };
      if (missingAssets(snapshot.assets).length) setStatus('missing');
      else setJob(fallback);
    } else setStatus('missing');
  }, [sessionId, snapshot]);

  const start = useCallback(async (current: ExportJob) => {
    const id = ++run.current;
    if (missingAssets(current.assets).length) {
      setStatus('missing');
      return;
    }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setStatus('exporting');
    setProgress(0);
    setFrames([]);
    setError('');
    started.current = performance.now();
    try {
      const result = await exportProject(exportCut(current), current.assets, {
        resolution: current.resolution,
        prefer: current.format,
        signal: controller.signal,
        onProgress: ({ time, duration, frame }) => {
          if (id !== run.current) return;
          setProgress(duration ? Math.min(1, time / duration) : 0);
          setElapsed((performance.now() - started.current) / 1000);
          if (frame)
            setFrames((items) =>
              [...items, { n: Math.round(time * 30), url: frame }].slice(-8),
            );
        },
      });
      if (id !== run.current) return;
      const url = URL.createObjectURL(result.blob);
      setDownload({
        url,
        name: filename(
          current.title,
          result.format.extension,
          current.resolution,
        ),
        size: result.blob.size,
      });
      setProgress(1);
      setStatus('done');
      markExported(current.sessionId, current.project.version);
      track('render_done', {
        duration: Math.round(performance.now() - started.current),
      });
      void new KimoClient()
        .recordExport(current.sessionId, {
          durationSec: Math.max(0.1, result.durationSec),
          width: result.width,
          height: result.height,
          format: result.format.extension,
        })
        .catch(() => undefined);
    } catch (caught) {
      if (id !== run.current) return;
      if (caught instanceof DOMException && caught.name === 'AbortError')
        return;
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : 'the export could not finish',
      );
      setStatus('failed');
    }
  }, []);

  useEffect(() => {
    if (job) void start(job);
    return () => abort.current?.abort();
  }, [job, start]);

  useEffect(
    () => () => {
      if (download) URL.revokeObjectURL(download.url);
    },
    [download],
  );

  // Leaving mid-export, or before saving the file, loses the work.
  useEffect(() => {
    if (status !== 'exporting' && status !== 'done') return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [status]);

  const backToStudio = () => {
    abort.current?.abort();
    cancelNavigationGuard();
    router.push(`/studio/${encodeURIComponent(sessionId)}`);
  };

  const duration = job?.project.duration ?? snapshot?.project.duration ?? 0;
  const totalFrames = Math.max(1, Math.round(duration * 30));
  const frame = Math.round(progress * totalFrames);
  const eta =
    progress > 0.02
      ? Math.max(0, (elapsed / progress) * (1 - progress))
      : duration;
  const latest = frames.at(-1);
  const done = status === 'done';
  const failed = status === 'failed';
  const width = job?.project.width ?? snapshot?.project.width ?? 1920;
  const height = job?.project.height ?? snapshot?.project.height ?? 1080;
  const format =
    typeof window === 'undefined' ? null : pickExportFormat(job?.format);

  if (status === 'missing')
    return (
      <main id="main" className="output-page render-page" data-render-ready>
        <OutputAtmosphere />
        <header className="output-nav">
          <OutputBrand />
        </header>
        <section className="render-content" aria-label="export">
          <div className="render-failure" role="status">
            <h1>your clips aren’t in this tab anymore</h1>
            <p>
              kimo doesn’t keep your videos. open the studio, add the same clips
              again, then export.
            </p>
            <div className="agent-button-row">
              <Button variant="primary" onClick={backToStudio}>
                back to editing
              </Button>
            </div>
          </div>
        </section>
      </main>
    );

  return (
    <main
      id="main"
      className="output-page render-page"
      data-render-ready
      data-ready="true"
      data-status={status}
    >
      <OutputAtmosphere />
      <header className="output-nav">
        <OutputBrand />
        <Button size="xs" variant="ghost" onClick={backToStudio}>
          back to editing
        </Button>
      </header>
      <section className="render-content" aria-label="export progress">
        <motion.div
          className="render-frame"
          data-output-frame
          data-dimmed={!latest || failed || undefined}
          style={{ aspectRatio: `${width}/${height}` }}
          animate={done && !reduced ? { scale: [1, 1.03, 1] } : { scale: 1 }}
          transition={{ duration: renderTiming.completion / 1000 }}
        >
          <AnimatePresence initial={false}>
            {latest ? (
              <motion.div
                className="render-frame-image"
                key={latest.url}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration:
                    (reduced
                      ? renderTiming.completionReduced
                      : renderTiming.frameFade) / 1000,
                }}
              >
                <Image
                  src={latest.url}
                  alt="most recently exported frame"
                  fill
                  sizes="640px"
                  unoptimized
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
        <div
          className="render-progress"
          role="progressbar"
          aria-label="export progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          data-done={done || undefined}
          data-failed={failed || undefined}
        >
          <div style={{ transform: `scaleX(${progress})` }} />
        </div>
        <div className="render-statistics">
          <span>
            frame {frame} of {totalFrames}
          </span>
          <span>
            {done
              ? download
                ? `${(download.size / 1024 ** 2).toFixed(1)} MB · ${format?.extension ?? job?.format ?? 'mp4'}`
                : ''
              : `about ${videoTime(eta)} left`}
          </span>
        </div>
        {failed ? (
          <div className="render-failure" role="alert">
            <h1>the export hit a problem</h1>
            <p>{error}</p>
            <div className="agent-button-row">
              <Button variant="primary" onClick={() => job && void start(job)}>
                try again
              </Button>
              <Button onClick={backToStudio}>back to editing</Button>
            </div>
          </div>
        ) : done && download ? (
          <div className="render-failure" role="status">
            <h1>your video is ready</h1>
            <p>
              save it now. kimo doesn’t keep a copy, and it disappears when you
              close this tab.
            </p>
            <div className="agent-button-row">
              <a
                className="ui-button ui-button-primary ui-size-md"
                href={download.url}
                download={download.name}
                data-export-download
              >
                <span className="ui-button-label">download video</span>
              </a>
              <Button onClick={backToStudio}>back to editing</Button>
            </div>
          </div>
        ) : (
          <div className="render-stage-wrap">
            <AnimatePresence initial={false}>
              <motion.h1
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: durations['dur-3'] }}
                className="render-stage"
                key={stage(progress)}
                aria-live="polite"
              >
                {stage(progress)}
              </motion.h1>
            </AnimatePresence>
          </div>
        )}
        <div className="render-filmstrip" aria-label="exported frames">
          {frames.map((item, index) => (
            <motion.div
              key={`${item.n}-${index}`}
              initial={{ x: reduced ? 0 : 24, opacity: reduced ? 1 : 0 }}
              animate={{
                x: 0,
                opacity: 0.4 + ((index + 1) / frames.length) * 0.6,
              }}
              transition={
                reduced ? { duration: durations['dur-2'] } : springs.snappy
              }
            >
              <Image
                src={item.url}
                alt={`exported frame ${item.n}`}
                width={64}
                height={36}
                unoptimized
              />
            </motion.div>
          ))}
        </div>
      </section>
      <div className="render-return-note">
        <p>
          your video is made right here in your browser. keep this tab open and
          in front while it exports.
        </p>
      </div>
      {done ? (
        <span className="sr-only" role="status">
          export complete
        </span>
      ) : null}
    </main>
  );
}
