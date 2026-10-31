// Phase 7.4 / 7.5c sound: the UI tick/pop on item entrances, a soft whoosh
// on full-screen entrances, and the sound-gag kit for humour beats. Every
// sound is synthesised by FFmpeg from the formulas below the first time it
// is used (cached as 48 kHz WAV): kimo's own work, dedicated CC0, so no
// third-party audio ships. Crowd sounds (laugh track, "ooh") cannot be
// synthesised convincingly and map to the nearest gag (noted in the plan).
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export const SFX_VERSION = 1;
// aevalsrc expressions (t in seconds), duration, peak around -6 dBFS
export const KIT = {
  tick: { d: 0.05, e: '0.5*sin(2*PI*2400*t)*exp(-t*120)' },
  pop: { d: 0.12, e: '0.5*sin(2*PI*(520-1800*t)*t)*exp(-t*38)' },
  whoosh: { d: 0.5, noise: true, e: 'sin(PI*t/0.5)^2' },
  record_scratch: { d: 0.45, e: '0.45*sin(2*PI*(300+260*sin(2*PI*9*t))*t)*(1-t/0.45)+0.08*(random(0)-0.5)' },
  boing: { d: 0.6, e: '0.5*sin(2*PI*(180+60*sin(2*PI*14*t)*exp(-t*3))*t)*exp(-t*4)' },
  ding: { d: 0.9, e: '0.35*(sin(2*PI*1320*t)+0.5*sin(2*PI*2640*t))*exp(-t*5)' },
  bass_drop: { d: 1.0, e: '0.6*sin(2*PI*(110*t-35*t*t))*exp(-t*1.6)' },
  error_buzz: { d: 0.4, e: '0.3*sgn(sin(2*PI*110*t))*(lt(mod(t,0.2),0.15))' },
};
export const GAG_ALIASES = { ooh: 'ding', laugh: 'boing', laugh_track: 'boing', crowd: 'ding', scratch: 'record_scratch', buzz: 'error_buzz', drop: 'bass_drop' };
export const GAGS = ['record_scratch', 'boing', 'ding', 'bass_drop', 'error_buzz', 'ooh', 'laugh'];
/** Levels (dB on the SFX bus): ticks sit about 8 dB under voice, gags at least 6 dB under voice peaks. */
export const LEVELS = { tick: -16, pop: -15, whoosh: -14, gag: -11 };
export const MIN_SFX_GAP = 0.5;

export const gagName = (g) => (KIT[g] ? g : GAG_ALIASES[g] ?? 'ding');

/** Synthesises (once) and returns the WAV path of a kit sound. */
export function sfxFile(name, { ffmpeg = 'ffmpeg', dir }) {
  const s = KIT[name];
  if (!s) throw new Error(`unknown sound ${name}`);
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `sfx-${name}-v${SFX_VERSION}.wav`);
  if (existsSync(out)) return out;
  const tmp = `${out}.part.wav`;
  const input = s.noise
    ? ['-f', 'lavfi', '-i', `anoisesrc=color=pink:amplitude=0.6:seed=7:sample_rate=48000:duration=${s.d}`]
    : ['-f', 'lavfi', '-i', `aevalsrc=exprs='${s.e}':sample_rate=48000:duration=${s.d}`];
  const af = s.noise
    ? `highpass=f=400,lowpass=f=3200,volume='${s.e}':eval=frame,afade=t=in:d=0.05,afade=t=out:st=${s.d - 0.08}:d=0.08`
    : `afade=t=in:d=0.003,afade=t=out:st=${Math.max(0, s.d - 0.02)}:d=0.02`;
  const r = spawnSync(ffmpeg, ['-nostdin', '-v', 'error', '-y', ...input, '-af', af, '-ac', '2', '-c:a', 'pcm_s16le', tmp], { windowsHide: true, encoding: 'utf8' });
  if (r.status !== 0 || !existsSync(tmp)) {
    rmSync(tmp, { force: true });
    throw new Error(`sound ${name} could not be made: ${(r.stderr ?? '').slice(-200)}`);
  }
  renameSync(tmp, out);
  return out;
}

/**
 * Picks sound cues for placed beats: one tick per item entrance (≥ 0.5 s
 * apart), a whoosh on full/pip entrances, the gag for sound_gag beats.
 * cues: [{at, kind: 'tick'|'pop'|'whoosh'|gag, beat}]. Returns the kept list.
 */
export function planSfx(cues) {
  const out = [];
  for (const c of [...cues].sort((a, b) => a.at - b.at)) {
    const name = c.kind === 'tick' || c.kind === 'pop' || c.kind === 'whoosh' ? c.kind : gagName(c.kind);
    const gag = !['tick', 'pop', 'whoosh'].includes(name);
    const prev = out.at(-1);
    if (prev && c.at - prev.at < MIN_SFX_GAP) {
      // a gag or whoosh wins over a tick at the same moment
      if ((gag || name === 'whoosh') && ['tick', 'pop'].includes(prev.name)) out.pop();
      else continue;
    }
    out.push({ at: Math.max(0, +c.at.toFixed(3)), name, gain_db: gag ? LEVELS.gag : LEVELS[name], beat: c.beat });
  }
  return out;
}
