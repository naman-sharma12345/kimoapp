import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const schema = () =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../schemas/plan.schema.json', import.meta.url)),
      'utf8',
    ),
  );
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
/** Deliberately small, fail-closed JSON Schema subset used by the shipped schema. */
export function validateSchema(
  value,
  definition,
  root = definition,
  path = '$',
  errors = [],
) {
  if (errors.length > 80) return errors;
  if (definition.$ref) {
    const node = definition.$ref
      .split('/')
      .slice(1)
      .reduce((o, k) => o?.[k], root);
    if (!node) errors.push(`${path}: bad schema reference`);
    else validateSchema(value, node, root, path, errors);
    return errors;
  }
  if (definition.anyOf) {
    if (
      !definition.anyOf.some(
        (d) => validateSchema(value, d, root, path, []).length === 0,
      )
    )
      errors.push(`${path}: no allowed type`);
    return errors;
  }
  const type = Array.isArray(value)
    ? 'array'
    : value === null
      ? 'null'
      : typeof value;
  const types = Array.isArray(definition.type)
    ? definition.type
    : [definition.type];
  if (
    definition.type &&
    !types.some(
      (t) => t === type || (t === 'integer' && Number.isInteger(value)),
    )
  ) {
    errors.push(`${path}: expected ${types.join('|')}`);
    return errors;
  }
  if (
    definition.enum &&
    !definition.enum.some((v) => JSON.stringify(v) === JSON.stringify(value))
  )
    errors.push(`${path}: unknown value`);
  if (type === 'number') {
    if (
      !Number.isFinite(value) ||
      value < (definition.minimum ?? -Infinity) ||
      value > (definition.maximum ?? Infinity)
    )
      errors.push(`${path}: number out of bounds`);
  }
  if (
    type === 'string' &&
    (value.length > (definition.maxLength ?? 10000) ||
      value.length < (definition.minLength ?? 0))
  )
    errors.push(`${path}: string length`);
  if (type === 'array') {
    if (
      value.length > (definition.maxItems ?? 1000) ||
      value.length < (definition.minItems ?? 0)
    )
      errors.push(`${path}: array length`);
    if (
      definition.uniqueItems &&
      new Set(value.map((v) => JSON.stringify(v))).size !== value.length
    )
      errors.push(`${path}: duplicate items`);
    value.forEach((v, i) =>
      validateSchema(v, definition.items ?? {}, root, `${path}/${i}`, errors),
    );
  }
  if (type === 'object') {
    for (const k of definition.required ?? [])
      if (!Object.hasOwn(value, k)) errors.push(`${path}/${k}: required`);
    for (const [k, v] of Object.entries(value)) {
      if (forbidden.has(k)) {
        errors.push(`${path}: forbidden property`);
        continue;
      }
      const d = definition.properties?.[k];
      if (d) validateSchema(v, d, root, `${path}/${k}`, errors);
      else if (definition.additionalProperties === false)
        errors.push(`${path}/${k}: unknown property`);
      else if (typeof definition.additionalProperties === 'object')
        validateSchema(
          v,
          definition.additionalProperties,
          root,
          `${path}/${k}`,
          errors,
        );
    }
  }
  return errors;
}
const words = (s) =>
  String(s ?? '')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];
export function validatePlan(plan, context = {}) {
  const errors = validateSchema(plan, schema());
  if (errors.length) return { ok: false, errors };
  if (context.template?.id && plan.template !== context.template.id)
    errors.push('template: must match the selected template');
  const sentences = context.sentences ?? [],
    byId = new Map(sentences.map((s) => [s.i, s])),
    clips = new Set((context.clips ?? []).map((c) => c.id));
  const has = (i, path) => {
    if (!byId.has(i)) errors.push(`${path}: sentence ${i} does not exist`);
  };
  const story = plan.story;
  if (story.hook) {
    has(story.hook.sentence, 'hook');
    const s = byId.get(story.hook.sentence);
    if (s) {
      const n = s.word_count ?? words(s.text).length,
        [a, b] = story.hook.trim_words;
      if (a > b || b >= n || b - a >= 12)
        errors.push('hook: invalid word span');
      if (words(story.hook.hook_text).length > 6)
        errors.push('hook: title exceeds six words');
    }
  }
  for (const i of story.order) has(i, 'order');
  for (const d of story.drop) has(d.sentence, 'drop');
  for (const i of story.keep_pause_after) has(i, 'pause');
  if (
    sentences.length &&
    sentences.every((s) => story.drop.some((d) => d.sentence === s.i))
  )
    errors.push('story: cannot drop all sentences');
  const limit = context.duration ?? Infinity;
  for (const o of plan.camera.overrides)
    if (o.range[0] >= o.range[1] || o.range[1] > limit)
      errors.push('camera: invalid output range');
  for (const g of plan.graphics)
    if ((g.at ?? 0) >= limit) errors.push('graphic: beyond footage');
  for (const s of plan.sfx)
    if (!/^(sentence|emphasis|graphic|cut):\d+$/.test(s.at_event))
      errors.push('sfx: unsupported anchor');
  for (const [group, i] of Object.entries(story.best_take)) {
    has(i, 'best_take');
    if (byId.get(i)?.group !== group)
      errors.push('best_take: not in take group');
  }
  for (const e of plan.emphasis) {
    has(e.sentence, 'emphasis');
    if (!words(byId.get(e.sentence)?.text).includes(e.word.toLowerCase()))
      errors.push('emphasis word is not spoken');
  }
  for (const b of plan.broll) {
    has(b.sentence, 'broll');
    if (!clips.has(b.clip)) errors.push('broll: unknown clip');
  }
  for (const g of plan.graphics)
    if (g.at_sentence != null) has(g.at_sentence, 'graphic');
  if (plan.music.drop_at_sentence != null)
    has(plan.music.drop_at_sentence, 'music');
  for (const c of plan.title_pack.chapters) has(c.sentence, 'chapter');
  const corpus = sentences
      .map((s) => s.text)
      .join(' ')
      .toLowerCase(),
    numbers = new Set(corpus.match(/\d+(?:[.,]\d+)?/g) ?? []);
  const texts = [
    story.hook?.hook_text,
    ...plan.title_pack.titles,
    plan.title_pack.thumbnail_text,
    plan.title_pack.description,
    ...plan.graphics.flatMap((g) => [g.text, g.name, g.role, g.label]),
    ...plan.explainers.flatMap((e) => [e.title, ...e.items.map((i) => i.text)]),
  ].filter(Boolean);
  if (sentences.length)
    for (const text of texts)
      for (const n of text.match(/\d+(?:[.,]\d+)?/g) ?? [])
        if (!numbers.has(n)) errors.push(`unsubstantiated number: ${n}`);
  const totalWords = context.word_count ?? Infinity;
  for (const e of plan.explainers)
    if (
      e.start_word_idx >= totalWords ||
      e.end_word_idx >= totalWords ||
      e.start_word_idx > e.end_word_idx ||
      e.items.some(
        (i) =>
          i.say_word_idx < e.start_word_idx || i.say_word_idx > e.end_word_idx,
      )
    )
      errors.push('explainer: invalid word range');
  return { ok: errors.length === 0, errors };
}
