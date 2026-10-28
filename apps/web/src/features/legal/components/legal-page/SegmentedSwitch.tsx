import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { DUR_2, EASE_OUT, spring } from '../../lib/motion';
import type { LegalDocType } from '../../types/legal-page';

export interface SegmentedSwitchProps {
  activeDoc: LegalDocType;
  onSelect: (doc: LegalDocType) => void;
}

const SEGMENTS: LegalDocType[] = ['privacy', 'terms'];

export const SegmentedSwitch: React.FC<SegmentedSwitchProps> = ({
  activeDoc,
  onSelect,
}) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div
      role="tablist"
      aria-label="legal document switch"
      className="inline-flex items-center h-[var(--h-32)] p-[var(--space-2)] rounded-[var(--r-8)] bg-[var(--ink-2)]"
    >
      {SEGMENTS.map((segment) => {
        const isActive = activeDoc === segment;
        return (
          <button
            key={segment}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => {
              if (!isActive) {
                onSelect(segment);
              }
            }}
            className={`relative h-[var(--h-28)] px-[var(--space-16)] rounded-[var(--r-6)] t-13 inline-flex items-center justify-center cursor-pointer select-none transition-colors duration-[var(--dur-1)] ${
              isActive
                ? 'text-[var(--cream-100)] font-medium'
                : 'text-[var(--cream-60)] hover:text-[var(--cream-100)]'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="legal-segment-active-bg"
                className="absolute inset-0 rounded-[var(--r-6)] bg-[var(--ink-4)]"
                transition={
                  prefersReducedMotion
                    ? { duration: DUR_2, ease: EASE_OUT }
                    : spring.snappy
                }
              />
            )}
            <span className="relative z-10">{segment}</span>
          </button>
        );
      })}
    </div>
  );
};
