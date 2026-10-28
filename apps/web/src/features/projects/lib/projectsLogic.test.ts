import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  computeVirtualWindow,
  filterAndSortProjects,
  formatDuration,
  formatProjectMeta,
  getNextRovingIndex,
  getPosterSeedSpec,
  isInProgressStatus,
  splitHighlightText,
} from './projectsLogic';
import type { Project } from '../types/projects';

const SAMPLE_PROJECTS: Project[] = [
  {
    id: 'proj-1',
    sessionId: 'sess-1',
    title: 'mountain drive',
    prompt: 'cinematic mountain road trip at dusk with film grain',
    status: 'editing',
    aspect: '16:9',
    durationSec: 42,
    agentActivity: 'grading the mountain shots',
    clipCount: 12,
    trackCount: 4,
    createdAt: '2026-10-28T10:00:00.000Z',
    updatedAt: '2026-10-28T11:30:00.000Z',
  },
  {
    id: 'proj-2',
    sessionId: 'sess-2',
    videoId: 'vid-2',
    title: 'sticker series',
    prompt: 'fast cut tactile sticker animation on dark paper',
    status: 'done',
    aspect: '1:1',
    durationSec: 105,
    clipCount: 18,
    trackCount: 5,
    createdAt: '2026-10-20T09:00:00.000Z',
    updatedAt: '2026-10-24T15:00:00.000Z',
  },
  {
    id: 'proj-3',
    sessionId: 'sess-3',
    title: 'brand reveal',
    prompt: 'minimalist logo reveal in warm cream and charcoal',
    status: 'failed',
    aspect: '9:16',
    durationSec: 15,
    clipCount: 6,
    trackCount: 3,
    createdAt: '2026-10-25T09:00:00.000Z',
    updatedAt: '2026-10-26T12:00:00.000Z',
  },
];

test('isInProgressStatus identifies editing, awaiting_review, rendering, and draft', () => {
  assert.equal(isInProgressStatus('editing'), true);
  assert.equal(isInProgressStatus('awaiting_review'), true);
  assert.equal(isInProgressStatus('rendering'), true);
  assert.equal(isInProgressStatus('draft'), true);
  assert.equal(isInProgressStatus('done'), false);
  assert.equal(isInProgressStatus('failed'), false);
});

test('filterAndSortProjects filters by segment, query, and sorts properly', () => {
  const inProgress = filterAndSortProjects(
    SAMPLE_PROJECTS,
    'in_progress',
    '',
    'recent',
  );
  assert.equal(inProgress.length, 1);
  assert.equal(inProgress[0]?.id, 'proj-1');

  const finished = filterAndSortProjects(
    SAMPLE_PROJECTS,
    'finished',
    '',
    'recent',
  );
  assert.equal(finished.length, 1);
  assert.equal(finished[0]?.id, 'proj-2');

  const searched = filterAndSortProjects(
    SAMPLE_PROJECTS,
    'all',
    'dusk',
    'recent',
  );
  assert.equal(searched.length, 1);
  assert.equal(searched[0]?.title, 'mountain drive');

  const longest = filterAndSortProjects(SAMPLE_PROJECTS, 'all', '', 'longest');
  assert.equal(longest[0]?.id, 'proj-2');
  assert.equal(longest[2]?.id, 'proj-3');

  const aToZ = filterAndSortProjects(SAMPLE_PROJECTS, 'all', '', 'a_to_z');
  assert.equal(aToZ[0]?.title, 'brand reveal');
  assert.equal(aToZ[1]?.title, 'mountain drive');
  assert.equal(aToZ[2]?.title, 'sticker series');
});

test('formatDuration and formatProjectMeta return exact expected formats', () => {
  assert.equal(formatDuration(42), '0:42');
  assert.equal(formatDuration(105), '1:45');

  const nowMs = new Date('2026-10-28T13:30:00.000Z').getTime();
  assert.equal(
    formatProjectMeta(SAMPLE_PROJECTS[0]!, nowMs),
    'edited 2h ago · 12 clips',
  );
  assert.equal(
    formatProjectMeta(SAMPLE_PROJECTS[1]!, nowMs),
    'finished oct 24 · 1080p',
  );
  assert.equal(formatProjectMeta(SAMPLE_PROJECTS[2]!, nowMs), 'render failed');
});

test('splitHighlightText splits matching words for search underline', () => {
  const parts = splitHighlightText('mountain drive', 'mountain');
  assert.deepEqual(parts, [
    { text: 'mountain', matched: true },
    { text: ' drive', matched: false },
  ]);
});

test('getPosterSeedSpec deterministically produces valid poster composition', () => {
  const specA = getPosterSeedSpec('kimo-04-vlog-day-3-cut');
  const specB = getPosterSeedSpec('kimo-04-vlog-day-3-cut');
  assert.deepEqual(specA, specB);
  assert.ok(specA.horizonYPercent >= 48 && specA.horizonYPercent <= 72);
  assert.ok(specA.shapeOffsetX >= -18 && specA.shapeOffsetX <= 18);
  assert.ok(specA.shapeOffsetY >= -10 && specA.shapeOffsetY <= 10);
});

test('computeVirtualWindow calculates row slice and spacers accurately for 300 projects', () => {
  const win = computeVirtualWindow({
    totalItems: 300,
    columns: 4,
    rowHeight: 240,
    rowGap: 32,
    scrollTop: 1500,
    viewportHeight: 900,
    gridOffsetTop: 200,
    overscanRows: 2,
  });
  assert.equal(win.totalRows, 75);
  assert.ok(win.startIndex >= 0 && win.startIndex < win.endIndex);
  assert.ok(win.endIndex <= 300);
  assert.ok(win.topSpacerHeight > 0);
  assert.ok(win.bottomSpacerHeight > 0);
});

test('getNextRovingIndex navigates 2D grid by columns', () => {
  assert.equal(
    getNextRovingIndex({
      currentIndex: 0,
      totalItems: 14,
      columns: 4,
      key: 'ArrowRight',
    }),
    1,
  );
  assert.equal(
    getNextRovingIndex({
      currentIndex: 1,
      totalItems: 14,
      columns: 4,
      key: 'ArrowDown',
    }),
    5,
  );
  assert.equal(
    getNextRovingIndex({
      currentIndex: 5,
      totalItems: 14,
      columns: 4,
      key: 'ArrowUp',
    }),
    1,
  );
});
