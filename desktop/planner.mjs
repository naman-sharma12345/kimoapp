import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { validatePlan } from './planner/validate.mjs';
import { validateJudgment } from './judgment.mjs';
import {
  localFollowup,
  applyPlanPatches,
  affectedPasses,
} from './planner/patch.mjs';
export const PLANNER_VERSION = 1;
export function defaultPlan(input) {
  const t = input.template,
    s = input.sentences ?? [],
    first =
      s.find((x) => !/^\s*(hi|hello|hey everyone)\b/i.test(x.text)) ?? s[0];
  const title = (
    first?.text.split(/\s+/).slice(0, 6).join(' ') ?? 'your video'
  ).slice(0, 60);
  return {
    template: t.id,
    story: {
      hook: null,
      order: s.map((x) => x.i),
      drop: [],
      best_take: {},
      keep_pause_after: [],
    },
    emphasis: [],
    camera: { energy: t.camera.energy, overrides: [] },
    captions: {
      enabled:
        t.captions.enabled &&
        !/no captions|without captions/i.test(input.note ?? ''),
      style: t.captions.style,
      accent_words: [],
      hints: [],
      font_scale: t.captions.font_scale,
      position: 'auto',
    },
    graphics:
      t.graphics.hook_title && s.length
        ? [{ kind: 'hook_title', text: title, at: 0.1 }]
        : [],
    broll: [],
    music: {
      enabled: !/no music|without music/i.test(input.note ?? ''),
      mood: t.audio.music_mood,
      track: 'auto',
      drop_at_sentence: null,
    },
    sfx: [],
    explainers: [],
    look: { id: t.color.look, strength: t.color.strength },
    title_pack: {
      titles: [title, `about ${title}`, `${title} | ${t.label}`],
      thumbnail_text: title,
      description: '',
      chapters: [],
    },
  };
}
/** One ledger per edit. A request with images counts toward BOTH caps. Reservations never disappear on errors. */
export class EditBudget {
  constructor({ text = 0, vision = 0, reserved_usd = 0, requests = [] } = {}) {
    Object.assign(this, { text, vision, reserved_usd, requests });
  }
  reserve(kind, images, key) {
    const estimate = images.length ? 0.03 : 0.01;
    if (this.reserved_usd + estimate > 0.090001)
      throw new Error('Creator estimated cost cap reached');
    if (this.text >= 3 || (images.length && this.vision >= 2))
      throw new Error('Creator AI call cap reached');
    this.text++;
    if (images.length) this.vision++;
    this.reserved_usd += estimate;
    const r = {
      kind,
      key,
      estimate_usd: estimate,
      exact_billing: false,
      status: 'reserved',
    };
    this.requests.push(r);
    return r;
  }
  snapshot() {
    return {
      text: this.text,
      vision: this.vision,
      estimated_cap_usd: 0.09,
      reserved_usd: +this.reserved_usd.toFixed(4),
      requests: this.requests,
    };
  }
}
export class PlanCalls {
  constructor({
    ask,
    cacheDir,
    budget = new EditBudget(),
    signal,
    emit = () => {},
    replay = false,
    timeout = 60000,
    onBudget = async () => {},
  }) {
    Object.assign(this, {
      ask,
      cacheDir,
      budget,
      signal,
      emit,
      replay,
      timeout,
      onBudget,
    });
  }
  async call(kind, text, images = []) {
    const key = createHash('sha256')
        .update(JSON.stringify([PLANNER_VERSION, kind, text, images]))
        .digest('hex'),
      path = join(this.cacheDir, key + '.json');
    if (existsSync(path)) {
      this.emit({
        t: 'think',
        text: `${kind}: cached response · no new AI cost`,
      });
      return JSON.parse(await readFile(path, 'utf8'));
    }
    if (this.replay) throw new Error(`Creator replay cache miss: ${key}`);
    if (!this.ask)
      throw new Error('AI unavailable; using deterministic decisions');
    const reservation = this.budget.reserve(kind, images, key),
      id = randomUUID().slice(0, 8),
      start = Date.now();
    await this.onBudget(this.budget.snapshot());
    this.emit({
      t: 'op',
      id,
      opId: id,
      tool: 'creator_ai',
      phase: 'start',
      title: `${kind} · estimated AI $${reservation.estimate_usd.toFixed(2)} (not exact billing)`,
      at: start,
    });
    let timer;
    const controller = new AbortController(),
      abort = () => controller.abort();
    this.signal?.addEventListener('abort', abort, { once: true });
    try {
      this.signal?.throwIfAborted();
      const raw = await Promise.race([
        this.ask(kind, text, images, controller.signal),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error('Creator proxy exceeded 60 seconds'));
          }, this.timeout);
        }),
      ]);
      const data = raw?.plan ?? raw?.record ?? raw;
      await mkdir(this.cacheDir, { recursive: true });
      await writeFile(path + '.partial', JSON.stringify(data));
      await rename(path + '.partial', path);
      reservation.status = 'returned';
      this.emit({
        t: 'op',
        id,
        phase: 'end',
        ok: true,
        ms: Date.now() - start,
        result: `${kind} recorded · cumulative estimated reservation $${this.budget.reserved_usd.toFixed(2)}`,
      });
      return data;
    } catch (error) {
      reservation.status = 'failed/reserved';
      this.emit({
        t: 'op',
        id,
        phase: 'end',
        ok: false,
        ms: Date.now() - start,
        error: error.message,
      });
      throw error;
    } finally {
      clearTimeout(timer);
      this.signal?.removeEventListener('abort', abort);
      await this.onBudget(this.budget.snapshot());
    }
  }
}
export async function planEdit(input, calls) {
  const fallback = defaultPlan(input),
    prompt = readFileSync(
      fileURLToPath(new URL('./prompts/planner.md', import.meta.url)),
      'utf8',
    );
  const { images: _images, words: sourceWords, ...rest } = input;
  // Dense timestamps and repeated absolute paths are compiler inputs, not model
  // context. Keep compact global word IDs so the planner can anchor diagrams.
  const context = { ...rest, words: sourceWords?.map((w) => [w.index, w.w]) };
  const text = `CREATOR PLAN v${PLANNER_VERSION}\n${prompt}\nINPUT_JSON\n${JSON.stringify(context)}\nSCHEMA_JSON\n${JSON.stringify(JSON.parse(readFileSync(fileURLToPath(new URL('./schemas/plan.schema.json', import.meta.url)), 'utf8')))}`;
  if (text.length > 57000)
    return {
      plan: fallback,
      source: 'fallback',
      errors: [
        'Planner context exceeds proxy limit; kept deterministic edit without truncating evidence',
      ],
    };
  let errors = [],
    previousResponse;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const requestText =
        text +
        (attempt
          ? `\nRepair only these validation failures: ${errors.join('; ')}\nINVALID_RESPONSE_JSON\n${JSON.stringify(previousResponse)}`
          : '');
      if (requestText.length > 60000)
        return {
          plan: fallback,
          source: 'fallback',
          errors: [...errors, 'Repair context exceeds proxy limit'],
        };
      const raw = await calls.call(
        attempt ? 'plan-repair' : 'plan',
        requestText,
        attempt ? [] : (input.images ?? []),
      );
      const v = validatePlan(raw, input);
      previousResponse = raw;
      errors = v.errors;
      if (v.ok)
        return {
          plan: raw,
          source: attempt ? 'repaired' : 'model',
          errors: [],
        };
    } catch (error) {
      if (calls.signal?.aborted || calls.replay) throw error;
      return { plan: fallback, source: 'fallback', errors: [error.message] };
    }
  }
  return { plan: fallback, source: 'fallback', errors };
}
export async function followupPlan(text, plan, context, calls) {
  let patches = localFollowup(text, plan, context);
  if (!patches.length) {
    const response = await calls.call(
      'followup',
      `Return only {"patches":[RFC6902 add/remove/replace]}. Edit this creator plan to satisfy the user's request. No new facts or executable fields.\n${JSON.stringify({ request: text, plan, sentences: context.sentences })}`,
    );
    patches = response.patches;
  }
  return {
    plan: applyPlanPatches(plan, patches, context),
    patches,
    pass: affectedPasses(patches),
  };
}
export function storyJudgment(plan, analysis, options = {}) {
  const raw = {
    ...plan.story,
    order: plan.story.order.filter(
      (i) => !plan.story.drop.some((d) => d.sentence === i),
    ),
    emphasis: plan.emphasis.map(({ sentence, word, kind }) => ({
      sentence,
      word,
      kind,
    })),
    chapters: plan.title_pack.chapters.map((c) => ({
      t_sentence: c.sentence,
      title: c.title,
    })),
  };
  const v = validateJudgment(raw, analysis, options);
  if (!v.ok) throw new Error(v.errors.join('; '));
  return v.judgment;
}
