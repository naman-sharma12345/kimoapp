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
    handles: new Set(['export', 'render_frame', 'contact_sheet', 'lint_edit']),
  };
  api.snapshot = async () => {
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
