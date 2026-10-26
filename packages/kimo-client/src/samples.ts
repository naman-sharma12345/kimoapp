import type * as s from './schema';

export const track: s.Track = {
  id: 'video',
  kind: 'video',
  name: 'picture',
  height: 88,
  muted: false,
  hidden: false,
  locked: false,
};
export const clip: s.Clip = {
  id: 'clip',
  trackId: 'video',
  assetId: 'asset',
  kind: 'video',
  start: 0,
  duration: 8,
  in: 0,
  transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
  effects: [],
  keyframes: [],
  speed: 1,
};
export const project: s.KimoProject = {
  id: 'project',
  version: 0,
  fps: 30,
  width: 1920,
  height: 1080,
  duration: 8,
  tracks: [track],
  clips: { clip },
  markers: [],
};
export const asset: s.Asset = {
  id: 'asset',
  kind: 'video',
  name: 'study.mp4',
  url: 'http://localhost:8787/fixtures/study-1.mp4',
  source: 'user',
  durationSec: 8,
};
