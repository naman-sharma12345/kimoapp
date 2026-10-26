'use client';
import { forwardRef, type HTMLAttributes } from 'react';
import Image from 'next/image';
import { FileText, Play, X } from 'lucide-react';
import { uiClassName } from '../../lib/variants';
import { Tooltip } from './tooltip';

export type AttachmentChipProps = HTMLAttributes<HTMLDivElement> & {
  name: string;
  meta: string;
  kind: 'video' | 'image' | 'audio' | 'doc';
  thumbnail?: string;
  progress?: number;
  onRemove?: () => void;
};
const bars = [4, 8, 12, 6, 16, 20, 12, 24, 16, 8, 12, 4];
export const AttachmentChip = forwardRef<HTMLDivElement, AttachmentChipProps>(
  function AttachmentChip(
    { name, meta, kind, thumbnail, progress, onRemove, className, ...props },
    ref,
  ) {
    const pct =
      progress === undefined ? undefined : Math.min(1, Math.max(0, progress));
    return (
      <div
        ref={ref}
        className={uiClassName('ui-attachment', className)}
        {...props}
      >
        <span className="ui-attachment-thumb" aria-hidden="true">
          {thumbnail && (kind === 'video' || kind === 'image') ? (
            <Image src={thumbnail} alt="" width={32} height={32} unoptimized />
          ) : kind === 'audio' ? (
            <span className="ui-mini-wave">
              {bars.map((height, index) => (
                <span
                  key={index}
                  style={{ height: `var(--space-${height})` }}
                />
              ))}
            </span>
          ) : (
            <FileText size={16} strokeWidth={1.5} />
          )}
          {kind === 'video' ? (
            <Play className="ui-attachment-play" strokeWidth={1.5} />
          ) : null}
        </span>
        <span className="ui-attachment-copy">
          <span className="ui-attachment-name" title={name}>
            {name}
          </span>
          <span className="ui-attachment-meta">{meta}</span>
        </span>
        {onRemove ? (
          <Tooltip content={`remove ${name}`}>
            <button
              type="button"
              className="ui-attachment-remove"
              onClick={onRemove}
              aria-label={`remove ${name}`}
            >
              <X size={14} strokeWidth={1.5} />
            </button>
          </Tooltip>
        ) : null}
        {pct !== undefined ? (
          <span
            className="ui-attachment-progress"
            role="progressbar"
            aria-label={`upload ${name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct * 100)}
            data-complete={pct === 1 || undefined}
          >
            <span style={{ width: `${pct * 100}%` }} />
          </span>
        ) : null}
      </div>
    );
  },
);
