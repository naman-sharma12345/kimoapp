'use client';
import { useEffect, useState, type ReactElement } from 'react';
import type { KimoProject } from '@kimo/client';
import Image from 'next/image';
import { AnimatePresence, motion } from 'motion/react';
import { Play } from 'lucide-react';
import { durations } from '@/lib/motion';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Row } from '@/components/ui/row';
import { Toggle } from '@/components/ui/toggle';
import { videoTime } from '@/lib/render';
export function ReviewDialog({
  open,
  onOpenChange,
  trigger,
  project,
  acting,
  summary,
  capture,
  onApprove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactElement;
  project: KimoProject;
  acting: boolean;
  summary: string;
  capture: () => Promise<string | undefined>;
  onApprove: (
    captions: boolean,
    poster?: string,
    options?: {
      resolution: '1080p' | '720p';
      format: 'mp4' | 'webm';
      alsoVertical: boolean;
    },
  ) => Promise<void>;
}) {
  const hasCaptions = Object.values(project.clips).some(
    (clip) =>
      Boolean(clip.text?.words?.length) ||
      Boolean(clip.text?.style.startsWith('caption')),
  );
  const [resolution, setResolution] = useState<'1080p' | '720p'>('1080p');
  const [format, setFormat] = useState<'mp4' | 'webm'>('mp4');
  const [alsoVertical, setAlsoVertical] = useState(false);
  const [captions, setCaptions] = useState(hasCaptions);
  const [poster, setPoster] = useState<string>();
  const [captureError, setCaptureError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setCaptions(hasCaptions);
    setPoster(undefined);
    setCaptureError(false);
    setError('');
    void capture()
      .then((value) => {
        if (alive) {
          setPoster(value);
          setCaptureError(!value);
        }
      })
      .catch(() => {
        if (alive) setCaptureError(true);
      });
    return () => {
      alive = false;
    };
  }, [open, hasCaptions, capture]);
  const approve = async () => {
    setBusy(true);
    setError('');
    try {
      await onApprove(captions, poster, { resolution, format, alsoVertical });
    } catch {
      setError('could not start the render · try again');
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
      trigger={trigger}
    >
      <DialogContent
        size="md"
        title={acting ? 'render now?' : 'ready to render?'}
        description={
          acting
            ? `kimo is still working on: ${summary}. you can render now or let it finish.`
            : `review your video before the final ${resolution} render.`
        }
        actions={
          <div className="agent-button-row">
            <DialogClose asChild>
              <Button disabled={busy}>
                {acting ? 'let kimo finish' : 'keep editing'}
              </Button>
            </DialogClose>
            <Button
              variant="primary"
              loading={busy}
              onClick={() => void approve()}
            >
              {acting ? 'render now' : `render ${resolution}`}
            </Button>
          </div>
        }
      >
        {!acting ? (
          <>
            <div className="review-poster">
              {poster ? (
                <Image
                  src={poster}
                  alt="current cut at 0:01"
                  width={640}
                  height={360}
                  unoptimized
                />
              ) : (
                <span role="status">
                  {captureError
                    ? 'preview frame unavailable'
                    : 'preparing the preview…'}
                </span>
              )}
            </div>
            <Row label="length" value={videoTime(project.duration)} />
            <Row
              label="format"
              value={`${resolution} · ${project.width === project.height ? '1:1' : project.width < project.height ? '9:16' : '16:9'} · ${project.fps} fps · ${format}`}
            />
            <Row label="audio" value="stereo · 48 kHz" />
            <Row
              label="burn in captions"
              value={
                <Toggle
                  aria-label="burn in captions"
                  checked={captions}
                  onCheckedChange={setCaptions}
                />
              }
            />
          </>
        ) : null}
        <details className="launch-export">
          <summary>more options</summary>
          <label>
            resolution
            <select
              className="launch-select"
              aria-label="resolution"
              value={resolution}
              disabled={busy}
              onChange={(e) =>
                setResolution(e.target.value === '720p' ? '720p' : '1080p')
              }
            >
              <option>1080p</option>
              <option>720p</option>
            </select>
          </label>
          <label>
            format
            <select
              className="launch-select"
              aria-label="format"
              value={format}
              disabled={busy}
              onChange={(e) =>
                setFormat(e.target.value === 'webm' ? 'webm' : 'mp4')
              }
            >
              <option>mp4</option>
              <option>webm</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={alsoVertical}
              disabled={busy || project.width < project.height}
              onChange={(e) => setAlsoVertical(e.target.checked)}
            />
            also export 9:16 version
          </label>
        </details>
        {error ? (
          <p className="render-error-copy" role="alert">
            {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function WatchFirstCut({
  visible,
  onHover,
  onPlay,
}: {
  visible: boolean;
  onHover: (hovered: boolean) => void;
  onPlay: () => void;
}) {
  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="review-watch"
          className="review-watch"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: durations['dur-3'] }}
          onMouseEnter={() => onHover(true)}
          onMouseLeave={() => onHover(false)}
        >
          <button
            className="review-watch-button"
            aria-label="watch the first cut"
            onClick={onPlay}
            onFocus={() => onHover(true)}
            onBlur={() => onHover(false)}
          >
            <Play size={20} aria-hidden />
          </button>
          <span>watch the first cut</span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
