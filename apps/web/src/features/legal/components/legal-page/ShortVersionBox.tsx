import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { DUR_2, DUR_4, EASE_OUT } from '../../lib/motion';

export interface ShortVersionBoxProps {
  items: string[];
  onEntered?: () => void;
}

export const ShortVersionBox: React.FC<ShortVersionBoxProps> = ({
  items,
  onEntered,
}) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.section
      aria-label="the short version"
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{
        duration: prefersReducedMotion ? DUR_2 : DUR_4,
        ease: EASE_OUT,
        delay: prefersReducedMotion ? 0 : 0.06,
      }}
      onAnimationComplete={() => {
        if (onEntered) {
          onEntered();
        }
      }}
      className="rounded-[var(--r-12)] bg-[var(--ink-1)] border border-[var(--line)] py-[var(--space-20)] px-[var(--space-24)]"
    >
      <div className="t-11 text-[var(--cream-38)] mb-[var(--space-12)]">
        the short version
      </div>
      <ul className="list-none m-0 p-0 flex flex-col gap-[var(--space-8)]">
        {items.map((line, index) => (
          <li
            key={index}
            className="flex items-start gap-[var(--space-12)] t-15 text-[var(--cream-100)]"
          >
            <span
              aria-hidden="true"
              className="w-[4px] h-[4px] bg-[var(--cream-60)] shrink-0 mt-[9px]"
            />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </motion.section>
  );
};
