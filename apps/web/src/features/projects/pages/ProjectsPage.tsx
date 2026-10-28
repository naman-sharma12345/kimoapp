/*
 * NEW COPY (short lowercase labels required for table headers, shortcut sheet, and aria labels):
 * - "title", "status", "aspect", "duration", "edited" (list view column headers)
 * - "shortcuts", "esc", "move focus" (shortcut sheet dialog)
 * - "grid view", "list view", "sort projects" (accessible button labels)
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from 'motion/react';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  List,
  Search,
  SearchX,
} from 'lucide-react';
import { TopBar } from '../components/projects/TopBar';
import { ContinueCard } from '../components/projects/ContinueCard';
import { ProjectCard } from '../components/projects/ProjectCard';
import { ProjectListRow } from '../components/projects/ProjectListRow';
import { DeleteDialog } from '../components/projects/DeleteDialog';
import { ShortcutSheetDialog } from '../components/projects/ShortcutSheetDialog';
import { ToastContainer } from '../components/projects/ToastContainer';
import { EmptyState } from '../components/projects/EmptyState';
import { DropOverlay } from '../components/projects/DropOverlay';
import { FilmGrain } from '../components/projects/FilmGrain';
import {
  computeVirtualWindow,
  filterAndSortProjects,
  getNextRovingIndex,
  isInProgressStatus,
} from '../lib/projectsLogic';
import { AGENT_ACTIVITY_ROTATION } from '../mock/projects';
import { DUR, EASE, SPRING, TRANSITION } from '../lib/motion';
import type {
  FilterSegment,
  ListSortColumn,
  Project,
  ProjectsPageProps,
  SortOption,
  ToastItem,
  ViewMode,
} from '../types/projects';

const SORT_LABELS: Record<SortOption, string> = {
  recent: 'recent',
  oldest: 'oldest',
  longest: 'longest',
  a_to_z: 'a to z',
};

const SEGMENT_LABELS: Record<FilterSegment, string> = {
  all: 'all',
  in_progress: 'in progress',
  finished: 'finished',
};

export default function ProjectsPage({
  projects,
  state,
  user,
  onOpenStudio,
  onOpenRender,
  onOpenVideo,
  onRename,
  onDuplicate,
  onDelete,
  onUndoDelete,
  onDownload,
  onCopyLink,
  onStartWithFiles,
  onRetry,
  onSignIn,
  onSignOut,
}: ProjectsPageProps) {
  // Reference clock for relative times, taken once on mount.
  const [nowMs] = useState(() => Date.now());
  const reducedMotion = useReducedMotion();

  // Viewport & responsive tracking
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1440,
  );
  const [viewportHeight, setViewportHeight] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerHeight : 900,
  );
  const [scrollTop, setScrollTop] = useState<number>(0);

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
    };
    const handleScroll = () => {
      setScrollTop(window.scrollY);
    };
    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const isCompact390 = viewportWidth <= 480;
  const isTablet768 = viewportWidth <= 768;
  const isWide1920 = viewportWidth >= 1800;

  // Ready state for entry animation
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    setIsReady(false);
    const delayMs = reducedMotion ? 160 : 520;
    const t = window.setTimeout(() => {
      setIsReady(true);
    }, delayMs);
    return () => window.clearTimeout(t);
  }, [state, reducedMotion]);

  // Focus page heading on load
  const pageHeadingRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => {
      pageHeadingRef.current?.focus({ preventScroll: true });
    }, 30);
    return () => window.clearTimeout(t);
  }, []);

  // Search, filter, sort, view mode states
  const [rawSearch, setRawSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [searchFocused, setSearchFocused] = useState<boolean>(false);
  const [segment, setSegment] = useState<FilterSegment>('all');
  const [sortOption, setSortOption] = useState<SortOption>('recent');
  const [sortMenuOpen, setSortMenuOpen] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [listColumnSort, setListColumnSort] = useState<{
    column: ListSortColumn;
    direction: 'asc' | 'desc';
  } | null>(null);

  // Sync state="no_results" from state switcher
  useEffect(() => {
    if (state === 'no_results') {
      setRawSearch('zzzz-unmatched-film');
      setDebouncedSearch('zzzz-unmatched-film');
    } else if (rawSearch === 'zzzz-unmatched-film') {
      setRawSearch('');
      setDebouncedSearch('');
    }
    // Only react to state changes; rawSearch is read, not tracked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Debounce search by 120ms
  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(rawSearch);
    }, 120);
    return () => window.clearTimeout(t);
  }, [rawSearch]);

  // Force grid view at <= 768px
  const effectiveViewMode: ViewMode = isTablet768 ? 'grid' : viewMode;

  // Live mock animations: agentActivity swaps every 4s, renderProgress counts up live
  const [activityIdx, setActivityIdx] = useState(0);
  const [liveRenderProgress, setLiveRenderProgress] = useState(0.62);

  useEffect(() => {
    if (reducedMotion) return;
    const interval = window.setInterval(() => {
      setActivityIdx((prev) => (prev + 1) % AGENT_ACTIVITY_ROTATION.length);
    }, 4000);
    return () => window.clearInterval(interval);
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;
    const interval = window.setInterval(() => {
      setLiveRenderProgress((prev) => {
        const next = prev + 0.01;
        return next > 0.96 ? 0.62 : Number(next.toFixed(2));
      });
    }, 1600);
    return () => window.clearInterval(interval);
  }, [reducedMotion]);

  const currentAgentActivity =
    AGENT_ACTIVITY_ROTATION[activityIdx] ?? 'grading the mountain shots';

  // Interaction states: active preview (only one may play at a time), renaming, delete dialog, shortcut sheet, toast
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [shortcutSheetOpen, setShortcutSheetOpen] = useState(false);
  const [toast, setToast] = useState<ToastItem | null>(null);
  const [focusedCardIndex, setFocusedCardIndex] = useState<number>(0);

  const showToast = useCallback((message: string, undoProjectId?: string) => {
    setToast({
      id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      message,
      undoProjectId,
      createdAt: Date.now(),
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => {
      setToast(null);
    }, 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Derived project lists
  const safeProjects = useMemo(() => projects ?? [], [projects]);

  const inProgressRailProjects = useMemo(
    () => safeProjects.filter((p) => isInProgressStatus(p.status)),
    [safeProjects],
  );

  const filteredProjects = useMemo(
    () =>
      filterAndSortProjects(
        safeProjects,
        segment,
        debouncedSearch,
        sortOption,
        effectiveViewMode === 'list' ? listColumnSort : null,
      ),
    [
      safeProjects,
      segment,
      debouncedSearch,
      sortOption,
      effectiveViewMode,
      listColumnSort,
    ],
  );

  // Check if any visible project has status === 'editing' (for THE ONE ORANGE RULE)
  const hasEditingProject = useMemo(
    () => safeProjects.some((p) => p.status === 'editing'),
    [safeProjects],
  );

  // Continue rail scroll overflow mask state
  const railRef = useRef<HTMLDivElement | null>(null);
  const [railMask, setRailMask] = useState<'none' | 'right' | 'left' | 'both'>(
    'right',
  );

  const updateRailMask = useCallback(() => {
    const el = railRef.current;
    if (!el || isTablet768 || inProgressRailProjects.length <= 2) {
      setRailMask('none');
      return;
    }
    const { scrollLeft, scrollWidth, clientWidth } = el;
    if (scrollWidth <= clientWidth + 4) {
      setRailMask('none');
    } else if (scrollLeft <= 8) {
      setRailMask('right');
    } else if (scrollLeft + clientWidth >= scrollWidth - 8) {
      setRailMask('left');
    } else {
      setRailMask('both');
    }
  }, [isTablet768, inProgressRailProjects.length]);

  useEffect(() => {
    updateRailMask();
  }, [updateRailMask, viewportWidth]);

  // Grid geometry & custom virtualization for `many` state (300 projects)
  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const [gridOffsetTop, setGridOffsetTop] = useState<number>(380);
  const [gridColumns, setGridColumns] = useState<number>(4);

  useEffect(() => {
    const measureGrid = () => {
      if (!gridContainerRef.current) return;
      const rect = gridContainerRef.current.getBoundingClientRect();
      setGridOffsetTop(rect.top + window.scrollY);
      const w = rect.width;
      const minCol = isCompact390 ? w : isWide1920 ? 320 : 280;
      const cols = isCompact390
        ? 1
        : Math.max(1, Math.floor((w + 24) / (minCol + 24)));
      setGridColumns(cols);
    };
    measureGrid();
    window.addEventListener('resize', measureGrid, { passive: true });
    return () => window.removeEventListener('resize', measureGrid);
  }, [isCompact390, isWide1920, segment, debouncedSearch, state]);

  const isVirtualized = state === 'many' || filteredProjects.length > 48;

  const virtualWindow = useMemo(() => {
    if (!isVirtualized) {
      return {
        startRow: 0,
        endRow: Math.ceil(filteredProjects.length / Math.max(1, gridColumns)),
        startIndex: 0,
        endIndex: filteredProjects.length,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
        totalRows: Math.ceil(
          filteredProjects.length / Math.max(1, gridColumns),
        ),
      };
    }
    const rowHeight = effectiveViewMode === 'list' ? 64 : 254;
    const rowGap = effectiveViewMode === 'list' ? 0 : 32;
    const cols = effectiveViewMode === 'list' ? 1 : gridColumns;

    return computeVirtualWindow({
      totalItems: filteredProjects.length,
      columns: cols,
      rowHeight,
      rowGap,
      scrollTop,
      viewportHeight,
      gridOffsetTop,
      overscanRows: 3,
    });
  }, [
    isVirtualized,
    filteredProjects.length,
    gridColumns,
    effectiveViewMode,
    scrollTop,
    viewportHeight,
    gridOffsetTop,
  ]);

  const visibleProjects = useMemo(
    () =>
      filteredProjects.slice(virtualWindow.startIndex, virtualWindow.endIndex),
    [filteredProjects, virtualWindow.startIndex, virtualWindow.endIndex],
  );

  // Refs for roving tabindex in grid/list
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const sortBtnRef = useRef<HTMLButtonElement | null>(null);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);

  // Sort menu close on outside click or Esc
  useEffect(() => {
    if (!sortMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setSortMenuOpen(false);
        sortBtnRef.current?.focus();
      }
    };
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        sortMenuRef.current &&
        !sortMenuRef.current.contains(target) &&
        sortBtnRef.current &&
        !sortBtnRef.current.contains(target)
      ) {
        setSortMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, [sortMenuOpen]);

  // Action handlers
  const handleOpenProject = useCallback(
    (project: Project) => {
      switch (project.status) {
        case 'editing':
        case 'awaiting_review':
        case 'draft':
        case 'failed':
          onOpenStudio(project.sessionId);
          break;
        case 'rendering':
          onOpenRender(project.sessionId);
          break;
        case 'done':
          onOpenVideo(project.videoId ?? project.id);
          break;
      }
    },
    [onOpenStudio, onOpenRender, onOpenVideo],
  );

  const handleCommitRename = useCallback(
    async (projectId: string, newTitle: string) => {
      setRenamingId(null);
      await onRename(projectId, newTitle);
      showToast('renamed');
    },
    [onRename, showToast],
  );

  const handleDuplicate = useCallback(
    async (project: Project) => {
      const duplicated = await onDuplicate(project.id);
      showToast(`duplicated as "${duplicated.title}"`);
    },
    [onDuplicate, showToast],
  );

  const handleConfirmDelete = useCallback(
    async (project: Project) => {
      setDeleteTarget(null);
      await onDelete(project.id);
      showToast('project deleted', project.id);
    },
    [onDelete, showToast],
  );

  const handleUndoDelete = useCallback(
    async (projectId: string) => {
      await onUndoDelete(projectId);
    },
    [onUndoDelete],
  );

  const handleDownload = useCallback(
    (project: Project) => {
      onDownload(project.videoId ?? project.id);
    },
    [onDownload],
  );

  const handleCopyLink = useCallback(
    (project: Project) => {
      onCopyLink(project.videoId ?? project.id);
      showToast('link copied');
    },
    [onCopyLink, showToast],
  );

  // Global keyboard shortcuts: "/", "n", "g" then "l", arrows, "r", Delete/Backspace, "?"
  const lastGKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInputFocused =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (isInputFocused || deleteTarget || shortcutSheetOpen) {
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        setShortcutSheetOpen(true);
        return;
      }

      if (e.key === 'n' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onOpenStudio('new');
        return;
      }

      if (e.key === 'g' && !e.metaKey && !e.ctrlKey) {
        lastGKeyTimeRef.current = Date.now();
        return;
      }

      if (e.key === 'l' && !e.metaKey && !e.ctrlKey) {
        if (Date.now() - lastGKeyTimeRef.current < 700 && !isTablet768) {
          e.preventDefault();
          setViewMode((prev) => (prev === 'grid' ? 'list' : 'grid'));
          lastGKeyTimeRef.current = 0;
          return;
        }
      }

      if (
        e.key === 'ArrowRight' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowUp'
      ) {
        if (filteredProjects.length === 0) return;
        e.preventDefault();
        const cols = effectiveViewMode === 'list' ? 1 : gridColumns;
        const nextIdx = getNextRovingIndex({
          currentIndex: focusedCardIndex,
          totalItems: filteredProjects.length,
          columns: cols,
          key: e.key,
        });
        setFocusedCardIndex(nextIdx);
        const node = itemRefs.current.get(nextIdx);
        node?.focus();
        return;
      }

      if (e.key === 'r' && !e.metaKey && !e.ctrlKey) {
        const focusedProj = filteredProjects[focusedCardIndex];
        if (
          focusedProj &&
          document.activeElement === itemRefs.current.get(focusedCardIndex)
        ) {
          e.preventDefault();
          setRenamingId(focusedProj.id);
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const focusedProj = filteredProjects[focusedCardIndex];
        if (
          focusedProj &&
          document.activeElement === itemRefs.current.get(focusedCardIndex)
        ) {
          e.preventDefault();
          setDeleteTarget(focusedProj);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    deleteTarget,
    shortcutSheetOpen,
    onOpenStudio,
    isTablet768,
    filteredProjects,
    effectiveViewMode,
    gridColumns,
    focusedCardIndex,
  ]);

  // Drag and drop anywhere on page
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const dragDepthRef = useRef(0);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepthRef.current += 1;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingFiles(true);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDraggingFiles(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onStartWithFiles(files);
    }
  };

  const toggleListColumnSort = (col: ListSortColumn) => {
    setListColumnSort((prev) => {
      if (!prev || prev.column !== col) {
        return { column: col, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { column: col, direction: 'desc' };
      }
      return null;
    });
  };

  const showContinueRail =
    (state === 'loaded' || state === 'many') &&
    segment !== 'finished' &&
    !debouncedSearch.trim() &&
    inProgressRailProjects.length > 0;

  const gridSectionLabel =
    segment === 'all'
      ? 'all projects'
      : segment === 'in_progress'
        ? 'in progress'
        : 'finished';

  return (
    // The page root is a file drop target, not a control; keyboard users start
    // a video from the "new video" button instead.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="kimo-projects"
      data-ready={isReady ? 'true' : 'false'}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--ink-0)',
        color: 'var(--cream-100)',
        position: 'relative',
      }}
    >
      <FilmGrain />
      <DropOverlay visible={isDraggingFiles} />

      {/* Ambient warm glow behind the top of the page */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: '-20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '120vw',
          height: '60vh',
          pointerEvents: 'none',
          background:
            'radial-gradient(closest-side, rgb(255 90 36 / 0.06), transparent 100%)',
          zIndex: 0,
        }}
      />

      <TopBar
        user={state === 'signed_out' ? null : user}
        hasActiveOrangeOnPage={
          state === 'empty' ||
          state === 'signed_out' ||
          ((state === 'loaded' || state === 'many') && hasEditingProject)
        }
        onNewVideo={() => onOpenStudio('new')}
        onSignOut={onSignOut}
        isCompactMobile={isCompact390}
      />

      {/* Content container: max-width 1360 (1600 on 1920), padding 40px 32px 96px */}
      <main
        style={{
          maxWidth: isWide1920 ? '1600px' : '1360px',
          margin: '0 auto',
          padding: isCompact390 ? '24px 16px 80px' : '40px 32px 96px',
        }}
      >
        {/* Signed-out state */}
        {state === 'signed_out' && (
          <div
            style={{
              minHeight: 'calc(100vh - 200px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: '48px 24px',
            }}
          >
            <h1
              ref={pageHeadingRef}
              tabIndex={-1}
              className="t-28 kimo-focus"
              style={{ margin: 0, color: 'var(--cream-100)' }}
            >
              sign in to see your projects
            </h1>
            <p
              className="t-15"
              style={{
                marginTop: '8px',
                marginBottom: 0,
                color: 'var(--cream-60)',
              }}
            >
              videos you make while signed in are saved here for 30 days.
            </p>
            <div
              className="flex items-center"
              style={{ marginTop: '24px', gap: '12px' }}
            >
              <button
                type="button"
                onClick={onSignIn}
                className="btn-base btn-primary h-40 t-15"
              >
                sign in
              </button>
              <a
                href="/"
                onClick={(e) => {
                  e.preventDefault();
                  onOpenStudio('new');
                }}
                className="btn-base btn-ghost h-40 t-15"
              >
                back to kimo
              </a>
            </div>
          </div>
        )}

        {/* Empty state (new user) */}
        {state === 'empty' && (
          <div>
            <h1 ref={pageHeadingRef} tabIndex={-1} className="sr-only">
              projects
            </h1>
            <EmptyState onMakeFirstVideo={() => onOpenStudio('new')} />
          </div>
        )}

        {/* Error state */}
        {state === 'error' && (
          <div
            aria-live="assertive"
            style={{
              minHeight: 'calc(100vh - 220px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: '48px 24px',
            }}
          >
            <AlertCircle
              size={20}
              strokeWidth={1.5}
              style={{ color: 'var(--danger)' }}
            />
            <h1
              ref={pageHeadingRef}
              tabIndex={-1}
              className="t-15 kimo-focus"
              style={{
                marginTop: '12px',
                marginBottom: 0,
                color: 'var(--cream-100)',
              }}
            >
              couldn&apos;t load your projects
            </h1>
            <p
              className="t-13"
              style={{
                marginTop: '4px',
                marginBottom: 0,
                color: 'var(--cream-60)',
              }}
            >
              check your connection and try again.
            </p>
            <div style={{ marginTop: '16px' }}>
              <button
                type="button"
                onClick={onRetry}
                className="btn-base btn-secondary h-28 t-13"
              >
                retry
              </button>
            </div>
          </div>
        )}

        {/* Header + Toolbar + Content for loaded, loading, no_results, many */}
        {(state === 'loaded' ||
          state === 'loading' ||
          state === 'no_results' ||
          state === 'many') && (
          <>
            {/* Page header row: fades in dur-3 */}
            <motion.div
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: DUR.dur3, ease: EASE.out }}
              style={{
                display: 'flex',
                flexDirection: isTablet768 ? 'column' : 'row',
                alignItems: isTablet768 ? 'stretch' : 'center',
                justifyContent: 'space-between',
                gap: isTablet768 ? '16px' : '24px',
              }}
            >
              {/* Left: t-28 cream-100 "projects" with t-13 cream-38 count on same baseline */}
              <div className="flex items-baseline" style={{ gap: '8px' }}>
                <h1
                  ref={pageHeadingRef}
                  tabIndex={-1}
                  className="t-28"
                  style={{
                    margin: 0,
                    color: 'var(--cream-100)',
                    outline: 'none',
                  }}
                >
                  projects
                </h1>
                {state !== 'loading' && (
                  <span
                    className="t-13 tabular-nums"
                    style={{ color: 'var(--cream-38)' }}
                  >
                    {safeProjects.length}
                  </span>
                )}
              </div>

              {/* Right: Toolbar */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: isTablet768 ? 'wrap' : 'nowrap',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {/* Search input: h32, w 240 (grows to 320 on focus with dur-3 ease-out) */}
                <div
                  style={{
                    position: 'relative',
                    width: isTablet768
                      ? '100%'
                      : searchFocused
                        ? '320px'
                        : '240px',
                    transition: `width var(--dur-3) var(--ease-out)`,
                  }}
                >
                  <Search
                    size={14}
                    strokeWidth={1.5}
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      left: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--cream-38)',
                      pointerEvents: 'none',
                    }}
                  />
                  <input
                    ref={searchInputRef}
                    type="search"
                    aria-label="search titles and prompts"
                    placeholder="search titles and prompts"
                    value={rawSearch}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    onChange={(e) => setRawSearch(e.target.value)}
                    className="t-13 kimo-focus"
                    style={{
                      width: '100%',
                      height: '32px',
                      backgroundColor: 'var(--ink-2)',
                      border: '1px solid var(--line)',
                      borderRadius: '8px',
                      paddingLeft: '30px',
                      paddingRight: searchFocused ? '10px' : '28px',
                      color: 'var(--cream-100)',
                    }}
                  />
                  {!searchFocused && !rawSearch && (
                    <kbd
                      aria-hidden="true"
                      className="t-11"
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        borderRadius: '4px',
                        border: '1px solid var(--line)',
                        padding: '0 5px',
                        color: 'var(--cream-38)',
                        pointerEvents: 'none',
                      }}
                    >
                      /
                    </kbd>
                  )}
                </div>

                {/* Segmented filter: h32, bg --ink-2, r8, padding 2px: "all", "in progress", "finished" */}
                <div
                  role="group"
                  aria-label="filter projects"
                  className="no-scrollbar"
                  style={{
                    height: '32px',
                    backgroundColor: 'var(--ink-2)',
                    borderRadius: '8px',
                    padding: '2px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    overflowX: isCompact390 ? 'auto' : 'visible',
                    maxWidth: '100%',
                  }}
                >
                  {(['all', 'in_progress', 'finished'] as const).map((seg) => {
                    const active = segment === seg;
                    return (
                      <button
                        key={seg}
                        type="button"
                        onClick={() => setSegment(seg)}
                        aria-pressed={active}
                        className="kimo-focus t-13"
                        style={{
                          position: 'relative',
                          height: '28px',
                          padding: '0 10px',
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: 'transparent',
                          color: active
                            ? 'var(--cream-100)'
                            : 'var(--cream-60)',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          zIndex: 1,
                          transition: `color var(--dur-1) var(--ease-out)`,
                        }}
                      >
                        {active && (
                          <motion.span
                            layoutId="projects-segment-indicator"
                            transition={
                              reducedMotion
                                ? TRANSITION.reducedFade
                                : SPRING.snappy
                            }
                            style={{
                              position: 'absolute',
                              inset: 0,
                              backgroundColor: 'var(--ink-4)',
                              borderRadius: '6px',
                              zIndex: -1,
                            }}
                          />
                        )}
                        <span>{SEGMENT_LABELS[seg]}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Sort menu: ghost sm button "recent" with lucide ChevronDown 14 */}
                <div style={{ position: 'relative' }}>
                  <button
                    ref={sortBtnRef}
                    type="button"
                    aria-label="sort projects"
                    aria-haspopup="menu"
                    aria-expanded={sortMenuOpen}
                    onClick={() => setSortMenuOpen((prev) => !prev)}
                    className="btn-base btn-ghost h-32 t-13"
                  >
                    <span>{SORT_LABELS[sortOption]}</span>
                    <ChevronDown size={14} strokeWidth={1.5} />
                  </button>

                  <AnimatePresence>
                    {sortMenuOpen && (
                      <motion.div
                        ref={sortMenuRef}
                        role="menu"
                        aria-label="sort projects"
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
                          reducedMotion
                            ? TRANSITION.reducedFade
                            : TRANSITION.popIn
                        }
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: '36px',
                          width: '140px',
                          backgroundColor: 'var(--ink-1)',
                          border: '1px solid var(--line)',
                          borderRadius: '12px',
                          boxShadow: 'var(--shadow-pop)',
                          padding: '6px',
                          zIndex: 40,
                        }}
                      >
                        {(
                          ['recent', 'oldest', 'longest', 'a_to_z'] as const
                        ).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            role="menuitemradio"
                            aria-checked={sortOption === opt}
                            onClick={() => {
                              setSortOption(opt);
                              setListColumnSort(null);
                              setSortMenuOpen(false);
                            }}
                            className="kimo-focus t-13"
                            style={{
                              width: '100%',
                              height: '32px',
                              padding: '0 10px',
                              borderRadius: '8px',
                              border: 'none',
                              backgroundColor:
                                sortOption === opt
                                  ? 'var(--ink-3)'
                                  : 'transparent',
                              color:
                                sortOption === opt
                                  ? 'var(--cream-100)'
                                  : 'var(--cream-60)',
                              display: 'flex',
                              alignItems: 'center',
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                          >
                            {SORT_LABELS[opt]}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* View toggle: two 32px ghost icon buttons LayoutGrid and List (hidden on <=768px) */}
                {!isTablet768 && (
                  <div
                    role="group"
                    aria-label="view mode"
                    className="flex items-center"
                    style={{ gap: '2px' }}
                  >
                    <button
                      type="button"
                      aria-label="grid view"
                      aria-pressed={effectiveViewMode === 'grid'}
                      onClick={() => setViewMode('grid')}
                      className="btn-base btn-ghost kimo-focus"
                      style={{
                        width: '32px',
                        height: '32px',
                        padding: 0,
                        borderRadius: '8px',
                        backgroundColor:
                          effectiveViewMode === 'grid'
                            ? 'var(--ink-3)'
                            : 'transparent',
                        color:
                          effectiveViewMode === 'grid'
                            ? 'var(--cream-100)'
                            : 'var(--cream-60)',
                      }}
                    >
                      <LayoutGrid size={16} strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      aria-label="list view"
                      aria-pressed={effectiveViewMode === 'list'}
                      onClick={() => setViewMode('list')}
                      className="btn-base btn-ghost kimo-focus"
                      style={{
                        width: '32px',
                        height: '32px',
                        padding: 0,
                        borderRadius: '8px',
                        backgroundColor:
                          effectiveViewMode === 'list'
                            ? 'var(--ink-3)'
                            : 'transparent',
                        color:
                          effectiveViewMode === 'list'
                            ? 'var(--cream-100)'
                            : 'var(--cream-60)',
                      }}
                    >
                      <List size={16} strokeWidth={1.5} />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Loading state: 1 skeleton in Continue Rail + 8 skeleton cards in Grid */}
            {state === 'loading' && (
              <div aria-busy="true">
                {/* Continue editing skeleton */}
                <section style={{ marginTop: '32px' }}>
                  <div
                    className="t-11"
                    style={{ color: 'var(--cream-38)', marginBottom: '12px' }}
                  >
                    continue editing
                  </div>
                  <div
                    className="skeleton-pulse"
                    style={{
                      width: isTablet768 ? '100%' : '560px',
                      height: '200px',
                      borderRadius: '12px',
                      backgroundColor: 'var(--ink-1)',
                      border: '1px solid var(--line)',
                    }}
                  />
                </section>

                {/* Grid of 8 skeleton cards */}
                <section style={{ marginTop: '48px' }}>
                  <div
                    className="t-11"
                    style={{ color: 'var(--cream-38)', marginBottom: '12px' }}
                  >
                    all projects
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isCompact390
                        ? '1fr'
                        : `repeat(auto-fill, minmax(${
                            isWide1920 ? '320px' : '280px'
                          }, 1fr))`,
                      columnGap: '24px',
                      rowGap: '32px',
                    }}
                  >
                    {Array.from({ length: 8 }).map((_, idx) => (
                      <div key={idx}>
                        <div
                          className="skeleton-pulse"
                          style={{
                            width: '100%',
                            aspectRatio: '16 / 10',
                            borderRadius: '12px',
                            backgroundColor: 'var(--ink-1)',
                          }}
                        />
                        <div style={{ marginTop: '12px' }}>
                          <div
                            style={{
                              width: '60%',
                              height: '16px',
                              borderRadius: '4px',
                              backgroundColor: 'var(--ink-2)',
                            }}
                          />
                          <div
                            style={{
                              marginTop: '6px',
                              width: '40%',
                              height: '12px',
                              borderRadius: '4px',
                              backgroundColor: 'var(--ink-2)',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {/* Loaded / Many / No Results */}
            {state !== 'loading' && (
              <>
                {/* 32px below the header: "continue editing" rail */}
                {showContinueRail && (
                  <section style={{ marginTop: '32px' }}>
                    <div
                      className="t-11"
                      style={{
                        color: 'var(--cream-38)',
                        marginBottom: '12px',
                      }}
                    >
                      continue editing
                    </div>

                    <div
                      ref={railRef}
                      onScroll={updateRailMask}
                      className={`no-scrollbar ${
                        railMask === 'both'
                          ? 'rail-mask-both'
                          : railMask === 'right'
                            ? 'rail-mask-right'
                            : railMask === 'left'
                              ? 'rail-mask-left'
                              : ''
                      }`}
                      style={{
                        display: 'flex',
                        flexDirection: isTablet768 ? 'column' : 'row',
                        gap: '16px',
                        overflowX: isTablet768 ? 'visible' : 'auto',
                        scrollSnapType: isTablet768 ? 'none' : 'x mandatory',
                        paddingBottom: '2px',
                      }}
                    >
                      {inProgressRailProjects.map((proj, idx) => (
                        <motion.div
                          key={proj.id}
                          initial={
                            reducedMotion
                              ? { opacity: 0 }
                              : { opacity: 0, y: 12 }
                          }
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: reducedMotion ? DUR.dur2 : DUR.dur4,
                            ease: EASE.out,
                            delay: reducedMotion ? 0 : idx * 0.06,
                          }}
                        >
                          <ContinueCard
                            project={proj}
                            liveAgentActivity={currentAgentActivity}
                            liveRenderProgress={liveRenderProgress}
                            hasOtherOrangeOnScreen={hasEditingProject}
                            isStackedMobile={isTablet768}
                            onOpenProject={handleOpenProject}
                          />
                        </motion.div>
                      ))}
                    </div>
                  </section>
                )}

                {/* 48px below: "all projects" (or active filter name) */}
                <section
                  ref={gridContainerRef}
                  style={{
                    marginTop: showContinueRail ? '48px' : '32px',
                  }}
                >
                  <div
                    className="t-11"
                    style={{
                      color: 'var(--cream-38)',
                      marginBottom: '12px',
                    }}
                  >
                    {gridSectionLabel}
                  </div>

                  {/* No results state */}
                  {filteredProjects.length === 0 ? (
                    <div
                      style={{
                        minHeight: '320px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        padding: '48px 24px',
                      }}
                    >
                      <SearchX
                        size={20}
                        strokeWidth={1.5}
                        style={{ color: 'var(--cream-38)' }}
                      />
                      <div
                        className="t-15"
                        style={{
                          marginTop: '12px',
                          color: 'var(--cream-100)',
                        }}
                      >
                        no projects match &ldquo;
                        {debouncedSearch || SEGMENT_LABELS[segment]}&rdquo;
                      </div>
                      <div style={{ marginTop: '4px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setRawSearch('');
                            setDebouncedSearch('');
                            setSegment('all');
                          }}
                          className="btn-base btn-ghost h-28 t-13"
                        >
                          clear search
                        </button>
                      </div>
                    </div>
                  ) : (
                    <LayoutGroup>
                      {/* Top virtual spacer for 300 projects */}
                      {virtualWindow.topSpacerHeight > 0 && (
                        <div
                          aria-hidden="true"
                          style={{
                            height: `${virtualWindow.topSpacerHeight}px`,
                          }}
                        />
                      )}

                      {effectiveViewMode === 'grid' ? (
                        <div
                          role="grid"
                          aria-label={gridSectionLabel}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: isCompact390
                              ? '1fr'
                              : `repeat(auto-fill, minmax(${
                                  isWide1920 ? '320px' : '280px'
                                }, 1fr))`,
                            columnGap: '24px',
                            rowGap: '32px',
                          }}
                        >
                          <AnimatePresence mode="popLayout" initial={false}>
                            {visibleProjects.map((project, localIdx) => {
                              const absoluteIdx =
                                virtualWindow.startIndex + localIdx;
                              return (
                                <ProjectCard
                                  key={project.id}
                                  project={project}
                                  index={absoluteIdx}
                                  animateEntry={
                                    !isVirtualized && absoluteIdx < 12
                                  }
                                  enableSharedLayout={
                                    !isVirtualized && absoluteIdx < 12
                                  }
                                  searchQuery={debouncedSearch}
                                  nowMs={nowMs}
                                  liveRenderProgress={liveRenderProgress}
                                  isPreviewPlaying={
                                    activePreviewId === project.id
                                  }
                                  isRenaming={renamingId === project.id}
                                  isTouchOrCompact={isCompact390}
                                  tabIndex={
                                    focusedCardIndex === absoluteIdx ? 0 : -1
                                  }
                                  cardRef={(el) => {
                                    if (el) {
                                      itemRefs.current.set(absoluteIdx, el);
                                    } else {
                                      itemRefs.current.delete(absoluteIdx);
                                    }
                                  }}
                                  onFocusCard={setFocusedCardIndex}
                                  onActivatePreview={setActivePreviewId}
                                  onOpenProject={handleOpenProject}
                                  onStartRename={setRenamingId}
                                  onCancelRename={() => setRenamingId(null)}
                                  onCommitRename={handleCommitRename}
                                  onDuplicate={handleDuplicate}
                                  onDownload={handleDownload}
                                  onCopyLink={handleCopyLink}
                                  onRequestDelete={setDeleteTarget}
                                />
                              );
                            })}
                          </AnimatePresence>
                        </div>
                      ) : (
                        <div role="grid" aria-label={gridSectionLabel}>
                          {/* Sticky List Header Row */}
                          <div
                            role="row"
                            className="t-11"
                            style={{
                              position: 'sticky',
                              top: '56px',
                              zIndex: 20,
                              height: '36px',
                              backgroundColor: 'var(--ink-0)',
                              borderBottom: '1px solid var(--line)',
                              display: 'grid',
                              gridTemplateColumns:
                                '112px minmax(200px, 1fr) 150px 80px 88px 110px 44px',
                              alignItems: 'center',
                              gap: '16px',
                              padding: '0 8px',
                              color: 'var(--cream-38)',
                            }}
                          >
                            <div role="columnheader" />
                            {(
                              [
                                { key: 'title', label: 'title' },
                                { key: 'status', label: 'status' },
                                { key: 'aspect', label: 'aspect' },
                                { key: 'duration', label: 'duration' },
                                { key: 'edited', label: 'edited' },
                              ] as const
                            ).map((col) => {
                              const isSorted =
                                listColumnSort?.column === col.key;
                              return (
                                <button
                                  key={col.key}
                                  type="button"
                                  role="columnheader"
                                  onClick={() => toggleListColumnSort(col.key)}
                                  className="kimo-focus t-11"
                                  style={{
                                    backgroundColor: 'transparent',
                                    border: 'none',
                                    padding: 0,
                                    color: isSorted
                                      ? 'var(--cream-100)'
                                      : 'var(--cream-38)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                  }}
                                >
                                  <span>{col.label}</span>
                                  {isSorted &&
                                    (listColumnSort.direction === 'asc' ? (
                                      <ChevronUp size={12} strokeWidth={1.5} />
                                    ) : (
                                      <ChevronDown
                                        size={12}
                                        strokeWidth={1.5}
                                      />
                                    ))}
                                </button>
                              );
                            })}
                            <div role="columnheader" />
                          </div>

                          <AnimatePresence mode="popLayout" initial={false}>
                            {visibleProjects.map((project, localIdx) => {
                              const absoluteIdx =
                                virtualWindow.startIndex + localIdx;
                              return (
                                <ProjectListRow
                                  key={project.id}
                                  project={project}
                                  index={absoluteIdx}
                                  enableSharedLayout={
                                    !isVirtualized && absoluteIdx < 12
                                  }
                                  searchQuery={debouncedSearch}
                                  nowMs={nowMs}
                                  liveRenderProgress={liveRenderProgress}
                                  isPreviewPlaying={
                                    activePreviewId === project.id
                                  }
                                  isRenaming={renamingId === project.id}
                                  tabIndex={
                                    focusedCardIndex === absoluteIdx ? 0 : -1
                                  }
                                  rowRef={(el) => {
                                    if (el) {
                                      itemRefs.current.set(absoluteIdx, el);
                                    } else {
                                      itemRefs.current.delete(absoluteIdx);
                                    }
                                  }}
                                  onFocusRow={setFocusedCardIndex}
                                  onActivatePreview={setActivePreviewId}
                                  onOpenProject={handleOpenProject}
                                  onStartRename={setRenamingId}
                                  onCancelRename={() => setRenamingId(null)}
                                  onCommitRename={handleCommitRename}
                                  onDuplicate={handleDuplicate}
                                  onDownload={handleDownload}
                                  onCopyLink={handleCopyLink}
                                  onRequestDelete={setDeleteTarget}
                                />
                              );
                            })}
                          </AnimatePresence>
                        </div>
                      )}

                      {/* Bottom virtual spacer for 300 projects */}
                      {virtualWindow.bottomSpacerHeight > 0 && (
                        <div
                          aria-hidden="true"
                          style={{
                            height: `${virtualWindow.bottomSpacerHeight}px`,
                          }}
                        />
                      )}
                    </LayoutGroup>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </main>

      {/* Delete confirmation dialog */}
      <DeleteDialog
        project={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />

      {/* Keyboard shortcut sheet dialog */}
      <ShortcutSheetDialog
        open={shortcutSheetOpen}
        onClose={() => setShortcutSheetOpen(false)}
      />

      {/* Toast notifications */}
      <ToastContainer
        toast={toast}
        onUndoDelete={handleUndoDelete}
        onDismiss={() => setToast(null)}
      />
    </div>
  );
}
