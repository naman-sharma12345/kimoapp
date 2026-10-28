'use client';
import { useRef, useState, useEffect } from 'react';
import type { Clip, Op, KimoProject } from '@kimo/client';
import { textStyle } from '@kimo/compositor/text-styles';
export function ViewerTextEditor({
  clip,
  project,
  onEdit,
  onDraft,
  onInteraction,
}: {
  clip: Clip;
  project: KimoProject;
  onEdit: (ops: Op[]) => void;
  onDraft: (clip: Clip | null) => void;
  onInteraction: (active: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [scale, setScale] = useState(1);
  const root = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const canceled = useRef(false);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setScale(el.clientWidth / project.width),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [project.width]);
  useEffect(
    () => () => {
      onDraft(null);
      onInteraction(false);
    },
    [onDraft, onInteraction],
  );
  const spec = textStyle(clip.text?.style ?? 'caption-clean');
  function finish() {
    if (!editing) return;
    const content = field.current?.innerText ?? '';
    setEditing(false);
    onDraft(null);
    onInteraction(false);
    if (!canceled.current && content !== clip.text?.content)
      onEdit([{ op: 'text.update', clipId: clip.id, content }]);
    canceled.current = false;
  }
  return (
    <div className="editor-viewer-text" ref={root}>
      <div
        className="editor-viewer-text-position"
        style={{
          left: `${50 + (clip.transform.x / project.width) * 100}%`,
          top: `${(spec.position === 'bottom' ? 88 : 50) + (clip.transform.y / project.height) * 100}%`,
          fontFamily: spec.family,
          fontSize: spec.size * scale * clip.transform.scale,
          transform: `translate(-50%, -50%) rotate(${clip.transform.rotation}deg)`,
        }}
      >
        {editing ? (
          <div
            ref={field}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-label="edit viewer text"
            tabIndex={0}
            onBlur={finish}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                canceled.current = true;
                event.currentTarget.blur();
              }
              if (
                event.key === 'Enter' &&
                clip.text?.style.startsWith('caption')
              ) {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          >
            {clip.text?.content}
          </div>
        ) : (
          <button
            className="editor-viewer-text-trigger"
            aria-label="edit selected text in viewer"
            onDoubleClick={() => {
              setEditing(true);
              onInteraction(true);
              if (clip.text)
                onDraft({ ...clip, text: { ...clip.text, content: '' } });
              requestAnimationFrame(() => field.current?.focus());
            }}
          >
            edit text
          </button>
        )}
      </div>
    </div>
  );
}
