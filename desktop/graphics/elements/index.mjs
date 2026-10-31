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

export const ELEMENTS = Object.freeze({
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
});
export const ELEMENT_KINDS = Object.freeze(Object.keys(ELEMENTS));
