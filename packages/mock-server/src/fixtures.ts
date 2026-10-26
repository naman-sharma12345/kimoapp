import type { Asset, Clip, KimoProject, Op, ServerEvent } from '@kimo/client';

export function fixtureAssets(base: string): Asset[] {
  return [1, 2, 3]
    .map((index): Asset => ({
      id: `sample-${index}`,
      kind: 'video',
      name: `study-${index}.mp4`,
      url: `${base}/fixtures/study-${index}.mp4`,
      thumbUrl: `${base}/fixtures/still.png`,
      durationSec: 8,
      width: 1920,
      height: 1080,
      source: 'user',
    }))
    .concat([
      {
        id: 'sample-music',
        kind: 'audio',
        name: 'quiet-study.wav',
        url: `${base}/fixtures/quiet-study.wav`,
        durationSec: 24,
        source: 'user',
      },
      {
        id: 'sample-image',
        kind: 'image',
        name: 'still.png',
        url: `${base}/fixtures/still.png`,
        width: 1920,
        height: 1080,
        source: 'web',
        attribution: {
          site: 'kimo fixture library',
          pageUrl:
            'https://github.com/naman-sharma12345/kimoapp/tree/main/packages/mock-server/fixtures',
          license: 'CC0-1.0',
        },
      },
      {
        id: 'sample-mask',
        kind: 'image',
        name: 'mask.png',
        url: `${base}/fixtures/mask.png`,
        width: 1920,
        height: 1080,
        source: 'user',
      },
    ]);
}
export function emptyProject(id: string, aspect = '16:9'): KimoProject {
  return {
    id,
    version: 0,
    fps: 30,
    width: aspect === '9:16' || aspect === '1:1' ? 1080 : 1920,
    height: aspect === '9:16' ? 1920 : 1080,
    duration: 0,
    tracks: [],
    clips: {},
    markers: [],
  };
}
export function sampleClip(
  id: string,
  trackId: string,
  start = 0,
  kind: Clip['kind'] = 'video',
): Clip {
  return {
    id,
    trackId,
    assetId: kind === 'video' ? `sample-${id.replace('clip-', '')}` : undefined,
    kind,
    start,
    duration: 8,
    in: 0,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    effects: [],
    keyframes: [],
    speed: 1,
  };
}
export interface ScriptAction {
  tool: string;
  title: string;
  ops: Op[];
  events?: ServerEvent[];
}
export function editScript(assets: Asset[]): ScriptAction[] {
  const actions: ScriptAction[] = [];
  const add = (
    tool: string,
    title: string,
    ops: Op[],
    events?: ServerEvent[],
  ) => actions.push({ tool, title, ops, events });
  for (const [id, kind, name, height] of [
    ['video', 'video', 'video', 88],
    ['text', 'text', 'captions', 48],
    ['audio', 'audio', 'music', 64],
    ['overlay', 'overlay', 'images', 64],
  ] as const)
    add('add_track', `prepare ${name} track`, [
      {
        op: 'track.add',
        track: {
          id,
          kind,
          name,
          height,
          muted: false,
          hidden: false,
          locked: false,
        },
      },
    ]);
  for (let i = 1; i <= 3; i++) {
    const asset = assets.find((item) => item.id === `sample-${i}`);
    add(
      'import_clip',
      `import clip ${i}`,
      [{ op: 'clip.add', clip: sampleClip(`clip-${i}`, 'video', (i - 1) * 8) }],
      asset ? [{ t: 'asset.added', asset }] : [],
    );
  }
  for (let i = 1; i <= 3; i++)
    add('trim_clip', `trim clip ${i}`, [
      { op: 'clip.trim', id: `clip-${i}`, edge: 'out', value: 7 },
    ]);
  add('reorder_clip', 'bring the second shot forward', [
    { op: 'clip.move', id: 'clip-2', trackId: 'video', start: 0 },
    { op: 'clip.move', id: 'clip-1', trackId: 'video', start: 7 },
    { op: 'clip.move', id: 'clip-3', trackId: 'video', start: 14 },
  ]);
  add('add_title', 'write the opening title', [
    {
      op: 'clip.add',
      clip: {
        ...sampleClip('title', 'text', 0, 'text'),
        duration: 3,
        text: { content: 'a quieter kind of motion', style: 'title' },
      },
    },
  ]);
  for (let i = 0; i < 6; i++)
    add('add_captions', `caption phrase ${i + 1}`, [
      {
        op: 'clip.add',
        clip: {
          ...sampleClip(`caption-${i}`, 'text', i * 3.5, 'text'),
          duration: 3.5,
          text: {
            content: 'find a little room to breathe',
            style: 'caption',
            words: ['find', 'a', 'little', 'room', 'to', 'breathe'].map(
              (w, index) => ({ t: index * 0.5, d: 0.5, w }),
            ),
          },
        },
      },
    ]);
  for (let i = 1; i <= 3; i++)
    add('colour_grade', `warm the tones in clip ${i}`, [
      {
        op: 'effect.set',
        clipId: `clip-${i}`,
        effect: {
          id: 'grade',
          type: 'colour_grade',
          params: { exposure: 0.1, warmth: 0.15, contrast: 0.95 },
        },
      },
    ]);
  add(
    'segment_subject',
    'isolate the subject in clip 2',
    [
      {
        op: 'clip.update',
        id: 'clip-2',
        patch: {
          mask: {
            kind: 'sam',
            maskAssetId: 'sample-mask',
            invert: false,
            feather: 2,
          },
        },
      },
    ],
    [
      {
        t: 'sam.mask',
        clipId: 'clip-2',
        maskAssetId: 'sample-mask',
        previewPolygon: [
          [0.3, 0.1],
          [0.7, 0.1],
          [0.8, 0.9],
          [0.2, 0.9],
        ],
      },
      ...assets
        .filter((asset) => asset.id === 'sample-mask')
        .map((asset): ServerEvent => ({ t: 'asset.added', asset })),
    ],
  );
  add(
    'search_images',
    'find an image for the closing beat',
    [
      {
        op: 'clip.add',
        clip: {
          ...sampleClip('image', 'overlay', 18, 'image'),
          assetId: 'sample-image',
          duration: 3,
        },
      },
    ],
    assets
      .filter((asset) => asset.id === 'sample-image')
      .map((asset): ServerEvent => ({ t: 'asset.added', asset })),
  );
  add(
    'add_music',
    'lay in a quiet music bed',
    [
      {
        op: 'clip.add',
        clip: {
          ...sampleClip('music', 'audio', 0, 'audio'),
          assetId: 'sample-music',
          duration: 21,
          volume: 0.35,
        },
      },
    ],
    assets
      .filter((asset) => asset.id === 'sample-music')
      .map((asset): ServerEvent => ({ t: 'asset.added', asset })),
  );
  add('duck_audio', 'make room for the voice', [
    {
      op: 'effect.set',
      clipId: 'music',
      effect: {
        id: 'ducking',
        type: 'ducking',
        params: { gain: 0.15, attack: 0.14, release: 0.36 },
      },
    },
  ]);
  for (const id of ['clip-1', 'clip-3'])
    add('add_transition', 'soften the cut', [
      {
        op: 'clip.update',
        id,
        patch: { transitionIn: { type: 'dissolve', duration: 0.36 } },
      },
    ]);
  for (let i = 1; i <= 3; i++)
    add('reframe_clip', `refine the framing in clip ${i}`, [
      {
        op: 'clip.update',
        id: `clip-${i}`,
        patch: {
          transform: { x: 0, y: 0, scale: 1.04, rotation: 0, opacity: 1 },
        },
      },
    ]);
  for (let i = 1; i <= 3; i++)
    add('animate_frame', `add a measured push to clip ${i}`, [
      {
        op: 'keyframe.set',
        clipId: `clip-${i}`,
        keyframe: {
          id: 'push',
          property: 'scale',
          time: 6,
          value: 1.08,
          easing: 'ease-out',
        },
      },
    ]);
  for (let i = 0; i < 6; i++)
    add('refine_captions', `refine caption ${i + 1}`, [
      {
        op: 'effect.set',
        clipId: `caption-${i}`,
        effect: {
          id: 'caption-placement',
          type: 'caption_placement',
          params: { position: 'lower', safeArea: 0.08 },
        },
      },
    ]);
  add('mix_audio', 'balance the final mix', [
    {
      op: 'clip.update',
      id: 'music',
      patch: {
        volume: 0.28,
        transitionOut: { type: 'audio_fade', duration: 0.64 },
      },
    },
  ]);
  add('refine_title', 'settle the opening title', [
    { op: 'text.update', clipId: 'title', content: 'a quieter kind of motion' },
  ]);
  add('mark_review', 'mark the opening for review', [
    {
      op: 'marker.add',
      marker: { id: 'review-start', time: 0, label: 'opening' },
    },
  ]);
  add('mark_review', 'mark the closing beat', [
    {
      op: 'marker.add',
      marker: { id: 'review-end', time: 18, label: 'closing' },
    },
  ]);
  add('check_timeline', 'check the final timeline', [
    { op: 'track.update', id: 'video', patch: { name: 'picture' } },
  ]);
  add('check_audio', 'check the soundtrack track', [
    { op: 'track.update', id: 'audio', patch: { name: 'soundtrack' } },
  ]);
  return actions;
}
