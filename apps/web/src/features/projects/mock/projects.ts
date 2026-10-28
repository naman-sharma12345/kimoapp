import type { Project, UserProfile } from '../types/projects';

export const MOCK_NOW_ISO = '2026-10-28T19:00:00+05:30';
export const MOCK_NOW_MS = new Date(MOCK_NOW_ISO).getTime();

export const MOCK_USER: UserProfile = {
  name: 'arjun mehta',
  email: 'arjun@getkimo.tech',
  avatarInitials: 'am',
};

export const AGENT_ACTIVITY_ROTATION = [
  'grading the mountain shots',
  'trimming the intro',
  'adding captions',
  'balancing the music',
] as const;

export const INITIAL_PROJECTS: Project[] = [
  {
    id: 'kimo-01-mountain-drive',
    sessionId: 'sess-mountain-drive',
    title: 'mountain drive',
    prompt:
      'dusk drive along winding himalayan pass, warm super 16 grain, slow ambient synth fade in',
    status: 'editing',
    aspect: '16:9',
    durationSec: 42,
    agentActivity: 'grading the mountain shots',
    clipCount: 12,
    trackCount: 4,
    createdAt: '2026-10-28T09:15:00.000Z',
    updatedAt: '2026-10-28T11:30:00.000Z',
  },
  {
    id: 'kimo-02-how-this-film-was-made',
    sessionId: 'sess-how-this-film-was-made',
    title: 'how this film was made',
    prompt:
      'behind the scenes documentary breakdown of live timeline assembly and voice pacing',
    status: 'rendering',
    aspect: '16:9',
    durationSec: 94,
    renderProgress: 0.62,
    clipCount: 24,
    trackCount: 6,
    createdAt: '2026-10-28T10:40:00.000Z',
    updatedAt: '2026-10-28T13:12:00.000Z',
  },
  {
    id: 'kimo-03-the-art-of-motion',
    sessionId: 'sess-the-art-of-motion',
    title: 'the art of motion',
    prompt:
      'essay cut on optical rhythm, match cuts between pendulums and subway doors',
    status: 'awaiting_review',
    aspect: '16:9',
    durationSec: 68,
    clipCount: 19,
    trackCount: 5,
    createdAt: '2026-10-28T07:00:00.000Z',
    updatedAt: '2026-10-28T12:30:00.000Z',
  },
  {
    id: 'kimo-04-vlog-day-3-cut',
    sessionId: 'sess-vlog-day-3-cut',
    title: 'vlog day 3 cut',
    prompt:
      'kyoto morning coffee walk and studio setup, remove silences and keep natural room tone',
    status: 'draft',
    aspect: '16:9',
    durationSec: 118,
    clipCount: 31,
    trackCount: 4,
    createdAt: '2026-10-27T21:00:00.000Z',
    updatedAt: '2026-10-28T08:30:00.000Z',
  },
  {
    id: 'kimo-05-sticker-series',
    sessionId: 'sess-sticker-series',
    videoId: 'vid-sticker-series',
    title: 'sticker series',
    prompt:
      'stop-motion style paper cutouts snapping onto dark slate on every snare hit',
    status: 'done',
    aspect: '1:1',
    durationSec: 34,
    clipCount: 16,
    trackCount: 5,
    createdAt: '2026-10-24T14:00:00.000Z',
    updatedAt: '2026-10-24T18:20:00.000Z',
    expiresAt: '2026-11-23T18:20:00.000Z',
  },
  {
    id: 'kimo-06-no-timeline',
    sessionId: 'sess-no-timeline',
    videoId: 'vid-no-timeline',
    title: 'no timeline',
    prompt:
      'manifesto film showing raw footage transforming directly from spoken direction',
    status: 'done',
    aspect: '16:9',
    durationSec: 76,
    clipCount: 22,
    trackCount: 6,
    createdAt: '2026-10-23T10:00:00.000Z',
    updatedAt: '2026-10-23T14:10:00.000Z',
    expiresAt: '2026-11-22T14:10:00.000Z',
  },
  {
    id: 'kimo-07-isometric-build',
    sessionId: 'sess-isometric-build',
    videoId: 'vid-isometric-build',
    title: 'isometric build',
    prompt:
      'architectural model blocks rising in sequence with crisp foley clicks',
    status: 'done',
    aspect: '1:1',
    durationSec: 51,
    clipCount: 14,
    trackCount: 4,
    createdAt: '2026-10-22T06:00:00.000Z',
    updatedAt: '2026-10-22T09:40:00.000Z',
    expiresAt: '2026-11-21T09:40:00.000Z',
  },
  {
    id: 'kimo-08-flat-vector-sentence',
    sessionId: 'sess-flat-vector-sentence',
    videoId: 'vid-flat-vector-sentence',
    title: 'flat vector sentence',
    prompt:
      'kinetic typography in warm cream on charcoal synced to a calm voiceover',
    status: 'done',
    aspect: '16:9',
    durationSec: 29,
    clipCount: 9,
    trackCount: 3,
    createdAt: '2026-10-21T18:00:00.000Z',
    updatedAt: '2026-10-21T20:15:00.000Z',
    expiresAt: '2026-11-20T20:15:00.000Z',
  },
  {
    id: 'kimo-09-no-cursor-needed',
    sessionId: 'sess-no-cursor-needed',
    videoId: 'vid-no-cursor-needed',
    title: 'no cursor needed',
    prompt:
      'screen study of hands-off editing flow with subtle zoom ins on timeline cuts',
    status: 'done',
    aspect: '16:9',
    durationSec: 62,
    clipCount: 17,
    trackCount: 4,
    createdAt: '2026-10-20T12:00:00.000Z',
    updatedAt: '2026-10-20T16:50:00.000Z',
    expiresAt: '2026-11-19T16:50:00.000Z',
  },
  {
    id: 'kimo-10-manali-trip-reel',
    sessionId: 'sess-manali-trip-reel',
    videoId: 'vid-manali-trip-reel',
    title: 'manali trip reel',
    prompt:
      'vertical travel reel of pine forests, river crossings and bonfire nights',
    status: 'done',
    aspect: '9:16',
    durationSec: 45,
    clipCount: 21,
    trackCount: 5,
    createdAt: '2026-10-19T08:30:00.000Z',
    updatedAt: '2026-10-19T12:00:00.000Z',
    expiresAt: '2026-11-18T12:00:00.000Z',
  },
  {
    id: 'kimo-11-podcast-ep-12-shorts',
    sessionId: 'sess-podcast-ep-12-shorts',
    videoId: 'vid-podcast-ep-12-shorts',
    title: 'podcast ep 12 shorts',
    prompt:
      'two-camera studio conversation cut to the best 60 second insight with clean captions',
    status: 'done',
    aspect: '9:16',
    durationSec: 58,
    clipCount: 11,
    trackCount: 4,
    createdAt: '2026-10-18T09:00:00.000Z',
    updatedAt: '2026-10-18T11:30:00.000Z',
    expiresAt: '2026-11-17T11:30:00.000Z',
  },
  {
    id: 'kimo-12-sneaker-launch-teaser',
    sessionId: 'sess-sneaker-launch-teaser',
    title: 'sneaker launch teaser',
    prompt:
      'macro leather texture shots, quick flash frames and sub bass drop at 0:15',
    status: 'failed',
    aspect: '9:16',
    durationSec: 24,
    clipCount: 15,
    trackCount: 5,
    createdAt: '2026-10-17T14:00:00.000Z',
    updatedAt: '2026-10-17T15:45:00.000Z',
  },
  {
    id: 'kimo-13-lofi-study-loop',
    sessionId: 'sess-lofi-study-loop',
    videoId: 'vid-lofi-study-loop',
    title: 'lofi study loop',
    prompt:
      'rain on window pane at dusk, warm desk lamp flicker, seamless 3 minute audio visual loop',
    status: 'done',
    aspect: '16:9',
    durationSec: 180,
    clipCount: 8,
    trackCount: 3,
    createdAt: '2026-10-15T19:00:00.000Z',
    updatedAt: '2026-10-15T22:10:00.000Z',
    expiresAt: '2026-11-14T22:10:00.000Z',
  },
  {
    id: 'kimo-14-brand-reveal',
    sessionId: 'sess-brand-reveal',
    videoId: 'vid-brand-reveal',
    title: 'brand reveal',
    prompt:
      'four rounded bars and orange playhead locking into frame with a soft analog tape thump',
    status: 'done',
    aspect: '1:1',
    durationSec: 19,
    clipCount: 7,
    trackCount: 3,
    createdAt: '2026-10-14T08:00:00.000Z',
    updatedAt: '2026-10-14T10:05:00.000Z',
    expiresAt: '2026-11-13T10:05:00.000Z',
  },
];

export function generateManyProjects(count = 300): Project[] {
  const result: Project[] = [];
  for (let i = 0; i < count; i++) {
    const base = INITIAL_PROJECTS[i % INITIAL_PROJECTS.length]!;
    if (i < INITIAL_PROJECTS.length) {
      result.push({ ...base });
      continue;
    }
    const reelNum = Math.floor(i / INITIAL_PROJECTS.length) + 1;
    const updatedMs = MOCK_NOW_MS - (i + 1) * 3600 * 1000 * 3;
    const createdMs = updatedMs - 3600 * 1000 * 2;
    result.push({
      ...base,
      id: `${base.id}-take-${i + 1}`,
      sessionId: `${base.sessionId}-take-${i + 1}`,
      videoId: base.videoId
        ? `${base.videoId}-take-${i + 1}`
        : `vid-take-${i + 1}`,
      title: `${base.title} ${reelNum}`,
      status: i % 29 === 0 ? 'failed' : i % 19 === 0 ? 'draft' : 'done',
      renderProgress: undefined,
      agentActivity: undefined,
      durationSec: ((base.durationSec + i * 7) % 165) + 15,
      clipCount: ((base.clipCount + i * 3) % 28) + 4,
      createdAt: new Date(createdMs).toISOString(),
      updatedAt: new Date(updatedMs).toISOString(),
    });
  }
  return result;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function mockRenameProject(
  _id: string,
  _title: string,
): Promise<void> {
  await wait(140);
}

export async function mockDuplicateProject(source: Project): Promise<Project> {
  await wait(180);
  const nowIso = new Date(MOCK_NOW_MS).toISOString();
  return {
    ...source,
    id: `${source.id}-copy-${Date.now()}`,
    sessionId: `${source.sessionId}-copy-${Date.now()}`,
    videoId: source.videoId
      ? `${source.videoId}-copy-${Date.now()}`
      : undefined,
    title: `${source.title} copy`,
    status:
      source.status === 'editing' || source.status === 'rendering'
        ? 'draft'
        : source.status,
    renderProgress: undefined,
    agentActivity: undefined,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export async function mockDeleteProject(_id: string): Promise<void> {
  await wait(140);
}

export async function mockUndoDeleteProject(_id: string): Promise<void> {
  await wait(120);
}
