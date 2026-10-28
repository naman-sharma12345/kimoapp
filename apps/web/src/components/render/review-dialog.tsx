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
  onApprove: (captions: boolean, poster?: string) => Promise<void>;
}) {
  const hasCaptions = Object.values(project.clips).some(
    (clip) =>
      Boolean(clip.text?.words?.length) ||
      Boolean(clip.text?.style.startsWith('caption')),
  );
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
      await onApprove(captions, poster);
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
            : 'review your video before the final 1080p render.'
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
              {acting ? 'render now' : 'render 1080p'}
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
              value={`1080p · ${project.width < project.height ? '9:16' : '16:9'} · ${project.fps} fps · mp4`}
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
