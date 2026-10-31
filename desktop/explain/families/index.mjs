// The Phase 7 explainer families, registered into the Phase 6 graphics kit
// (same renderer: offscreen Chromium in the app, soft canvas elsewhere).
// Spec kind → element: list, stat, chart, compare, flow, timeline,
// definition, map, logo_or_icon, name_card, code, ui_callout, quote,
// icon_metaphor / kinetic_text, question, image_asset (+ photo, screenshot,
// ai_image), meme, tweet_card / news_card, and the pip speaker ring.
import list from './list.mjs';
import stat from './stat.mjs';
import chart from './chart.mjs';
import compare from './compare.mjs';
import flow from './flow.mjs';
import timeline from './timeline.mjs';
import definition from './definition.mjs';
import map from './map.mjs';
import icon from './icon.mjs';
import nameCard from './name-card.mjs';
import code from './code.mjs';
import uiCallout from './ui-callout.mjs';
import quote from './quote.mjs';
import metaphor from './metaphor.mjs';
import question from './question.mjs';
import image from './image.mjs';
import meme from './meme.mjs';
import post from './post.mjs';
import pip from './pip.mjs';

export const EXPLAIN_ELEMENTS = Object.freeze({ ex_list: list, ex_stat: stat, ex_chart: chart, ex_compare: compare, ex_flow: flow, ex_timeline: timeline, ex_definition: definition, ex_map: map, ex_icon: icon, ex_name_card: nameCard, ex_code: code, ex_ui_callout: uiCallout, ex_quote: quote, ex_metaphor: metaphor, ex_question: question, ex_image: image, ex_meme: meme, ex_post: post, ex_pip: pip });

/** The 16 spec families (7.2) → element kind. */
export const FAMILY_ELEMENT = Object.freeze({
  list: 'ex_list',
  stat: 'ex_stat',
  chart: 'ex_chart',
  compare: 'ex_compare',
  flow: 'ex_flow',
  timeline: 'ex_timeline',
  definition: 'ex_definition',
  map: 'ex_map',
  logo_or_icon: 'ex_icon',
  name_card: 'ex_name_card',
  code: 'ex_code',
  ui_callout: 'ex_ui_callout',
  quote: 'ex_quote',
  icon_metaphor: 'ex_metaphor',
  kinetic_text: 'ex_metaphor',
  question: 'ex_question',
  image_asset: 'ex_image',
});
/** Asset kinds (7.5c) → element kind (null: not a canvas card — b-roll, emoji pop, sound gag). */
export const ASSET_ELEMENT = Object.freeze({ photo: 'ex_image', screenshot: 'ex_image', ai_image: 'ex_image', reaction_gif: 'ex_image', meme: 'ex_meme', tweet_card: 'ex_post', news_card: 'ex_post', emoji: 'sticker', broll: null, sound_gag: null });
export const FAMILIES = Object.freeze(Object.keys(FAMILY_ELEMENT));
export const ASSET_KINDS = Object.freeze(Object.keys(ASSET_ELEMENT));
