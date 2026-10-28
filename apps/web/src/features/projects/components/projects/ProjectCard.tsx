import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowUpRight,
  Copy,
  Download,
  Link as LinkIcon,
  MoreHorizontal,
  Pencil,
  Play,
  Trash2,
} from 'lucide-react';
import { PosterArt } from './PosterArt';
import { StatusChip } from './StatusChip';
import {
  formatDuration,
  formatProjectMeta,
  splitHighlightText,
} from '../../lib/projectsLogic';
import { DUR, EASE, SPRING, TRANSITION } from '../../lib/motion';
import type { Project } from '../../types/projects';

export type ProjectCardProps = {
  project: Project;
  index: number;
  animateEntry: boolean;
  enableSharedLayout: boolean;
  searchQuery: string;
  nowMs: number;
  liveRenderProgress: number;
  isPreviewPlaying: boolean;
  isRenaming: boolean;
  isTouchOrCompact: boolean;
  tabIndex: number;
  cardRef: (el: HTMLDivElement | null) => void;
  onFocusCard: (index: number) => void;
  onActivatePreview: (projectId: string | null) => void;
  onOpenProject: (project: Project) => void;
  onStartRename: (projectId: string) => void;
  onCancelRename: () => void;
  onCommitRename: (projectId: string, newTitle: string) => void;
  onDuplicate: (project: Project) => void;
  onDownload: (project: Project) => void;
  onCopyLink: (project: Project) => void;
  onRequestDelete: (project: Project) => void;
};

export function ProjectCard({
  project,
  index,
  animateEntry,
  enableSharedLayout,
  searchQuery,
  nowMs,
  liveRenderProgress,
  isPreviewPlaying,
  isRenaming,
  isTouchOrCompact,
  tabIndex,
  cardRef,
  onFocusCard,
  onActivatePreview,
  onOpenProject,
  onStartRename,
  onCancelRename,
  onCommitRename,
  onDuplicate,
  onDownload,
  onCopyLink,
  onRequestDelete,
}: ProjectCardProps) {
  const [hovered, setHovered] = useState(false);
  const [focusedWithin, setFocusedWithin] = useState(false);
  const [scrubProgress, setScrubProgress] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState(project.title);

  const hoverTimerRef = useRef<number | null>(null);
  const posterFrameRef = useRef<HTMLDivElement | null>(null);
  const moreBtnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    setRenameDraft(project.title);
  }, [project.title]);

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setMenuOpen(false);
        moreBtnRef.current?.focus();
      }
    };
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        moreBtnRef.current &&
        !moreBtnRef.current.contains(target)
      ) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, [menuOpen]);

  const handlePointerEnter = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isTouchOrCompact || e.pointerType === 'touch') return;
    setHovered(true);
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
    }
    // 220ms intent delay before activating preview
    hoverTimerRef.current = window.setTimeout(() => {
      onActivatePreview(project.id);
    }, 220);
  };

  const handlePointerLeave = () => {
    setHovered(false);
    setScrubProgress(null);
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (isPreviewPlaying && !isTouchOrCompact) {
      onActivatePreview(null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isTouchOrCompact || e.pointerType === 'touch') return;
    if (!posterFrameRef.current) return;
    const rect = posterFrameRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setScrubProgress(relX);
  };

  const handleCommitRenameInternal = () => {
    const trimmed = renameDraft.trim().toLowerCase();
    if (trimmed && trimmed !== project.title) {
      onCommitRename(project.id, trimmed);
    } else {
      setRenameDraft(project.title);
      onCancelRename();
    }
  };

  const currentRenderProgress =
    project.status === 'rendering'
      ? liveRenderProgress
      : (project.renderProgress ?? 0.62);

  const titleParts = splitHighlightText(project.title, searchQuery);
  const metaText = formatProjectMeta(project, nowMs);
  const showMoreButton =
    isTouchOrCompact || hovered || focusedWithin || menuOpen;

  return (
    <motion.article
      layout={enableSharedLayout ? 'position' : false}
      initial={
        animateEntry
          ? reducedMotion
            ? { opacity: 0 }
            : { opacity: 0, y: 12 }
          : false
      }
      animate={
        reducedMotion
          ? { opacity: 1, y: 0, scale: 1 }
          : {
              opacity: 1,
              y: hovered ? -4 : 0,
              scale: 1,
            }
      }
      exit={
        reducedMotion
          ? { opacity: 0 }
          : {
              opacity: 0,
              scale: 0.96,
              transition: { duration: DUR.dur3, ease: EASE.in },
            }
      }
      transition={
        hovered
          ? SPRING.soft
          : {
              duration: reducedMotion ? DUR.dur2 : DUR.dur4,
              ease: EASE.out,
              delay: animateEntry ? Math.min(index, 11) * 0.03 : 0,
            }
      }
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={handlePointerLeave}
      onFocusCapture={() => setFocusedWithin(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setFocusedWithin(false);
        }
      }}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'transparent',
      }}
    >
      {/* Poster frame: aspect 16/10, r12, bg --ink-1, inner hairline inset */}
      <motion.div
        layoutId={enableSharedLayout ? `poster-${project.id}` : undefined}
        transition={SPRING.soft}
        animate={{
          boxShadow: hovered
            ? 'inset 0 0 0 1px rgb(245 241 231 / 0.2), 0 20px 48px -16px rgb(0 0 0 / 0.75), 0 0 32px -8px rgb(255 90 36 / 0.18)'
            : 'inset 0 0 0 1px rgb(245 241 231 / 0.06), 0 0px 0px 0px rgb(0 0 0 / 0), 0 0px 0px 0px rgb(0 0 0 / 0)',
        }}
        ref={(el) => {
          posterFrameRef.current = el;
          cardRef(el);
        }}
        role="button"
        tabIndex={tabIndex}
        aria-label={`${project.title}, ${project.aspect}, ${formatDuration(
          project.durationSec,
        )}`}
        onFocus={() => onFocusCard(index)}
        onClick={() => onOpenProject(project)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenProject(project);
          }
        }}
        onPointerEnter={handlePointerEnter}
        onPointerMove={handlePointerMove}
        className="kimo-focus"
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 10',
          borderRadius: '12px',
          backgroundColor: 'var(--ink-1)',
          overflow: 'hidden',
          cursor: 'pointer',
        }}
      >
        {/* Poster + Preview scaling 1 to 1.02 over dur-4 ease-out on active preview */}
        <motion.div
          animate={{
            scale: !reducedMotion && isPreviewPlaying ? 1.02 : 1,
          }}
          transition={{
            duration: isPreviewPlaying ? DUR.dur4 : DUR.dur3,
            ease: EASE.out,
          }}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
          }}
        >
          <PosterArt
            projectId={project.id}
            title={project.title}
            aspect={project.aspect}
            posterUrl={project.posterUrl}
            previewUrl={project.previewUrl}
            isPreviewActive={isPreviewPlaying}
            scrubProgress={isPreviewPlaying ? scrubProgress : null}
          />
        </motion.div>

        {/* Render sheen and bottom progress bar when rendering */}
        {project.status === 'rendering' && (
          <>
            <div className="render-sheen" />
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: '2px',
                backgroundColor: 'var(--cream-16)',
                zIndex: 4,
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.round(currentRenderProgress * 100)}%`,
                  backgroundColor: 'var(--cream-100)',
                  transition: `width var(--dur-2) var(--ease-out)`,
                }}
              />
            </div>
          </>
        )}

        {/* Top-left inside, 10px inset: status chip */}
        {project.status !== 'done' && (
          <div
            style={{
              position: 'absolute',
              top: '10px',
              left: '10px',
              zIndex: 3,
              pointerEvents: 'none',
            }}
          >
            <StatusChip
              status={project.status}
              renderProgress={currentRenderProgress}
            />
          </div>
        )}

        {/* Top-right inside: aspect tag t-11 cream-60 on rgb(8 8 9 / 0.72), r4, padding 2px 6px */}
        <div
          className="t-11 tabular-nums"
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            zIndex: 3,
            backgroundColor: 'var(--scrim-72)',
            color: 'var(--cream-60)',
            borderRadius: '4px',
            padding: '2px 6px',
            pointerEvents: 'none',
          }}
        >
          {project.aspect}
        </div>

        {/* 390px / Touch inline Play overlay button at poster center */}
        {isTouchOrCompact && (
          <button
            type="button"
            aria-label={`preview ${project.title}`}
            onClick={(e) => {
              e.stopPropagation();
              onActivatePreview(isPreviewPlaying ? null : project.id);
            }}
            className="kimo-focus"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: 'var(--scrim-72)',
              border: '1px solid var(--line)',
              color: 'var(--cream-100)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 3,
              cursor: 'pointer',
            }}
          >
            <Play size={14} strokeWidth={1.5} />
          </button>
        )}

        {/* Bottom-right inside: duration in Geist Mono t-12 cream-100 on rgb(8 8 9 / 0.72), r4, padding 2px 6px */}
        <div
          className="t-12 font-mono-code"
          style={{
            position: 'absolute',
            bottom: '10px',
            right: '10px',
            zIndex: 3,
            backgroundColor: 'var(--scrim-72)',
            color: 'var(--cream-100)',
            borderRadius: '4px',
            padding: '2px 6px',
            pointerEvents: 'none',
          }}
        >
          {formatDuration(
            isPreviewPlaying && scrubProgress !== null
              ? Math.round(project.durationSec * scrubProgress)
              : project.durationSec,
          )}
        </div>

        {/* Hover scrub bar along bottom edge (2px, cream-16 track, cream-100 progress) */}
        {!isTouchOrCompact && isPreviewPlaying && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: '2px',
              backgroundColor: 'var(--cream-16)',
              zIndex: 5,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.round((scrubProgress ?? 0.35) * 100)}%`,
                backgroundColor: 'var(--cream-100)',
              }}
            />
          </div>
        )}
      </motion.div>

      {/* Meta below poster, 12px gap */}
      <div style={{ marginTop: '12px', position: 'relative' }}>
        {/* Row 1: title t-15 cream-100, single line, ellipsis; right 28px ghost icon button MoreHorizontal */}
        <div
          className="flex items-center justify-between"
          style={{ gap: '8px', height: '24px' }}
        >
          {isRenaming ? (
            <input
              ref={renameInputRef}
              type="text"
              aria-label="project title"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCommitRenameInternal();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setRenameDraft(project.title);
                  onCancelRename();
                }
              }}
              onBlur={handleCommitRenameInternal}
              className="t-15 kimo-focus"
              style={{
                flex: 1,
                minWidth: 0,
                height: '24px',
                backgroundColor: 'var(--ink-2)',
                color: 'var(--cream-100)',
                border: '1px solid var(--line-strong)',
                borderRadius: '6px',
                padding: '0 6px',
              }}
            />
          ) : (
            <motion.h3
              key={project.title}
              initial={reducedMotion ? false : { opacity: 0.4 }}
              animate={{ opacity: 1 }}
              transition={{ duration: DUR.dur2, ease: EASE.out }}
              onClick={() => onOpenProject(project)}
              className="t-15"
              style={{
                margin: 0,
                color: 'var(--cream-100)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                flex: 1,
                minWidth: 0,
              }}
            >
              {titleParts.map((part, idx) =>
                part.matched ? (
                  <span
                    key={idx}
                    style={{
                      textDecoration: 'underline',
                      textDecorationColor: 'var(--cream-100)',
                      textUnderlineOffset: '3px',
                    }}
                  >
                    {part.text}
                  </span>
                ) : (
                  <span key={idx}>{part.text}</span>
                ),
              )}
            </motion.h3>
          )}

          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              ref={moreBtnRef}
              type="button"
              aria-label={`more actions for ${project.title}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((prev) => !prev);
              }}
              className="btn-base btn-ghost kimo-focus"
              style={{
                width: '28px',
                height: '28px',
                padding: 0,
                borderRadius: '8px',
                opacity: showMoreButton ? 1 : 0,
              }}
            >
              <MoreHorizontal size={16} strokeWidth={1.5} />
            </button>

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  ref={menuRef}
                  role="menu"
                  aria-label={`actions for ${project.title}`}
                  initial={
                    reducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, y: 4, scale: 0.98 }
                  }
                  animate={
                    reducedMotion
                      ? { opacity: 1 }
                      : { opacity: 1, y: 0, scale: 1 }
                  }
                  exit={
                    reducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, y: 4, scale: 0.98 }
                  }
                  transition={
                    reducedMotion ? TRANSITION.reducedFade : TRANSITION.popIn
                  }
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '32px',
                    width: '188px',
                    backgroundColor: 'var(--ink-1)',
                    border: '1px solid var(--line)',
                    borderRadius: '12px',
                    boxShadow: 'var(--shadow-pop)',
                    padding: '6px',
                    zIndex: 40,
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenProject(project);
                    }}
                    className="kimo-focus t-13"
                    style={menuItemStyle}
                    onMouseEnter={handleMenuHoverEnter}
                    onMouseLeave={handleMenuHoverLeave}
                  >
                    <ArrowUpRight size={14} strokeWidth={1.5} />
                    <span>open</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onStartRename(project.id);
                    }}
                    className="kimo-focus t-13"
                    style={menuItemStyle}
                    onMouseEnter={handleMenuHoverEnter}
                    onMouseLeave={handleMenuHoverLeave}
                  >
                    <Pencil size={14} strokeWidth={1.5} />
                    <span>rename</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onDuplicate(project);
                    }}
                    className="kimo-focus t-13"
                    style={menuItemStyle}
                    onMouseEnter={handleMenuHoverEnter}
                    onMouseLeave={handleMenuHoverLeave}
                  >
                    <Copy size={14} strokeWidth={1.5} />
                    <span>duplicate</span>
                  </button>

                  {project.status === 'done' && (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          onDownload(project);
                        }}
                        className="kimo-focus t-13"
                        style={menuItemStyle}
                        onMouseEnter={handleMenuHoverEnter}
                        onMouseLeave={handleMenuHoverLeave}
                      >
                        <Download size={14} strokeWidth={1.5} />
                        <span>download mp4</span>
                      </button>

                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          onCopyLink(project);
                        }}
                        className="kimo-focus t-13"
                        style={menuItemStyle}
                        onMouseEnter={handleMenuHoverEnter}
                        onMouseLeave={handleMenuHoverLeave}
                      >
                        <LinkIcon size={14} strokeWidth={1.5} />
                        <span>copy share link</span>
                      </button>
                    </>
                  )}

                  <div
                    role="separator"
                    style={{
                      height: '1px',
                      backgroundColor: 'var(--line)',
                      margin: '4px 0',
                    }}
                  />

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onRequestDelete(project);
                    }}
                    className="kimo-focus t-13"
                    style={{
                      ...menuItemStyle,
                      color: 'var(--danger)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor =
                        'var(--danger-hover-bg)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <Trash2 size={14} strokeWidth={1.5} />
                    <span>delete</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Row 2, 4px gap: t-12 cream-38 relative time or finished date or render failed */}
        <div
          className="t-12 tabular-nums"
          style={{
            marginTop: '4px',
            color: 'var(--cream-38)',
          }}
        >
          {metaText}
        </div>
      </div>
    </motion.article>
  );
}

const menuItemStyle: React.CSSProperties = {
  width: '100%',
  height: '32px',
  padding: '0 10px',
  borderRadius: '8px',
  backgroundColor: 'transparent',
  border: 'none',
  color: 'var(--cream-100)',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  cursor: 'pointer',
  textAlign: 'left',
  transition: `background-color var(--dur-1) var(--ease-out)`,
};

function handleMenuHoverEnter(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.backgroundColor = 'var(--ink-2)';
}

function handleMenuHoverLeave(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.backgroundColor = 'transparent';
}
