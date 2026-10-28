import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { DUR_2, DUR_3, EASE_IN, EASE_OUT, spring } from '../../lib/motion';
import type { LegalSection } from '../../types/legal-page';

export interface TableOfContentsProps {
  sections: LegalSection[];
  activeSectionId: string;
  onSelectSection: (sectionId: string) => void;
  variant: 'desktop' | 'mobile';
  isOpen?: boolean;
  onToggleOpen?: () => void;
  forceVisibleOnDesktop?: boolean;
}

export const TableOfContents: React.FC<TableOfContentsProps> = ({
  sections,
  activeSectionId,
  onSelectSection,
  variant,
  isOpen = false,
  onToggleOpen,
  forceVisibleOnDesktop = false,
}) => {
  const prefersReducedMotion = useReducedMotion();

  if (variant === 'desktop') {
    return (
      <aside
        aria-label="table of contents"
        className={`hidden ${
          forceVisibleOnDesktop ? 'lg:hidden' : 'lg:block'
        } w-[200px] shrink-0`}
      >
        <nav className="sticky top-[var(--space-96)]">
          <ul className="relative border-l border-[var(--line)] list-none m-0 p-0">
            {sections.map((section) => {
              const isActive = activeSectionId === section.id;
              return (
                <li key={section.id} className="relative">
                  {isActive && (
                    <motion.span
                      layoutId="toc-active-indicator"
                      aria-hidden="true"
                      className="absolute -left-[1px] top-0 bottom-0 w-[2px] bg-[var(--cream-100)]"
                      transition={
                        prefersReducedMotion
                          ? { duration: DUR_2, ease: EASE_OUT }
                          : spring.soft
                      }
                    />
                  )}
                  <a
                    href={`#${section.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      onSelectSection(section.id);
                    }}
                    aria-current={isActive ? 'location' : undefined}
                    className={`flex items-center h-[var(--h-28)] pl-[var(--space-16)] pr-[var(--space-8)] t-13 rounded-r-[var(--r-6)] transition-colors duration-[var(--dur-1)] truncate ${
                      isActive
                        ? 'text-[var(--cream-100)]'
                        : 'text-[var(--cream-38)] hover:text-[var(--cream-60)]'
                    }`}
                  >
                    <span className="truncate">{section.heading}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    );
  }

  return (
    <div
      className={`${
        forceVisibleOnDesktop ? 'block' : 'block lg:hidden'
      } mb-[var(--space-24)]`}
    >
      <div className="rounded-[var(--r-8)] bg-[var(--ink-1)] border border-[var(--line)] overflow-hidden">
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={isOpen}
          aria-controls="mobile-toc-list"
          className="w-full h-[var(--h-40)] px-[var(--space-16)] flex items-center justify-between text-left t-13 text-[var(--cream-60)] hover:text-[var(--cream-100)] transition-colors duration-[var(--dur-1)] cursor-pointer rounded-[var(--r-8)]"
        >
          <span>on this page</span>
          <motion.span
            aria-hidden="true"
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{
              duration: prefersReducedMotion ? DUR_2 : DUR_3,
              ease: EASE_OUT,
            }}
            className="inline-flex items-center text-[var(--cream-38)]"
          >
            <ChevronDown size={14} strokeWidth={1.5} />
          </motion.span>
        </button>

        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.nav
              id="mobile-toc-list"
              aria-label="on this page"
              initial={{ opacity: 0, y: prefersReducedMotion ? 0 : -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -4 }}
              transition={{
                duration: prefersReducedMotion ? DUR_2 : DUR_3,
                ease: isOpen ? EASE_OUT : EASE_IN,
              }}
              className="px-[var(--space-16)] pb-[var(--space-12)] pt-[var(--space-4)] border-t border-[var(--line)]"
            >
              <ul className="relative border-l border-[var(--line)] list-none m-0 p-0">
                {sections.map((section) => {
                  const isActive = activeSectionId === section.id;
                  return (
                    <li key={section.id} className="relative">
                      {isActive && (
                        <span
                          aria-hidden="true"
                          className="absolute -left-[1px] top-0 bottom-0 w-[2px] bg-[var(--cream-100)]"
                        />
                      )}
                      <a
                        href={`#${section.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          onSelectSection(section.id);
                        }}
                        aria-current={isActive ? 'location' : undefined}
                        className={`flex items-center h-[var(--h-28)] pl-[var(--space-16)] pr-[var(--space-8)] t-13 rounded-r-[var(--r-6)] transition-colors duration-[var(--dur-1)] ${
                          isActive
                            ? 'text-[var(--cream-100)]'
                            : 'text-[var(--cream-38)] hover:text-[var(--cream-60)]'
                        }`}
                      >
                        <span className="truncate">{section.heading}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </motion.nav>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
