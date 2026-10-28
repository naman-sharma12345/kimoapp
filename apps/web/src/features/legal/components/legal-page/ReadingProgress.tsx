import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { DUR_1, DUR_2, EASE_OUT } from '../../lib/motion';

export interface ReadingProgressProps {
  progress: number;
}

export const ReadingProgress: React.FC<ReadingProgressProps> = ({
  progress,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 h-[1px] z-40 pointer-events-none"
    >
      <motion.div
        className="h-full w-full bg-[var(--cream-60)] origin-left"
        initial={false}
        animate={
          prefersReducedMotion
            ? { opacity: clamped > 0 ? 1 : 0, scaleX: clamped }
            : { scaleX: clamped }
        }
        transition={{
          duration: prefersReducedMotion ? DUR_2 : DUR_1,
          ease: EASE_OUT,
        }}
      />
    </div>
  );
};
