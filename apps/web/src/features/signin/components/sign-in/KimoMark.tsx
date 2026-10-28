import { motion, useReducedMotion } from 'motion/react';
import { EASE } from '../../lib/motion';

export interface KimoMarkProps {
  size?: number;
  animatedMeter?: boolean;
  className?: string;
}

/**
 * The kimo mark: nine cream bars of symmetric heights
 * (tall, tall, medium, short, shortest at center, then mirrored),
 * bottom-aligned, with an orange vertical playhead line crossing the
 * center bar topped by a downward triangle. Matches the brand logo asset.
 */
const BAR_WIDTH = 1.8;
const BAR_GAP = 0.82;
const BOTTOM_Y = 20;
const HEIGHTS = [15, 15, 11, 8.5, 6, 8.5, 11, 15, 15] as const;
const TOTAL_WIDTH = HEIGHTS.length * BAR_WIDTH + (HEIGHTS.length - 1) * BAR_GAP;
const X0 = (24 - TOTAL_WIDTH) / 2;
const CENTER_X = 12;

export function KimoMark({
  size = 20,
  animatedMeter = false,
  className = '',
}: KimoMarkProps) {
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = animatedMeter && !prefersReducedMotion;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      style={{ flexShrink: 0 }}
    >
      {HEIGHTS.map((baseHeight, index) => {
        const x = +(X0 + index * (BAR_WIDTH + BAR_GAP)).toFixed(2);
        const minH = +(baseHeight * 0.45).toFixed(2);
        const maxH = baseHeight;
        const maxY = +(BOTTOM_Y - minH).toFixed(2);
        const minY = +(BOTTOM_Y - maxH).toFixed(2);

        if (shouldAnimate) {
          return (
            <motion.rect
              key={index}
              x={x}
              width={BAR_WIDTH}
              rx={BAR_WIDTH / 2}
              fill="var(--cream-100)"
              initial={{ y: minY, height: maxH }}
              animate={{
                y: [minY, maxY, minY],
                height: [maxH, minH, maxH],
              }}
              transition={{
                duration: 0.6,
                ease: EASE.easeInOut,
                repeat: Infinity,
                delay: Math.abs(index - 4) * 0.07,
              }}
            />
          );
        }

        return (
          <rect
            key={index}
            x={x}
            y={minY}
            width={BAR_WIDTH}
            height={maxH}
            rx={BAR_WIDTH / 2}
            fill="var(--cream-100)"
          />
        );
      })}

      {/* Orange playhead line through the center bar */}
      <rect
        x={CENTER_X - 0.7}
        y={4.6}
        width={1.4}
        height={17}
        rx={0.7}
        fill="var(--orange)"
      />

      {/* Downward triangle capping the playhead */}
      <path
        d={`M${CENTER_X - 2.2} 2.4 L${CENTER_X + 2.2} 2.4 L${CENTER_X} 5 Z`}
        fill="var(--orange)"
      />
    </svg>
  );
}
