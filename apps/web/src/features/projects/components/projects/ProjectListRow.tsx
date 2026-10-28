import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowUpRight,
  Copy,
  Download,
  Link as LinkIcon,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import { PosterArt } from './PosterArt';
import { StatusChip } from './StatusChip';
import {
  formatDuration,
  formatRelativeTime,
  splitHighlightText,
} from '../../lib/projectsLogic';
import { DUR, EASE, SPRING, TRANSITION } from '../../lib/motion';
import type { Project } from '../../types/projects';

export type ProjectListRowProps = {
  project: Project;
  index: number;
  enableSharedLayout: boolean;
  searchQuery: string;
  nowMs: number;
  liveRenderProgress: number;
  isPreviewPlaying: boolean;
  isRenaming: boolean;
  tabIndex: number;
  rowRef: (el: HTMLDivElement | null) => void;
  onFocusRow: (index: number) => void;
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

export function ProjectListRow({
  project,
  index,
  enableSharedLayout,
  searchQuery,
  nowMs,
  liveRenderProgress,
  isPreviewPlaying,
  isRenaming,
  tabIndex,
  rowRef,
  onFocusRow,
  onActivatePreview,
  onOpenProject,
  onStartRename,
  onCancelRename,
  onCommitRename,
  onDuplicate,
  onDownload,
  onCopyLink,
  onRequestDelete,
}: ProjectListRowProps) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState(project.title);

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
  const relativeEdited = formatRelativeTime(project.updatedAt, nowMs);

  return (
    <motion.div
      ref={rowRef}
      role="row"
      tabIndex={tabIndex}
      aria-label={`${project.title}, ${project.aspect}, ${formatDuration(
        project.durationSec,
      )}`}
      layout={enableSharedLayout ? 'position' : false}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={
        reducedMotion
          ? { opacity: 0 }
          : {
              opacity: 0,
              scale: 0.96,
              transition: { duration: DUR.dur3, ease: EASE.in },
            }
      }
      transition={{ duration: DUR.dur3, ease: EASE.out }}
      onFocus={() => onFocusRow(index)}
      onClick={() => onOpenProject(project)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenProject(project);
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        if (isPreviewPlaying) onActivatePreview(null);
      }}
      className="kimo-focus"
      style={{
        height: '64px',
        borderBottom: '1px solid var(--line)',
        backgroundColor: hovered ? 'var(--ink-1)' : 'transparent',
        display: 'grid',
        gridTemplateColumns:
          '112px minmax(200px, 1fr) 150px 80px 88px 110px 44px',
        alignItems: 'center',
        gap: '16px',
        padding: '0 8px',
        cursor: 'pointer',
        transition: `background-color var(--dur-1) var(--ease-out)`,
      }}
    >
      {/* Column 1: 96x60 poster thumb r6 (hover plays the preview in the thumb) */}
      <div role="gridcell">
        <motion.div
          layoutId={enableSharedLayout ? `poster-${project.id}` : undefined}
          transition={SPRING.soft}
          onMouseEnter={() => onActivatePreview(project.id)}
          onMouseLeave={() => onActivatePreview(null)}
          style={{
            width: '96px',
            height: '60px',
            borderRadius: '6px',
            overflow: 'hidden',
            backgroundColor: 'var(--ink-1)',
            boxShadow: 'inset 0 0 0 1px var(--line-inset)',
            position: 'relative',
          }}
        >
          <PosterArt
            projectId={project.id}
            title={project.title}
            aspect={project.aspect}
            posterUrl={project.posterUrl}
            previewUrl={project.previewUrl}
            isPreviewActive={isPreviewPlaying}
            scrubProgress={null}
            compact
          />
        </motion.div>
      </div>

      {/* Column 2: title t-13 cream-100 + prompt t-12 cream-38 underneath (one line each) */}
      <div role="gridcell" style={{ minWidth: 0 }}>
        {isRenaming ? (
          <input
            ref={renameInputRef}
            type="text"
            aria-label="project title"
            value={renameDraft}
            onClick={(e) => e.stopPropagation()}
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
            className="t-13 kimo-focus"
            style={{
              width: '100%',
              maxWidth: '280px',
              height: '22px',
              backgroundColor: 'var(--ink-2)',
              color: 'var(--cream-100)',
              border: '1px solid var(--line-strong)',
              borderRadius: '6px',
              padding: '0 6px',
            }}
          />
        ) : (
          <div
            className="t-13"
            style={{
              color: 'var(--cream-100)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
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
          </div>
        )}
        <div
          className="t-12"
          style={{
            color: 'var(--cream-38)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {project.prompt}
        </div>
      </div>

      {/* Column 3: status chip (inline, no bg) */}
      <div role="gridcell">
        <StatusChip
          status={project.status}
          renderProgress={currentRenderProgress}
          variant="inline"
        />
      </div>

      {/* Column 4: aspect */}
      <div
        role="gridcell"
        className="t-12 tabular-nums"
        style={{ color: 'var(--cream-60)' }}
      >
        {project.aspect}
      </div>

      {/* Column 5: duration (mono) */}
      <div
        role="gridcell"
        className="t-12 font-mono-code"
        style={{ color: 'var(--cream-100)' }}
      >
        {formatDuration(project.durationSec)}
      </div>

      {/* Column 6: edited (relative) */}
      <div
        role="gridcell"
        className="t-12 tabular-nums"
        style={{ color: 'var(--cream-38)' }}
      >
        {relativeEdited}
      </div>

      {/* Column 7: more menu */}
      <div
        role="gridcell"
        style={{
          position: 'relative',
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
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
                reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }
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
                onClick={(e) => {
                  e.stopPropagation();
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
                onClick={(e) => {
                  e.stopPropagation();
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
                onClick={(e) => {
                  e.stopPropagation();
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
                    onClick={(e) => {
                      e.stopPropagation();
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
                    onClick={(e) => {
                      e.stopPropagation();
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
                onClick={(e) => {
                  e.stopPropagation();
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
    </motion.div>
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
