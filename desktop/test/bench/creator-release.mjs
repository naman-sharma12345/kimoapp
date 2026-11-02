// Hosted-only release qualification. Real prepared media; no AI/SAM requests.
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  copyFile,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { toolPaths } from './run.mjs';
import { probe } from '../../engine.mjs';
import { run } from '../../audio/process.mjs';
import { hashFile, ROOT, readJson, writeJson } from './io.mjs';
import { runCreatorSmoke } from '../../creator-smoke.mjs';
import { frameSourceMetrics, sampledColour } from './analyze.mjs';
import { creatorScore, inspectDelivery, analyzeMedia } from './metrics.mjs';
import { captionStyle, blockBox, outputWords } from '../../captions.mjs';
import { criticalGates } from '../../quality-gates.mjs';
import { rate, duration } from '../../edl.mjs';
import { reviewMedia, writeReview } from './report.mjs';
import {
  colorFilters,
  finishSettings,
  finishFilters,
} from '../../color/filters.mjs';
import { cameraRectsForClip } from '../../compose.mjs';
import { framePlan } from '../../edl.mjs';
import { writeLut } from '../../color/lut.mjs';
if (process.env.CI !== 'true')
  throw new Error(
    'Run release qualification on hosted CI, not the foreground PC',
  );
const tools = toolPaths(),
  cmd = process.argv[2],
  root = resolve(process.env.BENCH_OUTPUT ?? 'release-evidence'),
  id = process.env.BENCH_CASE ?? 'TH-2',
  template = process.env.BENCH_TEMPLATE ?? 'youtube-talking',
  directory = join(root, `${id}-${template}`),
  inputRoot = resolve(process.env.BENCH_INPUT ?? '.'),
  ledger = await readFile(join(ROOT, 'cache/spend.json'));
await mkdir(directory, { recursive: true });
const staticCamera = process.env.BENCH_SHORT === '1';
const configPath = join(directory, 'config.json');
if (cmd === 'prepare') {
  const inputs = [],
    proof = [];
  const names =
    id === 'SAM-PERSON'
      ? ['sam-person.mp4']
      : (await readdir(inputRoot))
          .filter((n) => /^\d+\.mp4$/i.test(n))
          .sort((a, b) => parseInt(a) - parseInt(b));
  const frozen =
    id === 'SAM-PERSON'
      ? null
      : (
          await readJson(join(ROOT, 'clips/raw-v2/prepared-manifest.json'))
        ).cases.find((c) => c.id === id);
  for (const [i, name] of names.entries()) {
    const source =
        id === 'SAM-PERSON'
          ? resolve('desktop/test/sam-person.mp4')
          : join(inputRoot, name),
      hash = await hashFile(source);
    if (frozen && hash !== frozen.segments[i]?.sha256)
      throw new Error(`Prepared source hash mismatch: ${id}/${name}`);
    let path = source,
      words = join(inputRoot, `${i + 1}-words.json`);
    if (staticCamera && id !== 'SAM-PERSON') {
      path = join(directory, `${i + 1}-short.mp4`);
      const info = await probe(tools.ffprobe, source);
      await run(tools.ffmpeg, [
        '-i',
        source,
        '-t',
        '8',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '16',
        '-r',
        info.rate ?? String(info.fps),
        '-fps_mode',
        'cfr',
        '-c:a',
        'aac',
        '-b:a',
        '384k',
        path,
      ]);
      const transcript = (await readJson(words))
        .filter((w) => w.start < 8)
        .map((w) => ({ ...w, end: Math.min(8, w.end) }));
      words = join(directory, `${i + 1}-short-words.json`);
      await writeJson(words, transcript);
    }
    inputs.push({ path, ...(existsSync(words) ? { words } : {}) });
    proof.push({
      source_sha256: hash,
      render_source_sha256: await hashFile(path),
      changes:
        path === source
          ? 'none'
          : 'first 8 seconds, CFR H264/AAC fixture excerpt',
    });
  }
  const performance = process.env.BENCH_PERFORMANCE === '1';
  const config = {
    directory,
    inputs,
    template,
    staticCamera,
    coldTranscript: performance || id === 'SAM-PERSON',
    ...(performance ? { canvas: { width: 1080, height: 1920 } } : {}),
  };
  await writeJson(configPath, config);
  await writeJson(join(directory, 'sources.json'), { id, proof });
  if (id === 'SAM-PERSON')
    await writeFile(
      join(directory, 'CREDITS.txt'),
      'Repository sam-person.mp4 regression fixture. No new source acquisition.\n',
    );
  else
    await copyFile(
      join(inputRoot, 'CREDITS.txt'),
      join(directory, 'CREDITS.txt'),
    );
  console.log(configPath);
} else if (cmd === 'run') {
  await runCreatorSmoke(await readJson(configPath), {
    ...tools,
    emit: (e) => {
      if (e.t === 'op' && e.phase === 'end')
        console.log(e.title ?? e.tool ?? 'stage', e.ms ?? '');
    },
    env: tools.env,
  });
} else if (cmd === 'measure') {
  const edl = await readJson(join(directory, 'edit.edl.json')),
    light = await readJson(join(directory, 'metrics.json')),
    speech =
      typeof light.speech === 'boolean'
        ? light.speech
        : outputWords(edl, edl.camera_plan).length > 0 ||
          edl.audio.some(
            (track) => track.role === 'VOICE' && track.clips.length,
          ),
    output = join(directory, 'final.mp4'),
    events = [],
    referenceLuts = [];
  for (const t of edl.video)
    for (const c of t.clips) {
      const s = edl.sources.find((s) => s.id === c.src),
        keys = c.camera ?? [{ t: 0, x: 0.5, y: 0.5, zoom: 1 }];
      const props = {
        scale: {
          base: keys[0].zoom,
          keys: keys.map((k) => ({ t: k.t, v: k.zoom })),
        },
        x: { base: keys[0].x - 0.5 },
        y: { base: keys[0].y - 0.5 },
        opacity: { base: 1 },
      };
      const grade = edl.color_report?.clips?.find(
        (entry) => entry.clip === c.id,
      );
      let reference = {};
      if (grade?.lut) {
        const override = edl.color_finish?.clip_overrides?.[c.id];
        const rebuilt = await writeLut(
          join(directory, 'cache', 'color', 'luts'),
          {
            correction: grade.correction,
            look: override?.look ?? edl.color_report.look,
            strength: override?.strength ?? edl.color_report.strength,
            primaries: (c.grade?.effects ?? []).filter(
              (effect) => effect.kind === 'primaries',
            ),
          },
        );
        if (rebuilt.key !== grade.lut)
          throw Error('Saved source-reference LUT does not reproduce');
        const lut = rebuilt.path;
        referenceLuts.push({
          clip: c.id,
          lut: grade.lut,
          sha256: await hashFile(lut),
        });
        reference = {
          reference_color_filter: colorFilters(
            { ...s, pixel_format: s.native?.pix_fmt },
            { lut },
          ),
          reference_finish_filter: finishFilters(
            finishSettings(
              s,
              edl.canvas,
              cameraRectsForClip(
                c,
                s,
                edl.canvas,
                framePlan(c, s, edl.canvas.fps),
              ),
              edl.color_finish,
            ),
          ).join(','),
        };
      }
      events.push({
        ...reference,
        id: c.id,
        kind: 'cut',
        start: c.at,
        end: c.at + (c.out - c.in) / (c.speed ?? 1),
        path: s.path,
        sourceFps: rate(s.fps),
        sourceWidth: s.w,
        sourceHeight: s.h,
        in_point: c.in,
        speed: c.speed ?? 1,
        raw: {
          start: c.at,
          props,
          motion_path: c.follow || c.drift || undefined,
        },
      });
    }
  for (const o of edl.overlays) {
    let box = null;
    if (o.kind === 'caption_word_group') {
      const b = blockBox(
        captionStyle(o.props.style),
        { ...o.props, place: o.props.place },
        edl.canvas,
        o.props.place.cy,
        o.props.place.cx,
      );
      box = {
        x: (b.x0 - 0.15 * b.w) / edl.canvas.w,
        y: (b.y0 - 0.15 * b.h) / edl.canvas.h,
        w: (b.w * 1.3) / edl.canvas.w,
        h: (b.h * 1.3) / edl.canvas.h,
      };
    } else if (o.props.box) {
      const b = o.props.box;
      box = {
        x: b.x / edl.canvas.w,
        y: b.y / edl.canvas.h,
        w: b.w / edl.canvas.w,
        h: b.h / edl.canvas.h,
      };
    }
    events.push({
      id: o.id,
      kind: o.kind === 'caption_word_group' ? 'caption' : 'graphic',
      start: o.at,
      end: o.at + o.dur,
      text: o.props.text ?? o.props.title,
      box,
    });
  }
  const full = await analyzeMedia(tools.ffmpeg, tools.ffprobe, output),
    frame = await frameSourceMetrics(
      tools.ffmpeg,
      output,
      events,
      full.info.fps,
      full.info.video.width,
      full.info.video.height,
      full.info.duration,
      tools.ffprobe,
    ),
    colour = await sampledColour(tools.ffmpeg, output, duration(edl), events),
    delivery = await inspectDelivery(
      tools.ffmpeg,
      tools.ffprobe,
      output,
      full.info.fps,
    ),
    values = {
      ...(light.metrics ?? light.values),
      duration_s: full.info.duration,
      ...frame,
      clip_delta_e: colour.clip_delta_e,
      clipped_pct: colour.clipped_pct,
      lufs: full.lufs,
      true_peak: full.true_peak,
      lra: full.lra,
      ...delivery,
    },
    score = creatorScore(values, await readJson(join(ROOT, 'score.json')), {
      speech,
      music: !!edl.sound?.music_id,
    }),
    gates = criticalGates(values, {
      speech,
      captions: speech && edl.creator_plan.captions.enabled,
      audio: true,
    }),
    report = {
      version: 6,
      edlFile: 'edit.edl.json',
      speech,
      values,
      creator: score,
      gates,
      performance: light.performance,
      replay: light.replay,
      events,
      evidence: {
        reference_luts: referenceLuts,
        scope:
          'Modern EDL caption/cut statistics plus source matching, source-residual registration against the hash-attested saved grade, sampled colour and final-audio measurement. Frame/rate expectations and registration remain independent of the compositor frame oracle.',
        limits:
          'Animated/non-centre source mappings or ambiguous natural footage remain unverified; no zero is substituted. CI short fixtures explicitly hold a centred wide camera to isolate frame selection; separate barcode/camera unit tests cover moving cameras. Saved deterministic plan replay is not provider adherence.',
      },
    };
  await writeJson(join(directory, 'metrics.json'), report);
  await reviewMedia({
    ffmpeg: tools.ffmpeg,
    output,
    directory,
    duration: duration(edl),
  });
  await writeReview(directory, {
    title: `${id} · ${template} · ${staticCamera ? 'CI fixed-camera fixture' : 'full golden replay'}`,
    metrics: report,
    ops: [],
  });
  const row = {
    clip: id,
    template,
    score: score.score,
    metrics: values,
    gates,
    performance: light.performance,
    output_sha256: await hashFile(output),
  };
  await writeJson(join(directory, 'summary.json'), row);
  const baseline = await readJson(join(ROOT, 'release-baseline.json')),
    prior = baseline.rows.find((r) => r.clip === id && r.template === template);
  if (
    process.env.BENCH_ANALYZE_RUN &&
    prior &&
    prior.output_sha256 !== row.output_sha256
  )
    throw new Error(
      'Remeasurement output does not match the committed rendered baseline bytes',
    );
  if (staticCamera) {
    if (
      !gates.passed ||
      score.score < 75 ||
      !delivery.cfr_ok ||
      !delivery.closed_gop
    )
      throw new Error(
        `CI critical gate/score failed: ${score.score}; ${JSON.stringify(gates)}`,
      );
  } else if (process.env.BENCH_BASELINE_MODE !== '1') {
    if (!prior) throw new Error('Missing measured template baseline');
    if (score.score < prior.score - 3)
      throw new Error(
        `Creator Score regressed >3 points: ${prior.score} → ${score.score}`,
      );
  }
  if (
    process.env.BENCH_PERFORMANCE === '1' &&
    !light.performance.checks.every((c) => c.ok)
  )
    throw new Error(
      'Four-core performance budget exceeded; retain measured timings',
    );
  console.log(
    JSON.stringify({
      clip: id,
      template,
      score: score.score,
      critical: gates.passed,
      unverified: gates.unverified,
    }),
  );
} else throw new Error('Use prepare, run or measure');
if (!ledger.equals(await readFile(join(ROOT, 'cache/spend.json'))))
  throw new Error('Historical spending ledger changed');
