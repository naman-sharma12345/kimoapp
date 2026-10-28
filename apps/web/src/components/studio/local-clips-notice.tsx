'use client';
import { useEffect, useRef, useState } from 'react';
import type { Asset } from '@kimo/client';
import { Button } from '@/components/ui/button';
import {
  missingAssets,
  onLocalMediaChange,
  relinkFiles,
} from '@/lib/local-media';

export const CLIPS_WARNING =
  'your clips only live in this tab. export before you close or refresh, or you’ll need to add them again.';

function dismissKey(sessionId: string) {
  return `kimo.clips-warning.${sessionId}`;
}

/**
 * The studio's two calm notes about media living only in this tab: a
 * reminder once clips are here (dismissible, back next session), and a
 * prompt to add the clips again when a reopened project has none.
 */
export function LocalClipsNotice({
  sessionId,
  assets,
  hasClips,
}: {
  sessionId: string;
  assets: readonly Asset[];
  hasClips: boolean;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [dismissed, setDismissed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(dismissKey(sessionId)) === '1');
    } catch {
      setDismissed(false);
    }
  }, [sessionId]);
  // Newly imported clips bring the reminder back.
  useEffect(
    () =>
      onLocalMediaChange(() => {
        setDismissed(false);
        try {
          sessionStorage.removeItem(dismissKey(sessionId));
        } catch {
          /* Optional. */
        }
      }),
    [sessionId],
  );
  const missing = missingAssets(assets);
  const relink = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    try {
      const { matched, unmatched } = await relinkFiles(files, assets);
      setResult(
        unmatched.length
          ? `added ${matched}. ${unmatched.length === 1 ? `${unmatched[0]} doesn’t` : `${unmatched.length} files don’t`} match a clip in this project.`
          : matched
            ? ''
            : 'those files don’t match the clips in this project.',
      );
    } finally {
      setBusy(false);
    }
  };
  if (missing.length)
    return (
      <div className="studio-local-notice" role="status" data-relink>
        <p>
          add your clips again to keep editing
          <small>
            kimo doesn’t keep your videos, so{' '}
            {missing.length === 1
              ? 'one clip is'
              : `${missing.length} clips are`}{' '}
            waiting:{' '}
            {missing
              .slice(0, 3)
              .map((asset) => asset.name)
              .join(', ')}
            {missing.length > 3 ? '…' : ''}. we match them by name and length.
            {result ? ` ${result}` : ''}
          </small>
        </p>
        <div className="studio-local-notice-actions">
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            accept="video/*,audio/*,image/*"
            aria-label="add your clips again"
            onChange={(event) => {
              void relink(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
          <Button
            size="sm"
            variant="primary"
            loading={busy}
            onClick={() => picker.current?.click()}
          >
            add clips
          </Button>
        </div>
      </div>
    );
  if (!hasClips || dismissed) return null;
  return (
    <div className="studio-local-notice" role="status" data-clips-warning>
      <p>{CLIPS_WARNING}</p>
      <div className="studio-local-notice-actions">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setDismissed(true);
            try {
              sessionStorage.setItem(dismissKey(sessionId), '1');
            } catch {
              /* Dismissal lasts for this view only. */
            }
          }}
        >
          got it
        </Button>
      </div>
    </div>
  );
}
