'use client';
import { motion, useReducedMotion } from 'motion/react';

/**
 * The official kimo logo (same geometry as public/brand/kimo-mark.svg):
 * nine cream bars, bottom aligned, with the orange playhead and its triangle.
 */
const BARS = [
  { x: 148, y: 200 },
  { x: 232, y: 200 },
  { x: 316, y: 300 },
  { x: 400, y: 400 },
  { x: 484, y: 500 },
  { x: 568, y: 400 },
  { x: 652, y: 300 },
  { x: 736, y: 200 },
  { x: 820, y: 200 },
] as const;
const BOTTOM = 824;

export type KimoLogoProps = {
  size?: number;
  /** Gently breathes the bars, like a level meter. Off under reduced motion. */
  animated?: boolean;
  className?: string;
  title?: string;
};

export function KimoLogo({
  size = 20,
  animated = false,
  className,
  title,
}: KimoLogoProps) {
  const reduced = useReducedMotion();
  const animate = animated && !reduced;
  return (
    <svg
      width={size}
      height={size}
      viewBox="96 88 832 832"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      style={{ flexShrink: 0 }}
    >
      {BARS.map((bar, i) => (
        <motion.rect
          key={bar.x}
          x={bar.x}
          y={bar.y}
          width={56}
          height={BOTTOM - bar.y}
          rx={14}
          fill="var(--cream-100)"
          style={{ transformOrigin: `${bar.x + 28}px ${BOTTOM}px` }}
          animate={animate ? { scaleY: [1, 0.86, 1] } : undefined}
          transition={
            animate
              ? {
                  duration: 1.6,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: Math.abs(4 - i) * 0.08,
                }
              : undefined
          }
        />
      ))}
      <rect x={506} y={110} width={12} height={794} fill="var(--orange)" />
      <path d="M480 96h64v8l-32 36l-32 -36z" fill="var(--orange)" />
    </svg>
  );
}
