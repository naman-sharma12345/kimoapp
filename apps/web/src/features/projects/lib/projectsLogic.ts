import type {
  FilterSegment,
  ListSortColumn,
  Project,
  ProjectStatus,
  SortOption,
} from '../types/projects';

const IN_PROGRESS_STATUSES: ReadonlySet<ProjectStatus> = new Set([
  'editing',
  'awaiting_review',
  'rendering',
  'draft',
]);

export function isInProgressStatus(status: ProjectStatus): boolean {
  return IN_PROGRESS_STATUSES.has(status);
}

export function isContinueRailProject(project: Project): boolean {
  return (
    project.status === 'editing' ||
    project.status === 'rendering' ||
    project.status === 'awaiting_review'
  );
}

export function filterAndSortProjects(
  projects: readonly Project[],
  segment: FilterSegment,
  searchQuery: string,
  sort: SortOption,
  listColumnSort?: { column: ListSortColumn; direction: 'asc' | 'desc' } | null,
): Project[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const queryWords = normalizedQuery
    ? normalizedQuery.split(/\s+/).filter(Boolean)
    : [];

  const filtered = projects.filter((project) => {
    if (segment === 'in_progress' && !isInProgressStatus(project.status)) {
      return false;
    }
    if (segment === 'finished' && project.status !== 'done') {
      return false;
    }
    if (queryWords.length > 0) {
      const titleLower = project.title.toLowerCase();
      const promptLower = project.prompt.toLowerCase();
      return queryWords.every(
        (word) => titleLower.includes(word) || promptLower.includes(word),
      );
    }
    return true;
  });

  const sorted = [...filtered];

  if (listColumnSort) {
    const { column, direction } = listColumnSort;
    const dir = direction === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
      switch (column) {
        case 'title':
          return a.title.localeCompare(b.title) * dir;
        case 'status':
          return a.status.localeCompare(b.status) * dir;
        case 'aspect':
          return a.aspect.localeCompare(b.aspect) * dir;
        case 'duration':
          return (a.durationSec - b.durationSec) * dir;
        case 'edited':
          return (
            (new Date(a.updatedAt).getTime() -
              new Date(b.updatedAt).getTime()) *
            dir
          );
      }
    });
    return sorted;
  }

  sorted.sort((a, b) => {
    switch (sort) {
      case 'recent':
        return (
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      case 'oldest':
        return (
          new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
        );
      case 'longest':
        return b.durationSec - a.durationSec;
      case 'a_to_z':
        return a.title.localeCompare(b.title);
    }
  });

  return sorted;
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const MONTHS_SHORT = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const;

export function formatProjectMeta(project: Project, nowMs: number): string {
  if (project.status === 'failed') {
    return 'render failed';
  }
  if (project.status === 'done') {
    const dt = new Date(project.updatedAt);
    const month = MONTHS_SHORT[dt.getUTCMonth()] ?? 'oct';
    const day = dt.getUTCDate();
    return `finished ${month} ${day} · 1080p`;
  }
  const rel = formatRelativeTime(project.updatedAt, nowMs);
  return `edited ${rel} · ${project.clipCount} clips`;
}

export function formatRelativeTime(isoDate: string, nowMs: number): string {
  const targetMs = new Date(isoDate).getTime();
  const diffSec = Math.max(0, Math.floor((nowMs - targetMs) / 1000));

  if (diffSec < 60) {
    return 'just now';
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) {
    return `${diffDays}d ago`;
  }
  const dt = new Date(isoDate);
  const month = MONTHS_SHORT[dt.getUTCMonth()] ?? 'oct';
  const day = dt.getUTCDate();
  return `${month} ${day}`;
}

export type HighlightPart = {
  text: string;
  matched: boolean;
};

export function splitHighlightText(
  text: string,
  query: string,
): HighlightPart[] {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) {
    return [{ text, matched: false }];
  }
  const words = Array.from(
    new Set(
      cleanQuery
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    ),
  );
  if (words.length === 0) {
    return [{ text, matched: false }];
  }

  const regex = new RegExp(`(${words.join('|')})`, 'gi');
  const rawParts = text.split(regex);
  const result: HighlightPart[] = [];

  for (const part of rawParts) {
    if (!part) continue;
    const isMatch = words.some((w) => new RegExp(`^${w}$`, 'i').test(part));
    result.push({ text: part, matched: isMatch });
  }
  return result.length > 0 ? result : [{ text, matched: false }];
}

export type PosterSeedSpec = {
  bgTintVar: string;
  secondaryTintVar: string;
  accentTintVar: string;
  horizonYPercent: number;
  motif:
    | 'circle_horizon'
    | 'road_perspective'
    | 'vertical_bars'
    | 'architectural_grid';
  shapeOffsetX: number;
  shapeOffsetY: number;
  secondaryScale: number;
};

const TRACK_TINT_VARS = [
  'var(--tint-video)',
  'var(--tint-broll)',
  'var(--tint-image)',
  'var(--tint-music)',
  'var(--tint-voice)',
  'var(--tint-sfx)',
  'var(--tint-text)',
  'var(--tint-fx)',
] as const;

const MOTIFS: readonly PosterSeedSpec['motif'][] = [
  'circle_horizon',
  'road_perspective',
  'vertical_bars',
  'architectural_grid',
] as const;

export function hashProjectId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function getPosterSeedSpec(id: string): PosterSeedSpec {
  const hash = hashProjectId(id);
  const bgIdx = hash % TRACK_TINT_VARS.length;
  const secIdx = ((hash >>> 3) + 2) % TRACK_TINT_VARS.length;
  const accIdx = ((hash >>> 6) + 5) % TRACK_TINT_VARS.length;
  const motif = MOTIFS[(hash >>> 9) % MOTIFS.length] ?? 'circle_horizon';
  const horizonYPercent = 48 + ((hash >>> 12) % 24); // 48..71%
  const shapeOffsetX = -18 + ((hash >>> 15) % 37); // -18..18
  const shapeOffsetY = -10 + ((hash >>> 18) % 21); // -10..10
  const secondaryScale = 0.75 + ((hash >>> 21) % 45) / 100; // 0.75..1.19

  return {
    bgTintVar: TRACK_TINT_VARS[bgIdx] ?? 'var(--tint-video)',
    secondaryTintVar: TRACK_TINT_VARS[secIdx] ?? 'var(--tint-broll)',
    accentTintVar: TRACK_TINT_VARS[accIdx] ?? 'var(--tint-image)',
    horizonYPercent,
    motif,
    shapeOffsetX,
    shapeOffsetY,
    secondaryScale,
  };
}

export type VirtualWindowRange = {
  startRow: number;
  endRow: number;
  startIndex: number;
  endIndex: number;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
  totalRows: number;
};

export function computeVirtualWindow(params: {
  totalItems: number;
  columns: number;
  rowHeight: number;
  rowGap: number;
  scrollTop: number;
  viewportHeight: number;
  gridOffsetTop: number;
  overscanRows: number;
}): VirtualWindowRange {
  const {
    totalItems,
    columns,
    rowHeight,
    rowGap,
    scrollTop,
    viewportHeight,
    gridOffsetTop,
    overscanRows,
  } = params;

  const safeCols = Math.max(1, columns);
  const totalRows = Math.ceil(totalItems / safeCols);
  if (totalRows === 0) {
    return {
      startRow: 0,
      endRow: 0,
      startIndex: 0,
      endIndex: 0,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      totalRows: 0,
    };
  }

  const stride = rowHeight + rowGap;
  const relativeScrollTop = Math.max(0, scrollTop - gridOffsetTop);
  const firstVisibleRow = Math.floor(relativeScrollTop / stride);
  const visibleRowCount = Math.ceil(viewportHeight / stride) + 1;

  const startRow = Math.max(0, firstVisibleRow - overscanRows);
  const endRow = Math.min(
    totalRows - 1,
    firstVisibleRow + visibleRowCount + overscanRows,
  );

  const startIndex = startRow * safeCols;
  const endIndex = Math.min(totalItems, (endRow + 1) * safeCols);

  const topSpacerHeight = startRow * stride;
  const remainingRows = Math.max(0, totalRows - 1 - endRow);
  const bottomSpacerHeight = remainingRows * stride;

  return {
    startRow,
    endRow,
    startIndex,
    endIndex,
    topSpacerHeight,
    bottomSpacerHeight,
    totalRows,
  };
}

export function getNextRovingIndex(params: {
  currentIndex: number;
  totalItems: number;
  columns: number;
  key: 'ArrowRight' | 'ArrowLeft' | 'ArrowDown' | 'ArrowUp';
}): number {
  const { currentIndex, totalItems, columns, key } = params;
  if (totalItems <= 0) return 0;
  const safeCols = Math.max(1, columns);

  switch (key) {
    case 'ArrowRight':
      return Math.min(totalItems - 1, currentIndex + 1);
    case 'ArrowLeft':
      return Math.max(0, currentIndex - 1);
    case 'ArrowDown':
      return Math.min(totalItems - 1, currentIndex + safeCols);
    case 'ArrowUp':
      return Math.max(0, currentIndex - safeCols);
  }
}
