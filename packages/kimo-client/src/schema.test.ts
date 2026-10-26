import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import * as s from './schema';

import { track, clip, project, asset } from './samples';

const effect: s.Effect = {
  id: 'grade',
  type: 'colour_grade',
  params: { exposure: 0.1 },
};
const keyframe: s.Keyframe = {
  id: 'scale',
  property: 'scale',
  time: 1,
  value: 1.1,
  easing: 'ease-out',
};
const marker = { id: 'opening', time: 0, label: 'opening' };
export const sampleOps: s.Op[] = [
  { op: 'clip.add', clip },
  { op: 'clip.update', id: 'clip', patch: { volume: 0.5 } },
  { op: 'clip.remove', id: 'clip' },
  { op: 'clip.move', id: 'clip', trackId: 'video', start: 2 },
  { op: 'clip.trim', id: 'clip', edge: 'out', value: 6 },
  { op: 'clip.split', id: 'clip', at: 4, newId: 'second' },
  { op: 'track.add', track },
  { op: 'track.update', id: 'video', patch: { muted: true } },
  { op: 'text.update', clipId: 'clip', content: 'a quieter kind of motion' },
  { op: 'effect.set', clipId: 'clip', effect },
  { op: 'keyframe.set', clipId: 'clip', keyframe },
  { op: 'marker.add', marker },
];
const contracts: [string, z.ZodType, unknown][] = [
  ['asset', s.assetSchema, asset],
  ['clip', s.clipSchema, clip],
  ['track', s.trackSchema, track],
  ['project', s.projectSchema, project],
  ['effect', s.effectSchema, effect],
  ['keyframe', s.keyframeSchema, keyframe],
  ['marker', s.markerSchema, marker],
  ['transition', s.transitionSchema, { type: 'dissolve', duration: 0.36 }],
  ['text style ID', s.textStyleIdSchema, 'caption'],
  [
    'uploads request',
    s.uploadRequestSchema,
    { files: [{ name: 'study.mp4', mime: 'video/mp4', size: 1024 }] },
  ],
  [
    'uploads response',
    s.uploadResponseSchema,
    {
      uploads: [
        {
          assetId: 'asset',
          putUrl: 'http://localhost:8787/mock-r2/asset',
          headers: { 'Content-Type': 'video/mp4' },
        },
      ],
    },
  ],
  [
    'sessions request',
    s.sessionRequestSchema,
    {
      prompt: 'make a quiet film',
      assetIds: ['asset'],
      aspect: '16:9',
      durationHint: 24,
    },
  ],
  [
    'sessions response',
    s.sessionResponseSchema,
    {
      sessionId: 'session',
      wsUrl: 'ws://localhost:8787/v1/sessions/session/ws',
    },
  ],
  [
    'snapshot',
    s.sessionSnapshotSchema,
    { status: 'editing', project, assets: [asset] },
  ],
  [
    'messages request',
    s.messageRequestSchema,
    { text: 'make it slower', attachments: ['asset'] },
  ],
  ['ops request', s.opsRequestSchema, { ops: sampleOps, baseVersion: 0 }],
  ['ops response', s.opsResponseSchema, { version: 1 }],
  ['approve response', s.approveResponseSchema, { renderId: 'render' }],
  [
    'render response',
    s.renderResponseSchema,
    {
      status: 'done',
      progress: 1,
      frame: 720,
      totalFrames: 720,
      etaSec: 0,
      videoId: 'video',
    },
  ],
  [
    'video response',
    s.videoResponseSchema,
    {
      url: 'http://localhost:8787/output.mp4',
      posterUrl: 'http://localhost:8787/poster.png',
      durationSec: 24,
      width: 1920,
      height: 1080,
      sizeBytes: 1024,
      title: 'a quiet film',
    },
  ],
  [
    'error',
    s.errorResponseSchema,
    { code: 'version_conflict', message: 'Refetch the project' },
  ],
];
describe('REST and project contracts', () => {
  it.each(contracts)('parses %s', (_name, schema, payload) => {
    expect(schema.safeParse(payload).success).toBe(true);
  });
  it.each(sampleOps)('parses $op', (op) => {
    expect(s.opSchema.parse(op)).toEqual(op);
  });
  it('rejects invalid numeric values, dimensions, unknown keys and dangling references', () => {
    for (const bad of [
      { ...clip, duration: -1 },
      { ...clip, speed: 0 },
      { ...clip, start: NaN },
      { ...clip, transform: { ...clip.transform, opacity: 2 } },
      { ...clip, surprise: true },
    ])
      expect(s.clipSchema.safeParse(bad).success).toBe(false);
    expect(s.projectSchema.safeParse({ ...project, fps: 60 }).success).toBe(
      false,
    );
    expect(
      s.projectSchema.safeParse({ ...project, width: 1920, height: 1920 })
        .success,
    ).toBe(false);
    expect(s.projectSchema.safeParse({ ...project, tracks: [] }).success).toBe(
      false,
    );
    expect(
      s.projectSchema.safeParse({ ...project, tracks: [track, track] }).success,
    ).toBe(false);
  });
});
const events: s.ServerEvent[] = [
  { t: 'hello', version: 0 },
  { t: 'agent.status', state: 'thinking', label: 'studying your footage' },
  {
    t: 'agent.action.start',
    id: 'action',
    tool: 'trim_clip',
    title: 'trim the opening',
    args: {},
    target: {
      clipId: 'clip',
      trackId: 'video',
      region: { x: 0, y: 0, w: 1, h: 1 },
    },
  },
  { t: 'agent.action.progress', id: 'action', pct: 0.5, note: 'working' },
  { t: 'agent.action.end', id: 'action', ok: true, durationMs: 140 },
  { t: 'project.ops', version: 1, ops: sampleOps, actionId: 'action' },
  {
    t: 'agent.message',
    id: 'message',
    role: 'agent',
    text: 'play it through',
    kind: 'ask_review',
  },
  { t: 'asset.added', asset },
  {
    t: 'sam.mask',
    clipId: 'clip',
    maskAssetId: 'mask',
    previewPolygon: [
      [0, 0],
      [1, 1],
    ],
  },
  { t: 'warmup.step', step: 'ready', pct: 1 },
  { t: 'error', code: 'failed', message: 'Simulated failure' },
];
describe('WebSocket contracts', () => {
  it.each(events)('parses $t', (event) => {
    expect(s.serverEventSchema.parse(event)).toEqual(event);
  });
  it.each([
    { t: 'interrupt', text: 'make it slower' },
    { t: 'pause' },
    { t: 'resume' },
    { t: 'ping' },
  ])('parses client $t', (event) => {
    expect(s.clientEventSchema.parse(event)).toEqual(event);
  });
  it('rejects unknown events and out-of-range progress', () => {
    expect(
      s.serverEventSchema.safeParse({
        t: 'warmup.step',
        step: 'upload',
        pct: 2,
      }).success,
    ).toBe(false);
    expect(
      s.clientEventSchema.safeParse({ t: 'delete_everything' }).success,
    ).toBe(false);
  });
});
