import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { analyzeClip } from './analyze.mjs';
import { loadLook, defaultLook, LOOK_IDS } from './looks.mjs';
import { makeCorrection, writeLut, transform } from './lut.mjs';
import { clamp, luma } from './math.mjs';

export function colorConfig({ template = '', previous, note = '' } = {}) {
  const id =
    LOOK_IDS.find((id) => note.toLowerCase().includes(id)) ??
    previous?.look ??
    defaultLook(template);
  return {
    version: 1,
    enabled: true,
    look: id,
    strength: previous?.strength ?? 1,
    grain: previous?.grain ?? false,
    vignette: previous?.vignette ?? false,
    sharpen: previous?.sharpen ?? true,
    locked: previous?.locked ?? false,
  };
}
export function changeColor(edl, settings) {
  if (!LOOK_IDS.includes(settings.look))
    throw new Error('Choose a known colour look');
  if (
    !Number.isFinite(settings.strength) ||
    settings.strength < 0 ||
    settings.strength > 1
  )
    throw new Error('Look strength must be between 0 and 1');
  const changed = structuredClone(edl);
  changed.color_finish = {
    version: 1,
    enabled: true,
    look: settings.look,
    strength: settings.strength,
    grain: settings.grain === true,
    vignette: settings.vignette === true,
    sharpen: settings.sharpen !== false,
    locked: true,
  };
  delete changed.color_report;
  return changed;
}
/** Called after source probing, before any geometry bake or caption pass. */
export async function prepareColor(
  edl,
  { ffmpeg, cacheDir, projectDir, signal, emit = () => {} },
) {
  if (!edl.color_finish?.enabled) return null;
  const id = randomUUID().slice(0, 8),
    started = Date.now(),
    config = edl.color_finish,
    records = [];
  emit({
    t: 'op',
    id,
    opId: id,
    tool: 'colour_finish',
    phase: 'start',
    title: `colour finish · ${config.look}`,
    why: 'per-clip exposure, white balance, shot matching and skin-protected LUTs',
    at: started,
  });
  try {
    for (const track of edl.video)
      for (const clip of track.clips) {
        const source = edl.sources.find((s) => s.id === clip.src);
        if (
          !source ||
          source.alpha ||
          source.kind === 'image' ||
          (clip._overlayIndex != null && !clip._pip)
        )
          continue;
        signal?.throwIfAborted();
        const head =
          edl.camera_plan?.heads?.[source.path.replaceAll('\\', '/')];
        const stats = await analyzeClip({
          ffmpeg,
          source,
          clip,
          cacheDir: join(cacheDir, 'analysis'),
          samDir: join(projectDir, 'sam'),
          head,
          signal,
          emit,
        });
        const broll =
          /broll|b-roll|overlay|backdrop/.test(track.track) ||
          Boolean(clip.broll);
        if (
          edl.camera_plan?.screenRegions?.[clip.id]?.length ||
          (edl.cut_plan?.screen_punch ?? []).some((p) => p.clip_id === clip.id)
        )
          stats.screen = true;
        records.push({
          clip,
          source,
          stats,
          broll,
          length: (clip.out - clip.in) / (clip.speed ?? 1),
        });
      }
    const reference =
      [...records]
        .filter((r) => !r.broll && r.stats.available)
        .sort((a, b) => b.length - a.length)[0] ??
      records.find((r) => r.stats.available);
    if (reference) reference.correction = makeCorrection(reference.stats);
    const report = {
      version: 1,
      reference_clip: reference?.clip.id ?? null,
      look: config.look,
      strength: config.strength,
      clips: [],
      limitations: [
        'Colour metrics use sparse decoded samples, not every frame.',
        'Scene-average ΔE is a proxy; different content is not a calibrated colour chart.',
        'The existing perspective warp is 8-bit only. Float LUT processing is dithered once to limited-range 8-bit before that warp; captions/graphics are composited afterwards.',
      ],
    };
    for (const [index, record] of records.entries()) {
      const correction =
        record === reference
          ? reference.correction
          : makeCorrection(record.stats, reference, { broll: record.broll });
      const override = config.clip_overrides?.[record.clip.id],
        look = override?.look ?? config.look,
        strength = clamp(override?.strength ?? config.strength),
        data = loadLook(look);
      const primaries = (record.clip.grade?.effects ?? []).filter(
        (e) => e.kind === 'primaries',
      );
      const lut = await writeLut(join(cacheDir, 'luts'), {
        correction,
        look,
        strength,
        primaries,
      });
      record.clip._color = {
        lut: lut.path,
        key: lut.key,
        look,
        strength,
        grain: config.grain && data.grain,
        vignette: config.vignette,
        sharpen: config.sharpen,
      };
      const samples = record.stats.samples ?? [],
        output = samples.map((rgb) =>
          transform(rgb, { correction, look, strength, primaries }),
        );
      const clipped =
        (output.filter((rgb) => luma(rgb) <= 1 / 255 || luma(rgb) >= 254 / 255)
          .length /
          Math.max(1, output.length)) *
        100;
      const entry = {
        clip: record.clip.id,
        source: record.source.id,
        broll: record.broll,
        available: record.stats.available,
        analysis: record.stats.key,
        cached: record.stats.cached ?? false,
        frames: record.stats.frames,
        skipped: record.stats.skipped,
        p1: record.stats.p1,
        p50: record.stats.p50,
        p99: record.stats.p99,
        input_clipped_low_pct: record.stats.clipped_low_pct,
        input_clipped_high_pct: record.stats.clipped_high_pct,
        output_clipped_pct_estimate: output.length ? clipped : null,
        log_like: record.stats.log_like,
        skin_region: record.stats.skin?.region,
        skin_samples: record.stats.skin?.count ?? 0,
        correction,
        lut: lut.key,
      };
      report.clips.push(entry);
      emit({
        t: 'progress',
        phase: 'colour',
        label: `matching colour · ${record.clip.id}`,
        f: (index + 1) / records.length,
      });
      if (entry.output_clipped_pct_estimate >= 0.5)
        emit({
          t: 'op',
          tool: 'colour_warning',
          phase: 'end',
          ok: true,
          warning: true,
          title: `${entry.clip}: sampled output clipping ${clipped.toFixed(2)}%; inspect source highlights`,
          at: Date.now(),
        });
    }
    await mkdir(join(projectDir, 'color'), { recursive: true });
    await writeFile(
      join(projectDir, 'color', 'report.json'),
      JSON.stringify(report, null, 2),
    );
    edl.color_report = report;
    emit({
      t: 'op',
      id,
      phase: 'end',
      ok: true,
      ms: Date.now() - started,
      result: `${records.length} footage LUTs · reference ${report.reference_clip ?? 'unavailable'} · ${config.look}`,
    });
    return report;
  } catch (error) {
    emit({
      t: 'op',
      id,
      phase: 'end',
      ok: false,
      ms: Date.now() - started,
      error: error.message,
    });
    throw error;
  }
}
