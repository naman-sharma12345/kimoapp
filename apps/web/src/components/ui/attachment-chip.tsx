'use client';
import { forwardRef, type HTMLAttributes } from 'react';
import Image from 'next/image';
import { Check, FileText, Film, Play, X } from 'lucide-react';
import { uiClassName } from '../../lib/variants';
import { Tooltip } from './tooltip';

export type AttachmentChipProps = HTMLAttributes<HTMLDivElement> & {
  name: string;
  meta: string;
  kind: 'video' | 'image' | 'audio' | 'doc';
  thumbnail?: string;
  progress?: number;
  onRemove?: () => void;
  status?: 'queued' | 'probing' | 'uploading' | 'done' | 'error' | 'canceled';
  waveform?: Float32Array;
  onRetry?: () => void;
};
const bars = [4, 8, 12, 6, 16, 20, 12, 24, 16, 8, 12, 4];
export const AttachmentChip = forwardRef<HTMLDivElement, AttachmentChipProps>(
  function AttachmentChip(
    {
      name,
      meta,
      kind,
      thumbnail,
      progress,
      onRemove,
      status,
      waveform,
      onRetry,
      className,
      ...props
    },
    ref,
  ) {
    const pct =
      progress === undefined ? undefined : Math.min(1, Math.max(0, progress));
    return (
      <div
        ref={ref}
        className={uiClassName('ui-attachment', className)}
        data-status={status}
        data-kind={kind}
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
                  style={{
                    height: waveform
                      ? `${Math.max(2, Math.round((waveform[Math.floor((index * 64) / bars.length)] ?? 0) * 24))}px`
                      : `var(--space-${height})`,
                  }}
                />
              ))}
            </span>
          ) : kind === 'video' ? (
            <Film size={16} strokeWidth={1.5} />
          ) : (
            <FileText size={16} strokeWidth={1.5} />
          )}
          {kind === 'video' ? (
            <Play className="ui-attachment-play" strokeWidth={1.5} />
          ) : null}
        </span>
        <span className="ui-attachment-copy">
          <span className="ui-attachment-name-row">
            <span className="ui-attachment-name" title={name}>
              {name}
            </span>
            {status === 'done' ? (
              <Check
                className="ui-attachment-check"
                size={12}
                strokeWidth={1.5}
                aria-hidden="true"
              />
            ) : null}
          </span>
          <span className="ui-attachment-meta">
            {status === 'error' ? (
              <>
                failed ·{' '}
                <button
                  type="button"
                  className="ui-attachment-retry"
                  onClick={onRetry}
                  aria-label={`retry ${name}`}
                >
                  retry
                </button>
              </>
            ) : (
              meta
            )}
          </span>
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
