import { motion, useReducedMotion } from 'motion/react';
import { ease, loop } from '../../lib/motion';

// Same geometry as the kimo logo (public/brand/kimo-mark.svg).
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

/**
 * Offline illustration: the kimo logo at 48px whose bars sit at 30% height and
 * slowly try to rise (to 60% and back), like a level meter with weak signal.
 */
export function OfflineIllustration() {
  const shouldReduceMotion = Boolean(useReducedMotion());
  return (
    <div
      data-testid="offline-illustration"
      role="img"
      aria-label="offline signal level meter"
      style={{
        width: '48px',
        height: '48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width="48" height="48" viewBox="96 88 832 832" aria-hidden="true">
        {BARS.map((bar, index) => (
          <motion.rect
            key={bar.x}
            x={bar.x}
            y={bar.y}
            width={56}
            height={BOTTOM - bar.y}
            rx={14}
            fill="var(--cream-100)"
            style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}
            initial={{ scaleY: 0.3 }}
            animate={
              shouldReduceMotion ? { scaleY: 0.3 } : { scaleY: [0.3, 0.6, 0.3] }
            }
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : {
                    duration: loop.offlineBarCycleSec,
                    ease: ease.inOut,
                    repeat: Infinity,
                    delay: Math.abs(4 - index) * loop.offlineBarStaggerSec,
                  }
            }
          />
        ))}
        <rect x={506} y={110} width={12} height={794} fill="var(--cream-38)" />
        <path d="M480 96h64v8l-32 36l-32 -36z" fill="var(--cream-38)" />
      </svg>
    </div>
  );
}
