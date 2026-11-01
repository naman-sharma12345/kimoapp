import { randomUUID } from 'node:crypto';
import { frameCount, rate, validate } from '../edl.mjs';

/** A main-process probed, user-selected audio file replaces the automatic bed. */
export function addUserMusic(current, file) {
  if (!file?.audio || !file.path || !(file.duration > 0))
    throw new Error('Readable music is required');
  const edl = structuredClone(current),
    id = `music-${randomUUID().slice(0, 8)}`,
    duration = frameCount(edl) / rate(edl.canvas.fps);
  edl.audio = edl.audio.filter((t) => t.role !== 'MUSIC');
  edl.sources.push({
    id,
    path: file.path,
    kind: 'audio',
    audio: true,
    duration: file.duration,
    fps: edl.canvas.fps,
  });
  edl.audio.push({
    track: 'user-music',
    name: 'MUSIC',
    role: 'MUSIC',
    clips: [
      {
        id: `${id}-bed`,
        src: id,
        at: 0,
        in: 0,
        out: file.duration,
        dur: duration,
        speed: 1,
      },
    ],
  });
  edl.sound = {
    ...edl.sound,
    version: 8,
    enabled: true,
    target_lufs: edl.sound?.target_lufs ?? -14,
    music_id: id,
  };
  delete edl.sound.report;
  return validate(edl);
}
