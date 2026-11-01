import { validatePlan } from './validate.mjs';
const dangerous = new Set(['__proto__', 'prototype', 'constructor']);
const roots = new Set([
  'story',
  'emphasis',
  'camera',
  'captions',
  'graphics',
  'broll',
  'music',
  'sfx',
  'explainers',
  'look',
  'title_pack',
]);
/** Atomic RFC 6902 add/remove/replace subset. No model-written executable fields. */
export function applyPlanPatches(plan, patches, context) {
  if (!Array.isArray(patches) || patches.length > 40)
    throw new Error('At most forty plan patches are allowed');
  const next = structuredClone(plan);
  for (const p of patches) {
    if (
      !['add', 'remove', 'replace'].includes(p?.op) ||
      typeof p.path !== 'string' ||
      !p.path.startsWith('/')
    )
      throw new Error('Unsupported plan patch');
    const parts = p.path
      .slice(1)
      .split('/')
      .map((x) => x.replace(/~1/g, '/').replace(/~0/g, '~'));
    if (!roots.has(parts[0]) || parts.some((x) => dangerous.has(x)))
      throw new Error('Patch path is not editable');
    let parent = next;
    for (const k of parts.slice(0, -1)) {
      if (
        !Object.hasOwn(parent, k) ||
        parent[k] === null ||
        typeof parent[k] !== 'object'
      )
        throw new Error('Patch parent does not exist');
      parent = parent[k];
    }
    const key = parts.at(-1);
    if (Array.isArray(parent)) {
      const i =
        key === '-' && p.op === 'add'
          ? parent.length
          : /^(0|[1-9]\d*)$/.test(key)
            ? Number(key)
            : NaN;
      if (
        !Number.isInteger(i) ||
        i < 0 ||
        i > parent.length ||
        (p.op !== 'add' && i === parent.length)
      )
        throw new Error('Patch array index does not exist');
      if (p.op === 'add') parent.splice(i, 0, structuredClone(p.value));
      else if (p.op === 'remove') parent.splice(i, 1);
      else parent[i] = structuredClone(p.value);
    } else {
      if (p.op !== 'add' && !Object.hasOwn(parent, key))
        throw new Error('Patch target does not exist');
      if (p.op === 'remove') delete parent[key];
      else parent[key] = structuredClone(p.value);
    }
  }
  const v = validatePlan(next, context);
  if (!v.ok) throw new Error(v.errors.join('; '));
  return next;
}
export function affectedPasses(patches) {
  const roots = new Set(patches.map((p) => p.path.split('/')[1]));
  if (
    [...roots].some((x) =>
      ['story', 'camera', 'broll', 'emphasis', 'look'].includes(x),
    )
  )
    return 'full';
  const picture = [...roots].some((x) =>
      ['captions', 'graphics', 'explainers'].includes(x),
    ),
    audio = [...roots].some((x) => ['music', 'sfx'].includes(x));
  return picture && audio
    ? 'overlay+audio'
    : picture
      ? 'overlay'
      : audio
        ? 'audio'
        : 'metadata';
}
export function localFollowup(text, plan, context) {
  const s = text.toLowerCase(),
    patches = [];
  if (/no music|without music|remove.*music/.test(s))
    patches.push({ op: 'replace', path: '/music/enabled', value: false });
  if (/caption.*smaller|smaller.*caption/.test(s))
    patches.push({
      op: 'replace',
      path: '/captions/font_scale',
      value: Math.max(0.55, plan.captions.font_scale * 0.85),
    });
  if (/caption.*(bigger|larger)|(bigger|larger).*caption/.test(s))
    patches.push({
      op: 'replace',
      path: '/captions/font_scale',
      value: Math.min(1.3, plan.captions.font_scale * 1.15),
    });
  if (/more zoom|more punch/.test(s))
    patches.push({
      op: 'replace',
      path: '/camera/energy',
      value: Math.min(5, plan.camera.energy + 1),
    });
  if (/no caption|without caption|remove.*caption/.test(s))
    patches.push({ op: 'replace', path: '/captions/enabled', value: false });
  const topic = /cut (?:the )?(?:part|bit|section) about (.+?)[.!?]*$/i
    .exec(text)?.[1]
    ?.toLowerCase();
  if (topic) {
    const drops = (context.sentences ?? [])
      .filter((x) => x.text.toLowerCase().includes(topic))
      .map((x) => ({ sentence: x.i, why: `user: remove ${topic}` }));
    if (drops.length) {
      patches.push({
        op: 'replace',
        path: '/story/drop',
        value: [
          ...plan.story.drop,
          ...drops.filter(
            (x) => !plan.story.drop.some((d) => d.sentence === x.sentence),
          ),
        ],
      });
      if (
        plan.story.hook &&
        drops.some((d) => d.sentence === plan.story.hook.sentence)
      )
        patches.push({ op: 'replace', path: '/story/hook', value: null });
    }
  }
  return patches;
}
