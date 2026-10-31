// Explainer self-test for the Windows Electron smoke: the active graphics
// backend (offscreen Chromium in the app, else the built-in canvas) renders a
// representative set of explainer families at a mid-beat frame, one frame is
// rendered twice (identical bytes), an item shows on its entry frame (not
// before), the synthesised sound kit renders with FFmpeg, and a beat
// round-trips publicEdl → edit_explain. No network, no AI, no assets fetched.
import { mkdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { graphicJob, themeFor, frameBuffer, backendName } from '../graphics/renderer.mjs';
import { panelRect } from './panel.mjs';
import { firstVisibleFrame } from './timing.mjs';
import { sfxFile } from './sfx.mjs';
import { publicEdl, applyEdits } from '../edl.mjs';

const md5 = (b) => createHash('md5').update(b).digest('hex');
const lit = (b) => {
  let n = 0;
  for (let i = 3; i < b.length; i += 4) if (b[i]) n++;
  return n;
};

/** One sample per checked family: [element, props, frame time (s)]. */
export function selfTestSamples(canvas) {
  const vertical = canvas.h > canvas.w;
  const mode = vertical ? 'top' : 'side';
  const face = { x0: canvas.w * 0.4, x1: canvas.w * 0.6, y0: canvas.h * 0.28, y1: canvas.h * 0.5 };
  const P = panelRect(canvas, mode, { face });
  const O = panelRect(canvas, 'overlay', { face });
  const F = panelRect(canvas, 'full');
  return [
    ['ex_list', { mode, panel: P, title: '3 reasons', items: [{ text: 'No users', t: 0.2 }, { text: 'Too slow', t: 0.6 }, { text: 'No money', t: 1.0 }] }, 1.3],
    ['ex_stat', { mode: 'overlay', panel: O, value: 40, unit: '%', label: 'of startups fail', items: [{ t: 0.4 }] }, 1.4],
    ['ex_chart', { mode: 'full', panel: F, title: 'Views', chart: 'bar', items: [{ label: 'Before', value: 10, t: 0.2 }, { label: 'After', value: 100, t: 0.6 }] }, 1.6],
    ['ex_flow', { mode, panel: P, items: [{ text: 'Record', t: 0.2 }, { text: 'Edit', t: 0.6 }, { text: 'Post', t: 1.0 }] }, 1.5],
    ['ex_timeline', { mode, panel: P, items: [{ when: '2019', text: 'first video', t: 0.2 }, { when: '2024', text: 'quit job', t: 0.7 }] }, 1.4],
    ['ex_definition', { mode, panel: P, term: 'Compounding', pos: 'noun', definition: 'growth on growth', items: [{ t: 0.3 }] }, 1.4],
    ['ex_question', { mode, panel: P, question: 'But why?' }, 1.0],
    ['ex_name_card', { name: 'Naman Sharma', descriptor: 'founder' }, 1.2],
  ];
}

export async function explainSelfTest({ ffmpeg = 'ffmpeg', dir, canvas = { w: 540, h: 960 } }) {
  mkdirSync(dir, { recursive: true });
  const theme = themeFor('kimo');
  const out = { backend: backendName(), families: {}, ok: false };
  let be = 'auto';
  try {
    if (out.backend !== 'soft') {
      try {
        await frameBuffer(graphicJob({ kind: 'ex_question', props: { question: 'probe' }, canvas, fps: 30, dur: 1, theme }), 10);
      } catch (error) {
        out.hostError = String(error.message ?? error).slice(0, 300);
        out.backend = `soft (${out.backend} failed)`;
        be = 'soft';
      }
    }
    for (const [kind, props, at] of selfTestSamples(canvas)) {
      const job = graphicJob({ kind, props, canvas, fps: 30, dur: 3, theme });
      if (!job) {
        out.families[kind] = 'refused';
        continue;
      }
      const n = lit(await frameBuffer(job, Math.round(at * 30), be));
      out.families[kind] = n > 0 ? `ok ${job.box.w}x${job.box.h}` : 'empty';
    }
    // determinism and entry-frame sync on the list
    const [, listProps] = selfTestSamples(canvas)[0];
    const job = graphicJob({ kind: 'ex_list', props: listProps, canvas, fps: 30, dur: 3, theme });
    const a = await frameBuffer(job, 37, be);
    const b = await frameBuffer(job, 37, be);
    out.deterministic = md5(a) === md5(b);
    // the third item (after the panel has settled): nothing changes on the frame before it, pixels change on its entry frame
    const entry = firstVisibleFrame(listProps.items[2].t, 30);
    const [prev, before, on] = [await frameBuffer(job, entry - 2, be), await frameBuffer(job, entry - 1, be), await frameBuffer(job, entry, be)];
    out.sync = { entry, still_before: md5(prev) === md5(before), drawn_on_entry: md5(on) !== md5(before) };
    out.sync.ok = out.sync.still_before && out.sync.drawn_on_entry;
    // the synthesised sound kit (own CC0 sounds, made with FFmpeg on this PC)
    out.sfx = {};
    for (const name of ['tick', 'whoosh', 'ding']) {
      try {
        const f = sfxFile(name, { ffmpeg, dir });
        out.sfx[name] = f && existsSync(f) && statSync(f).size > 200 ? 'ok' : 'missing';
      } catch (error) {
        out.sfx[name] = `error: ${String(error.message ?? error).slice(0, 120)}`;
      }
    }
    // a beat survives the IPC copy and an inline edit
    const edl = {
      edl_version: 1,
      canvas: { ...canvas, fps: 30 },
      sources: [],
      video: [],
      audio: [],
      overlays: [{ id: 'ex1', kind: 'graphic', at: 1, dur: 3, track: 'graphics', props: { element: 'ex_list', theme: 'kimo', ...listProps, explain: { beat: 'b1', kind: 'list' } } }],
      master: { lufs: -14, true_peak: -1 },
    };
    const pub = publicEdl(edl).overlays[0].props;
    const edited = applyEdits(edl, [{ tool: 'edit_explain', args: { clip_id: 'ex1', title: 'Two reasons', kind: 'flow' } }]).overlays[0].props;
    out.edl = { kept: Boolean(pub.explain && pub.items?.length === 3 && pub.title), edited: edited.title === 'Two reasons' && edited.element === 'ex_flow' };
    out.ok =
      Object.values(out.families).every((v) => v.startsWith('ok')) &&
      out.deterministic &&
      out.sync.ok &&
      Object.values(out.sfx).every((v) => v === 'ok') &&
      out.edl.kept &&
      out.edl.edited;
  } catch (error) {
    out.error = String(error.stack ?? error.message).slice(0, 800);
  }
  return out;
}
