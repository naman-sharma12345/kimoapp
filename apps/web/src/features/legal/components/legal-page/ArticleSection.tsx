import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Link as LinkIcon } from 'lucide-react';
import { DUR_2, DUR_3, EASE_OUT } from '../../lib/motion';
import { parseInlineLinks } from '../../utils/legal-helpers';
import type { LegalSection } from '../../types/legal-page';

export interface ArticleSectionProps {
  section: LegalSection;
  onCopyAnchor: (sectionId: string) => void;
  registerSectionRef: (sectionId: string, element: HTMLElement | null) => void;
}

export const ArticleSection: React.FC<ArticleSectionProps> = ({
  section,
  onCopyAnchor,
  registerSectionRef,
}) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.section
      id={section.id}
      ref={(el) => registerSectionRef(section.id, el)}
      aria-labelledby={`heading-${section.id}`}
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      whileInView={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{
        duration: prefersReducedMotion ? DUR_2 : DUR_3,
        ease: EASE_OUT,
      }}
      className="scroll-mt-[var(--space-96)] pt-[var(--space-48)]"
    >
      <div className="group relative flex items-center mb-[var(--space-12)]">
        <h2
          id={`heading-${section.id}`}
          className="t-20 text-[var(--cream-100)] m-0"
        >
          {section.heading}
        </h2>
        <button
          type="button"
          onClick={() => onCopyAnchor(section.id)}
          aria-label={`copy link to ${section.heading}`}
          className="w-[var(--h-28)] h-[var(--h-28)] rounded-[var(--r-6)] inline-flex items-center justify-center text-[var(--cream-60)] hover:text-[var(--cream-100)] opacity-70 lg:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-[var(--dur-1)] cursor-pointer ml-[var(--space-8)] lg:ml-0 lg:absolute lg:-left-[var(--space-28)] shrink-0"
        >
          <LinkIcon size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-col gap-[var(--space-16)]">
        {section.paragraphs.map((paragraph, pIndex) => {
          const segments = parseInlineLinks(paragraph);
          return (
            <p
              key={pIndex}
              className="t-15-body text-[var(--cream-60)] m-0 max-w-[68ch]"
            >
              {segments.map((seg, sIndex) => {
                if (seg.type === 'link' && seg.href) {
                  return (
                    <a
                      key={sIndex}
                      href={seg.href}
                      target={seg.external ? '_blank' : undefined}
                      rel={seg.external ? 'noopener noreferrer' : undefined}
                      className="kimo-inline-link"
                    >
                      {seg.text}
                    </a>
                  );
                }
                return <React.Fragment key={sIndex}>{seg.text}</React.Fragment>;
              })}
            </p>
          );
        })}
      </div>
    </motion.section>
  );
};
