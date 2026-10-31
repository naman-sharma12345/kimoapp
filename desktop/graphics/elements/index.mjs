// The motion-graphics kit: one module per element ({kind, defaults,
// layout(canvas, props, env), draw(ctx, t, props, layout, env)}).
import hook from './hook-title.mjs';
import lowerThird from './lower-third.mjs';
import stat from './stat-pop.mjs';
import callout from './callout.mjs';
import screenZoom from './screen-zoom.mjs';
import progress from './progress-bar.mjs';
import chapter from './chapter-card.mjs';
import sticker from './sticker.mjs';
import textBehind from './text-behind.mjs';
import cta from './cta-card.mjs';
import { EXPLAIN_ELEMENTS } from '../../explain/families/index.mjs';

const KIT = {
  hook_title: hook,
  lower_third: lowerThird,
  stat,
  callout,
  screen_zoom: screenZoom,
  progress,
  chapter,
  sticker,
  text_behind: textBehind,
  cta,
};
// Phase 7 explainer families (explain/families/*.mjs) render through the same kit
export const ELEMENTS = Object.freeze({ ...KIT, ...EXPLAIN_ELEMENTS });
/** The Phase 6 kit kinds (the planner's `graphic` tool); explainer kinds are planned by explain/. */
export const ELEMENT_KINDS = Object.freeze(Object.keys(KIT));
