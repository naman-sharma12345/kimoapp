import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compose } from './compose.mjs';
import {
  fromKimoProject,
  toTimeline,
  publicEdl,
  frameCount,
  rate,
} from './edl.mjs';
import { directCamera } from './camera.mjs';
import { applyCaptions, captionStyle, pickCaptionStyle, CAPTION_ENGINE } from './captions.mjs';
import { editCaptionChunk } from './caption-edits.mjs';

/** Implements picture operations locally. The planner remains a read-only black-box toolbox. */
export function pictureTools({
  mcp,
  dir,
  files,
  mode,
  suppliedEdl,
  ffmpeg,
  ffprobe,
  out,
  savedEdl,
  signal,
  emit,
  fontsDir,
  runTool,
}) {
  const warnings = new Set();
  const api = {
    lastEdl: null,
    // Phase 3 transcript cut plan (keep segments by clip id, needs_cover joins, hook,
    // emphasis): rides on the EDL so later phases and follow-ups read the same decisions
    cutPlan: null,
    // Phase 4 camera director inputs ({ctx}); the director writes the A-roll camera keys on every snapshot
    camera: null,
    cameraReport: null,
    // Phase 5 caption engine ({enabled, style, hook_style, hints, keep}); chunks are rebuilt on every snapshot
    captions: null,
    captionEdits: [],
    captionReport: null,
    handles: new Set(['export', 'render_frame', 'contact_sheet', 'lint_edit']),
  };
  api.snapshot = async () => {
    const edl = await snapshotEdl();
    if (api.cutPlan) edl.cut_plan = api.cutPlan;
    return captioned(directed(edl));
  };
  /** Turns the app caption engine on: the planner's caption tools now restyle/edit kimo captions locally. */
  api.enableCaptions = (config) => {
    api.captions = { enabled: true, ...config };
    for (const n of ['auto_captions', 'caption_from_words', 'edit_caption']) api.handles.add(n);
  };
  const captioned = (edl) => {
    if (!api.captions || (mode === 'manual' && suppliedEdl)) return edl;
    const ctx = api.camera?.ctx ?? edl.camera_plan ?? {};
    if (!Object.values(ctx.words ?? {}).some((w) => w?.length)) return edl;
    try {
      applyCaptions(edl, api.captions, ctx);
      for (const op of api.captionEdits) {
        const o = edl.overlays.find((x) => x.id === op.args.clip_id && x.props?.engine === CAPTION_ENGINE);
        if (o) editCaptionChunk(edl, o, op);
      }
      api.captionReport = edl.captions?.stats ?? null;
    } catch (error) {
      const title = `captions skipped: ${error.message}`.slice(0, 200);
      if (!warnings.has(title)) {
        warnings.add(title);
        emit({ t: 'op', phase: 'end', tool: 'caption_warning', title, warning: true, ok: true, at: Date.now() });
      }
    }
    return edl;
  };
  const captionTool = async (name, args) => {
    if (name === 'edit_caption') {
      const edl = await api.snapshot();
      const o = edl.overlays.find((x) => x.id === args.clip_id && x.props?.engine === CAPTION_ENGINE);
      if (!o) return mcp.call(name, args);
      if (typeof args.text === 'string' && args.text.trim()) api.captionEdits.push({ tool: 'edit_caption', args: { clip_id: args.clip_id, text: args.text } });
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, clip_id: args.clip_id, text: args.text ?? o.props.text }) }] };
    }
    const canvas = (await snapshotEdl()).canvas;
    // a style the user picked in the app wins over the planner's choice
    const style = args.style && !api.captions?.locked ? pickCaptionStyle({ requested: args.style, canvas }) : api.captions?.style ?? 'kimo';
    api.captions = { ...api.captions, enabled: true, style };
    const edl = await api.snapshot();
    const s = edl.captions?.stats ?? {};
    return { content: [{ type: 'text', text: JSON.stringify({ engine: 'kimo captions (word-timed from the transcript, rendered by libass)', style: captionStyle(api.captions.style).id, chunks: s.chunks ?? 0, accent_share: s.accent_share, min_word_s: s.caption_min_word_s, safe: s.caption_safe, note: 'captions are placed below the chin, inside the safe area, and yield to hook titles automatically; use edit_caption with a cap### id to change words' }) }] };
  };
  const directed = (edl) => {
    const ctx = api.camera?.ctx ?? edl.camera_plan;
    if (!ctx) return edl;
    try {
      const { report } = directCamera(edl, ctx);
      edl.camera_plan = ctx;
      edl.camera_report = { energy: report.energy, shots: report.shots, snaps: report.snaps, pushes: report.pushes, openers: report.openers, budget_inserts: report.budget_inserts, speaker_shots: report.speaker_shots, screen_punches: report.screen_punches, transitions: report.transitions, jl: report.jl, ramps: report.ramps, metrics: report.metrics };
      api.cameraReport = report;
      for (const w of report.warnings)
        if (!warnings.has(w)) {
          warnings.add(w);
          emit({ t: 'op', phase: 'end', tool: 'camera_warning', title: w, warning: true, ok: true, at: Date.now() });
        }
    } catch (error) {
      const title = `camera director skipped: ${error.message}`.slice(0, 200);
      if (!warnings.has(title)) {
        warnings.add(title);
        emit({ t: 'op', phase: 'end', tool: 'camera_warning', title, warning: true, ok: true, at: Date.now() });
      }
    }
    return edl;
  };
  const snapshotEdl = async () => {
    if (mode === 'manual' && suppliedEdl) return structuredClone(suppliedEdl);
    const path = join(dir, 'planner-current.kimo.json');
    const result = await mcp.call('save_project', { path });
    if (result?.isError || !existsSync(path))
      throw new Error('Cannot save the planner project for composition');
    return fromKimoProject(JSON.parse(readFileSync(path, 'utf8')), files, {
      emit: (event) => {
        if (!warnings.has(event.title)) {
          warnings.add(event.title);
          emit(event);
        }
      },
    });
  };
  api.timeline = async () => {
    const current = await api.snapshot();
    return { ...toTimeline(current), edl: publicEdl(current) };
  };
  api.call = async (name, args) => {
    if (['auto_captions', 'caption_from_words', 'edit_caption'].includes(name)) {
      try {
        return await captionTool(name, args ?? {});
      } catch (error) {
        if (signal?.aborted) throw error;
        return { isError: true, content: [{ type: 'text', text: error.message }] };
      }
    }
    try {
      const edl = await api.snapshot(),
        meta = {
          renderer: 'kimoapp',
          frames: frameCount(edl),
          duration: frameCount(edl) / rate(edl.canvas.fps),
        };
      if (name === 'lint_edit')
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ...meta,
                warnings: edl.warnings,
                checks: ['EDL ranges, assets and tracks validated'],
                note: 'Picture QA runs on the composed output. No engine picture renderer was called.',
              }),
            },
          ],
        };
      if (name === 'export') {
        api.lastEdl = edl;
        if (edl.camera_report) {
          const r = edl.camera_report,
            id = Math.random().toString(16).slice(2, 10);
          emit({ t: 'op', id, phase: 'start', tool: 'camera_director', title: `camera director · energy ${r.energy} · ${r.shots} shots`, why: 'framing changes at every jump cut, pushes into emphasis, wide section openers', at: Date.now() });
          emit({ t: 'op', id, phase: 'end', ok: true, ms: 0, result: `${r.snaps} snap punches · ${r.pushes} pushes · ${r.openers} openers${r.speaker_shots ? ` · ${r.speaker_shots} speaker shots` : ''}${r.screen_punches ? ` · ${r.screen_punches} screen punches` : ''}${r.jl ? ` · ${r.jl} J/L-cuts` : ''} · max static ${r.metrics?.max_static_s ?? '?'} s` });
        }
        writeFileSync(savedEdl, JSON.stringify(edl, null, 2));
        const result = await compose({
          edl,
          ffmpeg,
          ffprobe,
          output: args.path,
          dir: join(dir, 'compose'),
          signal,
          emit,
          fontsDir,
          assetRoot: dir,
          // the base composite is kept so a caption-only edit re-renders just the text pass
          cacheDir: join(dir, 'compose-cache'),
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ...meta, ...result, path: args.path }),
            },
          ],
        };
      }
      if (name === 'contact_sheet') {
        const indices = [
          ...new Set(
            (args.times ?? []).map((t) =>
              Math.min(
                frameCount(edl) - 1,
                Math.max(0, Math.round(t * rate(edl.canvas.fps))),
              ),
            ),
          ),
        ];
        if (!indices.length)
          throw new Error('Contact sheet needs sample times');
        const selection = indices.map((n) => `eq(n,${n})`).join('+'),
          cols = args.cols ?? 4,
          tile = args.tile_px ?? 320;
        const result = await runTool(
          ffmpeg,
          [
            '-nostdin',
            '-v',
            'error',
            '-y',
            '-i',
            out,
            '-vf',
            `select='${selection}',scale=${tile}:-2,tile=${cols}x${Math.ceil(indices.length / cols)}`,
            '-frames:v',
            '1',
            args.path,
          ],
          undefined,
          signal,
        );
        if (result.code)
          throw new Error(result.err || 'Contact sheet extraction failed');
      } else {
        if (args.hide?.length)
          edl.overlays = edl.overlays.filter((o) => !args.hide.includes(o.id));
        if (args.max_inline_px) {
          const ratio = Math.min(
            1,
            args.max_inline_px / Math.max(edl.canvas.w, edl.canvas.h),
          );
          edl.canvas.w = Math.max(
            2,
            Math.round((edl.canvas.w * ratio) / 2) * 2,
          );
          edl.canvas.h = Math.max(
            2,
            Math.round((edl.canvas.h * ratio) / 2) * 2,
          );
        }
        await compose({
          edl,
          ffmpeg,
          ffprobe,
          output: args.path,
          dir: join(dir, 'compose-preview'),
          frame: Math.round((args.time ?? 0) * rate(edl.canvas.fps)),
          signal,
          emit: () => {},
          fontsDir,
          assetRoot: dir,
        });
      }
      return {
        content: [
          { type: 'text', text: JSON.stringify({ ...meta, path: args.path }) },
          ...(args.inline === 'always'
            ? [
                {
                  type: 'image',
                  mimeType: /\.png$/i.test(args.path)
                    ? 'image/png'
                    : 'image/jpeg',
                  data: readFileSync(args.path).toString('base64'),
                },
              ]
            : []),
        ],
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      return {
        isError: true,
        content: [{ type: 'text', text: error.message }],
      };
    }
  };
  return api;
}
