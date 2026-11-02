import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PlanCalls, EditBudget, planEdit, followupPlan } from './planner.mjs';
import { selectTemplate, getTemplate } from './planner/templates.mjs';
import { plannerContext, compilePlan } from './planner/compile.mjs';
import { atomicJson, renderPlan, digest } from './planner/render.mjs';
import {
  critique,
  lightweightMetrics,
  refreshMeasurements,
} from './critic.mjs';
import { planCut, storablePlan } from './cutstage.mjs';
import { headTrack, screenRegions } from './camera-probe.mjs';
import { cachedPersonTracks } from './sam.mjs';
import { publicEdl, toTimeline, toKimoProject, rate } from './edl.mjs';
import { run, measureLoudness } from './audio/process.mjs';
import { applyStoredStudio, cleanCreatorOptions } from './studio.mjs';
import { applyStudioPatch } from './studio.mjs';
import {
  enforceGates,
  performanceReport,
  criticalGates,
} from './quality-gates.mjs';
import {
  saveCheckpoint,
  readCheckpoint,
  inputFingerprint,
  cleanPartials,
} from './project-state.mjs';

export function readPlanHistory(dir) {
  const p = join(dir, 'plan-history.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : [];
}
export function undoPlanState(dir) {
  const history = readPlanHistory(dir);
  if (history.length < 2) throw new Error('No previous creator plan');
  return { history: history.slice(0, -1), edl: history.at(-2).edl };
}
async function sampleInput(ffmpeg, files, dir, signal) {
  const images = [],
    videos = files.filter((f) => f.kind === 'video');
  for (let i = 0; i < 6 && videos.length; i++) {
    const f = videos[i % videos.length],
      time = Math.min(
        Math.max(0, f.duration - 0.05),
        ((Math.floor(i / videos.length) + 0.5) * f.duration) /
          Math.ceil(6 / videos.length),
      );
    const path = join(dir, `planner-key-${i}.jpg`);
    await run(
      ffmpeg,
      [
        '-ss',
        String(time),
        '-i',
        f.path,
        '-frames:v',
        '1',
        '-vf',
        'scale=360:360:force_original_aspect_ratio=decrease',
        '-q:v',
        '7',
        path,
      ],
      { signal, title: 'creator: sampling input keyframes' },
    );
    images.push({
      label: `s${videos.indexOf(f) + 1} at ${time.toFixed(2)}s`,
      url: `data:image/jpeg;base64,${(await readFile(path)).toString('base64')}`,
    });
  }
  return images;
}
export async function runCreatorEdit(
  options,
  { ask, P, probe, youtubeMaster, canvasFps },
) {
  const {
    files,
    dir,
    note = '',
    mode,
    env = {},
    ffmpeg,
    ffprobe,
    signal,
    emit: upstream = () => {},
    transcribe,
    captionStyle,
    explain,
  } = options;
  const started = Date.now(),
    operations = [],
    emit = (event) => {
      if (event.t === 'op') operations.push(event);
      upstream(event);
    };
  await mkdir(dir, { recursive: true });
  const fingerprint = inputFingerprint(
      files,
      note,
      options.style,
      options.preset,
    ),
    checkpoint = await readCheckpoint(dir);
  const resuming =
    mode === 'ai' &&
    checkpoint?.stage !== 'done' &&
    checkpoint?.fingerprint === fingerprint &&
    (checkpoint.edl?.creator_plan || checkpoint.stage_data);
  const savedPath = join(dir, 'edit.edl.json');
  const previous =
    (resuming ? checkpoint.edl : options.edl) ??
    (existsSync(options.edlFile ?? savedPath)
      ? JSON.parse(await readFile(options.edlFile ?? savedPath, 'utf8'))
      : null);
  const id = resuming && checkpoint.edit ? checkpoint.edit : randomUUID(),
    budgetPath = join(dir, `creator-budget-${id}.json`),
    budget = new EditBudget(
      resuming && existsSync(budgetPath)
        ? JSON.parse(await readFile(budgetPath, 'utf8'))
        : {},
    );
  const calls = new PlanCalls({
    ask,
    cacheDir: join(
      env.KIMO_CACHE_DIR ?? join(dir, 'cache'),
      'creator-responses',
    ),
    budget,
    signal,
    emit,
    replay: env.KIMO_CREATOR_REPLAY === '1',
    onBudget: (b) => atomicJson(budgetPath, { edit: id, ...b }),
  });
  const operation = async (tool, title, fn) => {
    const opId = randomUUID().slice(0, 8),
      start = Date.now();
    emit({ t: 'op', id: opId, tool, phase: 'start', title, at: start });
    try {
      const r = await fn();
      emit({
        t: 'op',
        id: opId,
        tool,
        phase: 'end',
        ok: true,
        ms: Date.now() - start,
        result: typeof r === 'string' ? r : 'done',
      });
      return r;
    } catch (error) {
      emit({
        t: 'op',
        id: opId,
        tool,
        phase: 'end',
        ok: false,
        ms: Date.now() - start,
        error: error.message,
      });
      throw error;
    }
  };
  let context,
    plan,
    clips,
    heads = {},
    screens = {},
    source = 'saved',
    pass = 'full',
    compiled,
    edl,
    chapters = [];
  if (!resuming)
    await saveCheckpoint(dir, 'started', {
      fingerprint,
      edit: id,
      stage_data: {},
    });
  if (
    previous?.creator_plan &&
    (mode !== 'ai' || (resuming && checkpoint.edl?.creator_plan))
  ) {
    context = previous.creator_context;
    plan = previous.creator_plan;
    clips = previous.creator_clips ?? [];
    heads = previous.camera_plan?.heads ?? {};
    screens = previous.camera_plan?.screenRegions ?? {};
    if (resuming) {
      edl = structuredClone(previous);
      source = 'resumed';
      emit({
        t: 'say',
        kind: 'creator',
        text: `resuming after ${checkpoint.stage}`,
      });
    }
    if (mode === 'followup') {
      try {
        const result = await followupPlan(note, plan, context, calls);
        plan = result.plan;
        pass = result.pass;
        source = result.patches.length ? 'followup' : 'unchanged';
      } catch (error) {
        if (signal?.aborted || calls.replay) throw error;
        emit({
          t: 'say',
          kind: 'creator',
          text: `follow-up unavailable: ${error.message}; kept the saved plan`,
        });
        pass = 'metadata';
        source = 'unchanged';
      }
    }
    if (mode === 'manual') {
      edl = structuredClone(previous);
      pass = 'manual';
      const pack = join(dir, 'youtube.json');
      if (existsSync(pack))
        chapters = JSON.parse(await readFile(pack, 'utf8')).chapters ?? [];
    }
  } else {
    const staged = resuming ? (checkpoint.stage_data ?? {}) : {},
      template = selectTemplate(options.style, P, note),
      overrides = cleanCreatorOptions(options.creatorOptions);
    if (overrides.length === 'full') template.duration.max_s = null;
    else if (typeof overrides.length === 'number')
      template.duration.max_s = overrides.length;
    if (overrides.look && overrides.look !== 'auto')
      template.color.look = overrides.look;
    const cut =
      template.audio.voice && !staged.clips
        ? await planCut({
            files,
            P,
            style: template.legacy_style,
            styleInfo: { punch: template.camera.punch },
            note,
            mode,
            env,
            dir,
            ffmpeg,
            signal,
            emit,
            transcribe,
          })
        : null;
    clips = staged.clips ?? cut?.clips ?? [];
    context =
      staged.context ??
      plannerContext({
        template,
        note: note + (overrides.music === 'off' ? ' no music' : ''),
        files,
        clips,
        P,
      });
    if (staged.plan) {
      plan = staged.plan;
      source = 'resumed';
      heads = staged.heads ?? {};
      screens = staged.screens ?? {};
      emit({
        t: 'say',
        kind: 'creator',
        text: `resuming after ${checkpoint.stage}`,
      });
    } else {
      await saveCheckpoint(dir, 'transcript', {
        fingerprint,
        edit: id,
        stage_data: { clips, context },
      });
      context.images = await operation(
        'planner_frames',
        'planner · six low-resolution source keyframes',
        () => sampleInput(ffmpeg, files, dir, signal),
      );
      const result = await planEdit(context, calls);
      plan = result.plan;
      source = result.source;
      delete context.images;
      if (result.errors.length)
        emit({
          t: 'say',
          kind: 'creator',
          text: `deterministic plan: ${result.errors.slice(0, 2).join('; ')}`,
        });
      if (captionStyle && captionStyle !== 'auto')
        plan.captions.style = captionStyle;
      await saveCheckpoint(dir, 'plan', {
        fingerprint,
        edit: id,
        stage_data: { clips, context, plan },
      });
    }
  }
  const template = getTemplate(plan.template),
    fps = canvasFps(files);
  if (!edl) {
    await operation(
      'camera_probe',
      'camera · cached/local subject measurements',
      async () => {
        for (const f of files.filter((f) => f.kind === 'video')) {
          const path = f.path.replaceAll('\\', '/');
          if (heads[path] !== undefined) continue;
          heads[path] = await headTrack({
            ffmpeg,
            file: f,
            samTracks: cachedPersonTracks(join(dir, 'sam'), f.path, f.duration),
            cacheDir: env.KIMO_CACHE_DIR ?? join(dir, 'cache'),
            signal,
          }).catch((error) => {
            signal?.throwIfAborted();
            return null;
          });
        }
      },
    );
    await saveCheckpoint(dir, 'camera', {
      fingerprint,
      edit: id,
      stage_data: { clips, context, plan, heads, screens },
    });
    compiled = await operation(
      'apply_cut',
      'creator · compile validated plan into edit decisions',
      async () =>
        compilePlan({
          plan,
          context,
          files,
          clips,
          P,
          fps,
          heads,
          screenRegions: screens,
          previous,
        }),
    );
    edl = applyStoredStudio(compiled.edl, previous);
    chapters = compiled.chapters;
    if (template.camera.screen_zooms) {
      const ranges = (edl.video[0]?.clips ?? [])
        .filter((c) =>
          edl.cut_plan?.screen_punch?.some((p) => p.clip_id === c.id),
        )
        .map((c) => {
          const s = edl.sources.find((s) => s.id === c.src);
          return {
            clip_id: c.id,
            path: s.path,
            in: c.in,
            out: c.out,
            width: s.w,
            height: s.h,
          };
        });
      if (ranges.length) {
        screens = await screenRegions({
          ffmpeg,
          clips: ranges,
          cacheDir: env.KIMO_CACHE_DIR ?? join(dir, 'cache'),
          signal,
        });
        compiled = compilePlan({
          plan,
          context,
          files,
          clips,
          P,
          fps,
          heads,
          screenRegions: screens,
          previous,
        });
        edl = applyStoredStudio(compiled.edl, previous);
      }
    }
    if (explain?.enabled === false) {
      edl.overlays = edl.overlays.filter((o) => !o.props?.explain_plan);
      delete edl.explain;
    }
    for (const tool of ['camera_director', 'explain', 'captions'])
      await operation(
        tool,
        `${tool} · deterministic template settings`,
        async () =>
          edl[tool === 'camera_director' ? 'camera_report' : tool] ??
          'not applicable',
      );
  }
  emit({
    t: 'timeline',
    timeline: { ...toTimeline(edl), edl: publicEdl(edl) },
  });
  await saveCheckpoint(dir, 'compiled', { fingerprint, edl, edit: id });
  const isPreview = options.preview === true,
    factor = isPreview ? Math.min(1, 540 / Math.min(P.width, P.height)) : 1,
    renderCanvas = {
      ...P,
      width: Math.round((P.width * factor) / 2) * 2,
      height: Math.round((P.height * factor) / 2) * 2,
    },
    renderDir = isPreview ? join(dir, 'preview') : dir;
  let viewedEdl = edl;
  const renderCurrent = async () => {
    viewedEdl = isPreview
      ? applyStoredStudio(
          compilePlan({
            plan: edl.creator_plan,
            context: edl.creator_context,
            files: edl.sources
              .filter(
                (s) => s.kind === 'video' || s.id === 'creator-user-music',
              )
              .map((s) => ({
                path: s.path,
                kind: s.kind,
                width: s.w,
                height: s.h,
                duration: s.duration,
                fps: s.fps,
                audio: s.audio,
              })),
            clips: edl.creator_clips,
            P: renderCanvas,
            fps: rate(edl.canvas.fps),
            heads: edl.camera_plan?.heads ?? {},
            screenRegions: edl.camera_plan?.screenRegions ?? {},
            previous: edl,
          }).edl,
          edl,
        )
      : edl;
    const result = await renderPlan({
      edl: viewedEdl,
      ffmpeg,
      ffprobe,
      dir: renderDir,
      signal,
      emit,
      fontsDir: env.KIMO_FONTS,
      cacheDir: env.KIMO_CACHE_DIR ?? join(dir, 'cache'),
    });
    edl.sound = viewedEdl.sound;
    return result;
  };
  const finalOut = join(dir, isPreview ? 'preview.mp4' : 'final.mp4'),
    before = join(dir, 'before.mp4');
  if (existsSync(finalOut)) await copyFile(finalOut, before);
  let rendered = await renderCurrent();
  const transitions = [];
  let review = null,
    stop = 'manual edit';
  if (mode === 'ai' && source !== 'fallback') {
    for (
      let iteration = 0;
      iteration < template.acceptance.max_critic_iterations;
      iteration++
    ) {
      try {
        review = await operation(
          'creator_critic',
          `critic · review ${iteration + 1} of at most 2`,
          () =>
            critique({
              plan,
              context,
              edl: viewedEdl,
              path: rendered.master,
              ffmpeg,
              dir,
              calls,
              signal,
            }),
        );
        const score = review.measurements.score;
        transitions.push({
          iteration: iteration + 1,
          score,
          high: review.problems.filter((p) => p.severity === 'high').length,
          problems: review.problems,
          sheet: review.sheet,
        });
        emit({
          t: 'say',
          kind: 'creator',
          text: `creator score ${score}/100 · ${review.problems.length} review issues · estimated AI reservation $${budget.reserved_usd.toFixed(2)}`,
        });
        if (
          score >= template.acceptance.creator_score &&
          !review.problems.some((p) => p.severity === 'high')
        ) {
          stop = 'score target reached with no high issue';
          break;
        }
        if (!review.patches.length || digest(review.plan) === digest(plan)) {
          stop = 'critic proposed no valid improvement';
          break;
        }
        plan = review.plan;
        compiled = compilePlan({
          plan,
          context,
          files,
          clips,
          P,
          fps,
          heads,
          screenRegions: screens,
          previous: edl,
        });
        edl = applyStoredStudio(compiled.edl, previous);
        chapters = compiled.chapters;
        rendered = await renderCurrent();
        stop = 'iteration cap';
      } catch (error) {
        if (signal?.aborted || calls.replay) throw error;
        stop = error.message;
        emit({ t: 'say', kind: 'creator', text: `critic stopped: ${stop}` });
        break;
      }
    }
  } else
    stop =
      source === 'fallback'
        ? 'deterministic fallback; AI review unavailable'
        : mode === 'followup'
          ? 'user patch applied; no extra critic calls'
          : 'manual edit';
  const checked = await enforceGates({
    measure: () =>
      lightweightMetrics(viewedEdl, { ffmpeg, dir: renderDir, signal }),
    context: {
      speech: template.audio.voice,
      captions: plan.captions.enabled,
      audio: true,
    },
    emit,
    signal,
    repair: async (stage) => {
      if (stage === 'cut')
        edl = applyStudioPatch(edl, {
          type: 'edit',
          pause: Math.min(0.12, edl.creator_context.template.cut.max_pause),
        });
      else if (stage === 'captions')
        edl = applyStudioPatch(edl, {
          type: 'captions',
          size: Math.max(0.55, plan.captions.font_scale * 0.9),
          position: 'bottom',
        });
      else if (stage === 'sound') {
        edl.sound.target_lufs = -14;
        edl.sound.quality_retry = 1;
        delete edl.sound.report;
      } else {
        edl.studio ??= {};
        edl.studio.safe_compose = true;
      }
      plan = edl.creator_plan;
      rendered = await renderCurrent();
      await saveCheckpoint(dir, `repaired-${stage}`, {
        fingerprint,
        edl,
        edit: id,
      });
    },
  });
  let { measurements, gates } = checked;
  if (transitions.length && transitions.at(-1).score !== measurements.score)
    transitions.push({
      iteration: 'after repair',
      score: measurements.score,
      target: template.acceptance.creator_score,
      high: null,
    });
  let accepted =
    stop === 'score target reached with no high issue' && gates.passed;
  if (gates.red) stop = 'critical quality check failed after one retry';
  else if (gates.unverified) stop += ' · critical pixel checks unverified';
  const history =
    mode === 'manual' && options.creatorUndo
      ? readPlanHistory(dir).slice(0, -1)
      : readPlanHistory(dir);
  if (!(mode === 'manual' && options.creatorUndo))
    history.push({
      id,
      at: Date.now(),
      source,
      request: note,
      plan: structuredClone(plan),
      edl: structuredClone(edl),
    });
  await operation(
    'creator_delivery',
    isPreview
      ? 'delivery · quick preview'
      : 'delivery · high-quality H.264 software master',
    async () => {
      if (rendered.passes.length || !existsSync(finalOut)) {
        const measured = await probe(ffprobe, rendered.master);
        const previousDelivery = existsSync(before)
          ? await probe(ffprobe, before)
          : null;
        if (
          rendered.passes.every((p) => p === 'audio' || p === 'remix') &&
          previousDelivery?.width === renderCanvas.width &&
          previousDelivery?.height === renderCanvas.height
        ) {
          await run(
            ffmpeg,
            [
              '-i',
              before,
              '-i',
              rendered.master,
              '-map',
              '0:v:0',
              '-map',
              '1:a:0',
              '-c:v',
              'copy',
              '-c:a',
              'aac',
              '-b:a',
              '384k',
              '-ar',
              '48000',
              '-ac',
              '2',
              '-t',
              String(rendered.seconds),
              '-movflags',
              '+faststart',
              finalOut + '.partial.mp4',
            ],
            { signal, title: 'delivery: picture copied; updating audio only' },
          );
        } else {
          await youtubeMaster({
            ffmpeg,
            input: rendered.master,
            output: finalOut + '.partial.mp4',
            P: renderCanvas,
            encoder: null,
            preview: isPreview,
            m: measured,
            signal,
            audioMastered: true,
            onProgress: (f, eta) =>
              emit({
                t: 'progress',
                phase: 'delivery',
                label: 'encoding delivery',
                f,
                eta,
              }),
          });
        }
        await (
          await import('node:fs/promises')
        ).rename(finalOut + '.partial.mp4', finalOut);
      }
    },
  );
  let encoded = await measureLoudness(ffmpeg, finalOut, {
    signal,
    emit,
    title: 'quality · measured final AAC loudness and peak',
  });
  if (
    Number(encoded.input_tp) > -1 &&
    !gates.retries.some((r) => r.stage === 'sound')
  ) {
    const retry = {
      stage: 'sound',
      attempt: 1,
      scope: 'final AAC peak',
      ok: false,
    };
    try {
      await operation(
        'quality_repair',
        'quality gate · retry sound once after AAC encoding',
        async () => {
          await run(
            ffmpeg,
            [
              '-i',
              finalOut,
              '-map',
              '0:v:0',
              '-map',
              '0:a:0',
              '-c:v',
              'copy',
              '-af',
              'aresample=192000,alimiter=limit=0.749894:level=false:latency=true,aresample=48000',
              '-c:a',
              'aac',
              '-b:a',
              '384k',
              '-ar',
              '48000',
              '-ac',
              '2',
              '-movflags',
              '+faststart',
              finalOut + '.partial.mp4',
            ],
            {
              signal,
              emit,
              title: 'quality · AAC-safe peak correction, picture copied',
            },
          );
          await (
            await import('node:fs/promises')
          ).rename(finalOut + '.partial.mp4', finalOut);
        },
      );
      retry.ok = true;
    } catch (error) {
      signal?.throwIfAborted();
      retry.error = error.message;
    }
    gates.retries.push(retry);
    encoded = await measureLoudness(ffmpeg, finalOut, {
      signal,
      emit,
      title: 'quality · recheck corrected final AAC',
    });
  }
  const numeric = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  measurements = refreshMeasurements(
    measurements,
    {
      lufs: numeric(encoded.input_i),
      true_peak: numeric(encoded.input_tp),
      lra: numeric(encoded.input_lra),
    },
    { music: !!edl.sound?.music_id },
  );
  gates = {
    ...gates,
    ...criticalGates(measurements.metrics, {
      speech: template.audio.voice,
      captions: plan.captions.enabled,
      audio: true,
    }),
  };
  accepted =
    accepted &&
    gates.passed &&
    measurements.score >= template.acceptance.creator_score;
  if (gates.red) {
    stop = 'critical quality check failed after one retry';
    emit({
      t: 'say',
      kind: 'creator',
      text: 'critical quality check failed after one retry. review the Quality tab before exporting.',
    });
  }
  const creator = {
    version: 1,
    template: plan.template,
    source,
    requestedPass: pass,
    passes: rendered.passes,
    score: measurements.score,
    target: template.acceptance.creator_score,
    accepted,
    stop,
    transitions,
    budget: budget.snapshot(),
    undoDepth: Math.max(0, history.length - 1),
    limitations: measurements.scope,
    gates,
  };
  edl.creator = creator;
  if (options.studioHistory) {
    if (options.studioAppend) {
      const h = options.studioHistory;
      h.entries = h.entries.slice(0, h.cursor + 1);
      h.entries.push(structuredClone(edl));
      if (h.entries.length > 20) h.entries.shift();
      h.cursor = h.entries.length - 1;
    }
    await atomicJson(join(dir, 'studio-history.json'), options.studioHistory);
  }
  await atomicJson(join(dir, 'plan.json'), plan);
  await atomicJson(join(dir, 'creator-review.json'), {
    ...creator,
    measurements,
  });
  await atomicJson(savedPath, edl);
  await atomicJson(join(dir, 'project.kimo.json'), toKimoProject(edl));
  await atomicJson(join(dir, 'plan-history.json'), history.slice(-20));
  if (compiled?.cut)
    await atomicJson(join(dir, 'cutplan.json'), storablePlan(compiled.cut));
  const timestamp = (t) =>
    `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const usableChapters =
    chapters.length >= 3 &&
    chapters.every((c, i) =>
      i === 0 ? c.time < 1 : c.time - chapters[i - 1].time >= 10,
    ) &&
    rendered.seconds - chapters.at(-1).time >= 10
      ? chapters
      : [];
  const thumbnail = join(dir, 'thumbnail.jpg');
  if (rendered.passes.length || !existsSync(thumbnail))
    await run(
      ffmpeg,
      [
        '-ss',
        String(Math.min(1, Math.max(0, rendered.seconds - 0.05))),
        '-i',
        finalOut,
        '-frames:v',
        '1',
        '-vf',
        'scale=1280:720:force_original_aspect_ratio=decrease',
        '-q:v',
        '3',
        thumbnail,
      ],
      { signal, title: 'creator: saving delivery thumbnail' },
    );
  const youtube = {
    title: plan.title_pack.titles[0],
    titles: plan.title_pack.titles,
    description:
      plan.title_pack.description +
      (usableChapters.length
        ? `\n\n${usableChapters.map((c) => `${timestamp(c.time)} ${c.title}`).join('\n')}`
        : ''),
    chapters: usableChapters,
    thumbnail_text: plan.title_pack.thumbnail_text,
    thumbnail,
  };
  await atomicJson(join(dir, 'youtube.json'), youtube);
  const delivered = await probe(ffprobe, finalOut);
  if (!delivered) throw new Error('Delivery could not be probed');
  const quality = {
    final: {
      ...delivered,
      lufs: measurements.metrics.lufs,
      truePeak: measurements.metrics.true_peak,
    },
    creator: measurements,
    accepted,
    checks: [
      ...gates.checks,
      {
        label: 'resolution',
        ok:
          delivered.width === renderCanvas.width &&
          delivered.height === renderCanvas.height,
        value: `${delivered.width}×${delivered.height}`,
        want: `${renderCanvas.width}×${renderCanvas.height}${isPreview ? ' preview · full resolution on export' : ''}`,
      },
      {
        label: 'delivery codecs',
        ok:
          delivered.vcodec === 'h264' &&
          delivered.pix_fmt === 'yuv420p' &&
          delivered.acodec === 'aac' &&
          delivered.arate === 48000 &&
          delivered.achannels === 2,
        value: `${delivered.vcodec} · ${delivered.acodec} · ${delivered.arate} Hz`,
        want: 'H.264 yuv420p · AAC stereo 48 kHz',
      },
      {
        label: 'creator review',
        ok: accepted,
        warn: !accepted,
        value: `${measurements.score}/100 · ${stop}`,
        want: String(template.acceptance.creator_score),
      },
      {
        label: 'pixel motion / colour match',
        ok: false,
        warn: true,
        value: 'unavailable in lightweight review',
        want: 'full measurement deferred',
      },
    ],
  };
  emit({ t: 'quality', m: quality.final, checks: quality.checks });
  const performance = performanceReport(operations, Date.now() - started, {
    preview: !!options.preview,
    sourceSeconds: Math.max(...files.map((f) => f.duration ?? 0)),
  });
  await atomicJson(join(dir, 'metrics.json'), {
    ...measurements,
    gates,
    performance,
    delivery: quality.final,
  });
  await saveCheckpoint(dir, 'done', { fingerprint, edl, edit: id });
  await cleanPartials(dir);
  emit({ t: 'youtube', youtube });
  emit({
    t: 'timeline',
    timeline: { ...toTimeline(edl), edl: publicEdl(edl) },
  });
  return {
    output: finalOut,
    preview: isPreview,
    master: rendered.master,
    duration: rendered.seconds,
    history: transitions,
    timeline: { ...toTimeline(edl), edl: publicEdl(edl) },
    edl: publicEdl(edl),
    edlFile: savedPath,
    projectFile: join(dir, 'project.kimo.json'),
    quality,
    youtube,
    creator,
    studioHistory: options.studioHistory
      ? {
          undo: options.studioHistory.cursor,
          redo:
            options.studioHistory.entries.length -
            options.studioHistory.cursor -
            1,
        }
      : undefined,
    stems: Object.fromEntries(
      ['voice', 'music', 'sfx'].map((k) => [
        k,
        join(renderDir, 'creator-audio', k + '.wav'),
      ]),
    ),
    beforeOutput: existsSync(before) ? before : undefined,
    cutPlan: compiled?.cut,
  };
}
