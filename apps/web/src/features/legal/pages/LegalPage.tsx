/**
 * NEW COPY:
 * - aria-labels only for screen readers ("kimo home", "legal document switch", "table of contents", "copy link to <section>")
 * All visible UI copy is strictly from the prompt specification.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { DUR_2, DUR_3, DUR_4, EASE_OUT } from '../lib/motion';
import {
  buildSectionAnchorUrl,
  calculateReadingProgress,
  resolveLegalContent,
} from '../utils/legal-helpers';
import { ArticleSection } from '../components/legal-page/ArticleSection';
import { FilmGrain } from '../components/legal-page/FilmGrain';
import { KimoMark } from '../components/legal-page/KimoMark';
import { ReadingProgress } from '../components/legal-page/ReadingProgress';
import { SegmentedSwitch } from '../components/legal-page/SegmentedSwitch';
import { ShortVersionBox } from '../components/legal-page/ShortVersionBox';
import { TableOfContents } from '../components/legal-page/TableOfContents';
import { Toast } from '../components/legal-page/Toast';
import { TopBar } from '../components/legal-page/TopBar';
import type { LegalDocType, LegalPageProps } from '../types/legal-page';

export default function LegalPage({
  doc,
  onNavigate,
  content,
  onBack,
  onCopySectionLink,
  showStatesMode = false,
  mobileTocOpenOverride,
  onMobileTocToggle,
}: LegalPageProps) {
  const prefersReducedMotion = useReducedMotion();
  const activeContent = useMemo(
    () => resolveLegalContent(doc, content),
    [doc, content],
  );

  const [isReady, setIsReady] = useState<boolean>(false);
  const [hasCompletedInitialEntry, setHasCompletedInitialEntry] =
    useState<boolean>(false);
  const [scrollProgress, setScrollProgress] = useState<number>(0);
  const [activeSectionId, setActiveSectionId] = useState<string>(
    activeContent.sections[0]?.id ?? '',
  );
  const [internalMobileTocOpen, setInternalMobileTocOpen] =
    useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const toastTimerRef = useRef<number | null>(null);

  const isMobileTocOpen =
    mobileTocOpenOverride !== undefined
      ? mobileTocOpenOverride
      : internalMobileTocOpen;

  const handleToggleMobileToc = useCallback(() => {
    const next = !isMobileTocOpen;
    setInternalMobileTocOpen(next);
    if (onMobileTocToggle) {
      onMobileTocToggle(next);
    }
  }, [isMobileTocOpen, onMobileTocToggle]);

  // Move focus to the page heading on initial load and when switching docs
  useEffect(() => {
    const firstSectionId = activeContent.sections[0]?.id ?? '';
    setActiveSectionId(firstSectionId);
    const raf = window.requestAnimationFrame(() => {
      headingRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [doc, activeContent]);

  // Fallback timer for data-ready in case reduced motion or tab backgrounding skips animation callback
  useEffect(() => {
    if (isReady) return;
    const timer = window.setTimeout(() => {
      setIsReady(true);
      setHasCompletedInitialEntry(true);
    }, 520);
    return () => window.clearTimeout(timer);
  }, [isReady]);

  // Reading progress hairline calculation on scroll & resize
  useEffect(() => {
    const updateScrollProgress = () => {
      const docEl = document.documentElement;
      const scrollTop = window.scrollY || docEl.scrollTop;
      const scrollHeight = docEl.scrollHeight;
      const clientHeight = window.innerHeight || docEl.clientHeight;
      setScrollProgress(
        calculateReadingProgress(scrollTop, scrollHeight, clientHeight),
      );
    };

    updateScrollProgress();
    window.addEventListener('scroll', updateScrollProgress, { passive: true });
    window.addEventListener('resize', updateScrollProgress, { passive: true });
    return () => {
      window.removeEventListener('scroll', updateScrollProgress);
      window.removeEventListener('resize', updateScrollProgress);
    };
  }, [doc, activeContent]);

  // IntersectionObserver scroll-spy for TOC active section
  useEffect(() => {
    const elements: HTMLElement[] = [];
    activeContent.sections.forEach((sec) => {
      const el = sectionRefs.current.get(sec.id);
      if (el) {
        elements.push(el);
      }
    });

    if (elements.length === 0 || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const visibleMap = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = entry.target.getAttribute('id');
          if (!id) return;
          if (entry.isIntersecting) {
            visibleMap.set(id, entry.boundingClientRect.top);
          } else {
            visibleMap.delete(id);
          }
        });

        if (visibleMap.size > 0) {
          // Pick the topmost visible section in document order
          for (const sec of activeContent.sections) {
            if (visibleMap.has(sec.id)) {
              setActiveSectionId(sec.id);
              break;
            }
          }
        }
      },
      {
        rootMargin: '-88px 0px -55% 0px',
        threshold: [0, 0.2, 0.5, 1],
      },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [activeContent]);

  // Close mobile TOC on Escape key
  useEffect(() => {
    if (!isMobileTocOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setInternalMobileTocOpen(false);
        if (onMobileTocToggle) {
          onMobileTocToggle(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileTocOpen, onMobileTocToggle]);

  // Cleanup toast timer
  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const registerSectionRef = useCallback(
    (sectionId: string, element: HTMLElement | null) => {
      if (element) {
        sectionRefs.current.set(sectionId, element);
      } else {
        sectionRefs.current.delete(sectionId);
      }
    },
    [],
  );

  const handleSelectTocSection = useCallback(
    (sectionId: string) => {
      setActiveSectionId(sectionId);
      const targetEl = sectionRefs.current.get(sectionId);
      if (targetEl) {
        targetEl.scrollIntoView({
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
          block: 'start',
        });
      }
      if (window.history && window.history.replaceState) {
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${window.location.search}#${sectionId}`,
        );
      }
      if (mobileTocOpenOverride === undefined) {
        setInternalMobileTocOpen(false);
      }
    },
    [prefersReducedMotion, mobileTocOpenOverride],
  );

  const handleCopyAnchor = useCallback(
    async (sectionId: string) => {
      const fullUrl = buildSectionAnchorUrl(
        window.location.origin,
        doc,
        sectionId,
        window.location.search,
      );
      if (window.history && window.history.replaceState) {
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${window.location.search}#${sectionId}`,
        );
      }

      if (onCopySectionLink) {
        await onCopySectionLink(sectionId, fullUrl);
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(fullUrl);
        } catch {
          // Ignore clipboard errors in non-secure or headless contexts
        }
      }

      setToastMessage('link copied');
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      toastTimerRef.current = window.setTimeout(() => {
        setToastMessage(null);
      }, 2200);
    },
    [doc, onCopySectionLink],
  );

  const handleBack = useCallback(() => {
    if (onBack) {
      void onBack();
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.assign('/');
    }
  }, [onBack]);

  const handleSegmentSelect = useCallback(
    (nextDoc: LegalDocType) => {
      void onNavigate(nextDoc);
    },
    [onNavigate],
  );

  return (
    <div
      data-ready={isReady ? 'true' : undefined}
      className="kimo-legal min-h-screen bg-[var(--ink-0)] text-[var(--cream-100)] relative selection:bg-[var(--ink-4)] selection:text-[var(--cream-100)]"
    >
      <FilmGrain />
      <ReadingProgress progress={scrollProgress} />
      <TopBar onBack={handleBack} />

      <main className="w-full px-[var(--space-20)] sm:px-[var(--space-32)] lg:px-[var(--space-48)] pt-[var(--space-32)] pb-[var(--space-96)]">
        <div className="mx-auto max-w-[944px] flex flex-col lg:flex-row items-start justify-center lg:gap-[var(--space-64)]">
          {/* Sticky Table of Contents on Desktop (200px wide, top 96px) */}
          <TableOfContents
            variant="desktop"
            sections={activeContent.sections}
            activeSectionId={activeSectionId}
            onSelectSection={handleSelectTocSection}
            forceVisibleOnDesktop={mobileTocOpenOverride === true}
          />

          {/* Article Column (max-width 680px) */}
          <div className="w-full max-w-[680px] min-w-0">
            {/* Collapsible "on this page" row under 1024px (or when forced open by state switcher) */}
            <TableOfContents
              variant="mobile"
              sections={activeContent.sections}
              activeSectionId={activeSectionId}
              onSelectSection={handleSelectTocSection}
              isOpen={isMobileTocOpen}
              onToggleOpen={handleToggleMobileToc}
              forceVisibleOnDesktop={mobileTocOpenOverride === true}
            />

            {/* Segmented Switch at the top of the article */}
            <div className="mb-[var(--space-32)]">
              <SegmentedSwitch activeDoc={doc} onSelect={handleSegmentSelect} />
            </div>

            {/* Crossfading Article Document */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.article
                key={doc}
                initial={
                  prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }
                }
                animate={
                  prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }
                }
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0 }}
                transition={{
                  duration: prefersReducedMotion
                    ? DUR_2
                    : hasCompletedInitialEntry
                      ? DUR_3
                      : DUR_4,
                  ease: EASE_OUT,
                }}
              >
                {/* Title & Updated Metadata */}
                <motion.header
                  initial={
                    hasCompletedInitialEntry
                      ? false
                      : prefersReducedMotion
                        ? { opacity: 0 }
                        : { opacity: 0, y: 8 }
                  }
                  animate={
                    prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }
                  }
                  transition={{
                    duration: prefersReducedMotion ? DUR_2 : DUR_4,
                    ease: EASE_OUT,
                  }}
                  className="mb-[var(--space-40)]"
                >
                  <div className="flex items-center gap-[var(--space-12)] mb-[var(--space-8)]">
                    <h1
                      ref={headingRef}
                      tabIndex={-1}
                      className="t-28 text-[var(--cream-100)] m-0"
                    >
                      {activeContent.title}
                    </h1>
                    {showStatesMode && (
                      <span
                        data-testid="draft-copy-badge"
                        className="t-11 text-[var(--cream-60)] bg-[var(--ink-2)] border border-[var(--line)] rounded-[var(--r-4)] px-[var(--space-6)] h-[var(--h-24)] inline-flex items-center"
                      >
                        draft copy
                      </span>
                    )}
                  </div>
                  <p className="t-12 text-[var(--cream-60)] m-0">
                    {activeContent.updated}
                  </p>
                </motion.header>

                {/* "the short version" box */}
                <ShortVersionBox
                  items={activeContent.shortVersion}
                  onEntered={() => {
                    if (!isReady) {
                      setIsReady(true);
                    }
                    if (!hasCompletedInitialEntry) {
                      setHasCompletedInitialEntry(true);
                    }
                  }}
                />

                {/* Body Sections */}
                <div>
                  {activeContent.sections.map((section) => (
                    <ArticleSection
                      key={section.id}
                      section={section}
                      onCopyAnchor={handleCopyAnchor}
                      registerSectionRef={registerSectionRef}
                    />
                  ))}
                </div>
              </motion.article>
            </AnimatePresence>

            {/* Footer: 96px below the article, hairline, then t-12 cream-60 (4.5:1 contrast) contact + cookie notice links and kimo mark */}
            <footer className="mt-[var(--space-96)] pt-[var(--space-24)] border-t border-[var(--line)] flex items-center justify-between gap-[var(--space-16)]">
              <p className="t-12 text-[var(--cream-60)] m-0">
                questions?{' '}
                <a
                  href="mailto:hello@getkimo.tech"
                  className="kimo-inline-link text-[var(--cream-60)] hover:text-[var(--cream-100)]"
                >
                  hello@getkimo.tech
                </a>{' '}
                ·{' '}
                <a
                  href="/privacy#cookies"
                  className="kimo-inline-link text-[var(--cream-60)] hover:text-[var(--cream-100)]"
                >
                  cookies
                </a>
              </p>
              <span className="text-[var(--cream-60)] inline-flex items-center">
                <KimoMark size={14} />
              </span>
            </footer>
          </div>
        </div>
      </main>

      <Toast message={toastMessage} />
    </div>
  );
}
