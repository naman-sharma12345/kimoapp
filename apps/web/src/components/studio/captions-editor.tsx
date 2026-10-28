'use client';
import { useState } from 'react';
import type { Clip, KimoProject, Op } from '@kimo/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
export function CaptionsEditor({
  project,
  trackId,
  onEdit,
  onSeek,
  onInteraction,
}: {
  project: KimoProject;
  trackId: string;
  onEdit: (ops: Op[]) => void;
  onSeek: (time: number) => void;
  onInteraction: (active: boolean, ids?: string[]) => void;
}) {
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [open, setOpen] = useState(false);
  const clips = Object.values(project.clips)
    .filter((clip) => clip.trackId === trackId && clip.text)
    .sort((a, b) => a.start - b.start);
  const restyle = (patch: Partial<NonNullable<Clip['text']>>) =>
    onEdit(
      clips.flatMap((clip) =>
        clip.text
          ? [
              {
                op: 'clip.update' as const,
                id: clip.id,
                patch: { text: { ...clip.text, ...patch } },
              },
            ]
          : [],
      ),
    );
  return (
    <details open>
      <summary>captions editor</summary>
      <div className="editor-caption-tools">
        <Button size="xs" variant="ghost" onClick={() => setOpen(!open)}>
          find &amp; replace
        </Button>
        <label>
          style
          <select
            aria-label="caption style"
            onChange={(e) => restyle({ style: e.target.value })}
            defaultValue={clips[0]?.text?.style ?? 'caption-clean'}
          >
            {['caption-clean', 'caption-pop', 'caption-box'].map((style) => (
              <option key={style}>{style}</option>
            ))}
          </select>
        </label>
        <label>
          position
          <select
            aria-label="caption position"
            onChange={(e) =>
              restyle({
                position: e.target.value as 'bottom' | 'middle' | 'top',
              })
            }
            defaultValue={clips[0]?.text?.position ?? 'bottom'}
          >
            {['bottom', 'middle', 'top'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      {open ? (
        <div>
          <input
            aria-label="find caption text"
            value={find}
            onChange={(e) => setFind(e.target.value)}
          />
          <input
            aria-label="replace caption text"
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
          />
          <Button
            size="xs"
            disabled={!find}
            onClick={() =>
              onEdit(
                clips.map((clip) => ({
                  op: 'text.update',
                  clipId: clip.id,
                  content: (clip.text?.content ?? '').split(find).join(replace),
                })),
              )
            }
          >
            replace all
          </Button>
        </div>
      ) : null}
      <div className="editor-captions">
        {clips.map((clip) => (
          <div key={clip.id} className="editor-caption-row">
            <button
              aria-label={`seek caption ${clip.id}`}
              onClick={() => onSeek(clip.start)}
            >
              {String(Math.floor(clip.start / 60)).padStart(2, '0')}:
              {(clip.start % 60).toFixed(1).padStart(4, '0')}
            </button>
            <Textarea
              aria-label={`caption ${clip.id}`}
              key={`${clip.id}-${clip.text?.content}`}
              defaultValue={clip.text?.content}
              onFocus={() => {
                onSeek(clip.start);
                onInteraction(true, [clip.id]);
              }}
              onBlur={(e) => {
                onInteraction(false);
                if (e.target.value !== clip.text?.content)
                  onEdit([
                    {
                      op: 'text.update',
                      clipId: clip.id,
                      content: e.target.value,
                    },
                  ]);
              }}
            />
            <Button
              size="xs"
              variant="ghost"
              aria-label={`delete caption ${clip.id}`}
              onClick={() => onEdit([{ op: 'clip.remove', id: clip.id }])}
            >
              ×
            </Button>
          </div>
        ))}
      </div>
    </details>
  );
}
