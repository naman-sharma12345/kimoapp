// Asset sources the visual director can pull from (7.5c). Keyless sources
// only: the user's library, Openverse, Wikimedia Commons, screenshots and
// opt-in AI images through the locked proxy. Keyed stock/GIF services
// (GIPHY, Tenor, Pexels, Pixabay) are not wired: they need server-side keys
// kimo does not hold; reaction GIFs come from the user's library and memes
// are rebuilt in canvas (families/meme.mjs).
import * as library from './library.mjs';
import * as openverse from './openverse.mjs';
import * as wikimedia from './wikimedia.mjs';
import * as screenshot from './screenshot.mjs';
import * as aiImage from './ai-image.mjs';

export { library, openverse, wikimedia, screenshot, aiImage };
export const KEYLESS = ['library', 'openverse', 'wikimedia', 'screenshot', 'ai'];
export const UNAVAILABLE = { giphy: 'needs a GIPHY key', tenor: 'needs a Tenor key', pexels: 'needs a Pexels key', pixabay: 'needs a Pixabay key' };

/** Which sources a beat kind may use, best first. */
export function sourcesFor(kind, query = {}) {
  const asked = String(query.source ?? '').toLowerCase();
  if (kind === 'screenshot') return ['screenshot'];
  if (kind === 'ai_image') return ['ai'];
  if (kind === 'reaction_gif' || kind === 'image_asset' || kind === 'meme') return ['library'];
  if (kind === 'photo') {
    const web = asked === 'wikimedia' ? ['wikimedia', 'openverse'] : ['openverse', 'wikimedia'];
    return ['library', ...web];
  }
  return [];
}
