'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  CLIP_PREP_TITLE,
  STAGE_LABEL,
  clipPrepServerSnapshot,
  clipPrepSnapshot,
  isPreparing,
  overallProgress,
  subscribeClipPrep,
} from '@/lib/clip-prep';

/**
 * Shows each clip getting ready in this tab (reading, thumbnails, audio
 * analysis) with an overall bar. Dismissible; new clips bring it back.
 */
export function ClipPrepPanel() {
  const clips = useSyncExternalStore(
    subscribeClipPrep,
    clipPrepSnapshot,
    clipPrepServerSnapshot,
  );
  const [dismissed, setDismissed] = useState(false);
  const seen = useRef(0);
  useEffect(() => {
    if (clips.length > seen.current) setDismissed(false);
    seen.current = clips.length;
  }, [clips.length]);
  if (dismissed || !isPreparing(clips)) return null;
  const ready = clips.filter((clip) => clip.stage === 'ready').length;
  return (
    <section
      className="studio-clip-prep"
      aria-label="getting your clips ready"
      data-clip-prep
    >
      <header>
        <p role="status" aria-live="polite">
          {CLIP_PREP_TITLE}
          <small>
            {ready}/{clips.length} ready
          </small>
        </p>
        <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
          keep working
        </Button>
      </header>
      <Progress label="all clips" value={overallProgress(clips)} />
      <ul>
        {clips.map((clip) => (
          <li key={clip.assetId} data-stage={clip.stage}>
            <span className="studio-clip-prep-name" title={clip.name}>
              {clip.name}
            </span>
            <span className="studio-clip-prep-stage">
              {STAGE_LABEL[clip.stage]}
            </span>
            <Progress thin label={clip.name} value={clip.progress} />
          </li>
        ))}
      </ul>
    </section>
  );
}
