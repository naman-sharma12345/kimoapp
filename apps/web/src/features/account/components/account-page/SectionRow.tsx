import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { dur, ease, stagger } from '../../lib/motion';

export interface SectionRowProps {
  title: string;
  description?: string;
  index: number;
  isFirst?: boolean;
  onAnimationComplete?: () => void;
  children: ReactNode;
}

export function SectionRow({
  title,
  description,
  index,
  isFirst = false,
  onAnimationComplete,
  children,
}: SectionRowProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.section
      aria-label={title}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{
        duration: reduceMotion ? dur.dur2 : dur.dur4,
        ease: ease.out,
        delay: (index + 1) * stagger.section,
      }}
      onAnimationComplete={onAnimationComplete}
      className={`flex flex-col min-[769px]:flex-row min-[769px]:items-start gap-[var(--space-16)] min-[769px]:gap-[var(--space-32)] ${
        isFirst
          ? 'pb-[var(--space-32)]'
          : 'py-[var(--space-32)] border-t border-[var(--line)]'
      }`}
    >
      {/* Left column: 220px on desktop (>768px), stacked on <=768px */}
      <div className="w-full min-[769px]:w-[var(--w-section-label)] shrink-0">
        <h2 className="t-15 text-[var(--cream-100)] m-0">{title}</h2>
        {description ? (
          <p className="t-12 text-[var(--cream-38)] mt-[var(--space-4)] mb-0">
            {description}
          </p>
        ) : null}
      </div>

      {/* Right column: controls */}
      <div className="flex-1 min-w-0">{children}</div>
    </motion.section>
  );
}
