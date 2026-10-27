'use client';
import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import Image from 'next/image';
import { FileText, Film, X } from 'lucide-react';
import { motion } from 'motion/react';
import { Tooltip } from '@/components/ui/tooltip';
import { warmupBar } from '@/lib/motion';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import type { WarmupStep } from '@/lib/warmup/state';

export type ReelAsset = {
  assetId: string;
  name: string;
  kind: 'video' | 'image' | 'audio' | 'doc';
  thumbnail?: string;
  waveform?: Float32Array;
  localId?: string;
};
export function assetTransitionName(id: string) {
  return `kimo-asset-${Array.from(id, (char) => char.codePointAt(0)?.toString(16) ?? '0').join('-')}`;
}
const TILE_WIDTH = 102;
const REEL_SPEED = 24;
function Tile({
  item,
  index,
  original,
  shared,
  onRemove,
}: {
  item: ReelAsset | null;
  index: number;
  original: boolean;
  shared: boolean;
  onRemove?: (localId: string) => void;
}) {
  const wave = item?.waveform;
  return (
    <div
      className="warmup-tile"
      data-reel-tile={index}
      style={{
        viewTransitionName:
          shared && original && item
            ? assetTransitionName(item.assetId)
            : undefined,
      }}
    >
      {!item ? (
        <span className="warmup-tile-skeleton" />
      ) : item.thumbnail && (item.kind === 'video' || item.kind === 'image') ? (
        <Image src={item.thumbnail} alt="" width={96} height={54} unoptimized />
      ) : item.kind === 'audio' ? (
        <span className="warmup-tile-wave" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <span
              key={i}
              style={{
                height: `${Math.max(2, Math.round((wave?.[Math.floor((i * 64) / 12)] ?? 0.25) * 32))}px`,
              }}
            />
          ))}
        </span>
      ) : item.kind === 'video' ? (
        <Film size={16} aria-hidden="true" />
      ) : (
        <FileText size={16} aria-hidden="true" />
      )}
      {item?.localId && onRemove ? (
        <Tooltip content={`remove ${item.name}`}>
          <button
            className="warmup-tile-remove"
            aria-label={`remove ${item.name}`}
            aria-hidden={!original || undefined}
            tabIndex={original ? 0 : -1}
            onClick={() => onRemove(item.localId ?? '')}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
}
export function WarmupReel({
  assets,
  step,
  progress,
  exiting,
  onRemove,
}: {
  assets: ReelAsset[];
  step: WarmupStep;
  progress: number;
  exiting: boolean;
  onRemove?: (localId: string) => void;
}) {
  const reduced = useReducedMotion();
  const track = useRef<HTMLDivElement>(null);
  const base = useMemo(
    () => (assets.length ? assets : Array<null>(6).fill(null)),
    [assets],
  );
  const count = Math.max(base.length, Math.ceil(4 / base.length) * base.length);
  const tiles = Array.from(
    { length: count },
    (_, index) => base[index % base.length] ?? null,
  );
  const distance = count * TILE_WIDTH;
  const style = {
    '--reel-length': `${distance}px`,
    '--reel-duration': `${distance / REEL_SPEED}s`,
  } as CSSProperties;
  useEffect(() => {
    const node = track.current;
    if (!node || reduced || exiting) return;
    let frame = 0;
    let previous: HTMLElement | undefined;
    const tick = () => {
      const time = node.getAnimations()[0]?.currentTime;
      if (typeof time === 'number') {
        const offset = ((time / 1000) * REEL_SPEED) % distance;
        const position = (node.parentElement?.clientWidth ?? 360) / 2 + offset;
        const index = Math.round((position - 48) / TILE_WIDTH);
        const delta = Math.abs(index * TILE_WIDTH + 48 - position);
        const tile =
          delta <= 4.8
            ? (node.querySelector<HTMLElement>(`[data-reel-tile="${index}"]`) ??
              undefined)
            : undefined;
        if (previous && previous !== tile) previous.style.filter = '';
        if (tile)
          tile.style.filter = `brightness(${1 + 0.25 * (1 - delta / 4.8)})`;
        previous = tile;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      if (previous) previous.style.filter = '';
    };
  }, [distance, exiting, reduced]);
  return (
    <div
      className="warmup-reel"
      role="group"
      aria-label="your media reel"
      style={style}
    >
      <div className="warmup-strip" data-reel-strip>
        <div
          className="warmup-track"
          ref={track}
          data-stopped={exiting || undefined}
        >
          {[0, 1].map((copy) => (
            <div
              className="warmup-segment"
              key={copy}
              aria-hidden={copy === 1 || undefined}
            >
              <svg
                className="warmup-holes"
                width={distance}
                height="64"
                aria-hidden="true"
              >
                {Array.from({ length: Math.ceil(distance / 12) }, (_, i) => (
                  <g key={i}>
                    <rect x={i * 12} y="1" width="4" height="3" rx="1" />
                    <rect x={i * 12} y="60" width="4" height="3" rx="1" />
                  </g>
                ))}
              </svg>
              {tiles.map((item, index) => (
                <Tile
                  key={`${copy}-${index}`}
                  item={item}
                  index={copy * count + index}
                  original={copy === 0 && index < base.length}
                  shared={exiting}
                  onRemove={onRemove}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <svg
        className="warmup-playhead"
        data-reel-playhead
        viewBox="0 0 7 80"
        aria-hidden="true"
      >
        <path d="M3.5 6v74" stroke="currentColor" strokeWidth="1.5" />
        <path d="M0 0h7L3.5 7z" fill="currentColor" />
      </svg>
      <div
        className="warmup-bars"
        data-reel-bars
        data-step={step}
        aria-hidden="true"
      >
        {Array.from({ length: 9 }, (_, index) => (
          <motion.span
            key={index}
            className="warmup-bar"
            style={{ '--bar-index': index } as CSSProperties}
            {...warmupBar(step, progress, index, reduced)}
          />
        ))}
        <svg
          className="warmup-logo-playhead"
          viewBox="0 0 64 794"
          aria-hidden="true"
        >
          <path d="M26 0h12v794H26zM0 0h64v8L32 44 0 8z" fill="currentColor" />
        </svg>
      </div>
    </div>
  );
}
