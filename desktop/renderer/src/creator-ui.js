import punchy from '../../data/templates/shorts-punchy.json';
import clean from '../../data/templates/shorts-clean.json';
import talking from '../../data/templates/youtube-talking.json';
import vlog from '../../data/templates/youtube-vlog.json';
import tutorial from '../../data/templates/tutorial.json';
import podcast from '../../data/templates/podcast-clips.json';
import documentary from '../../data/templates/documentary.json';
import explainer from '../../data/templates/explainer.json';
import montage from '../../data/templates/music-montage.json';
export const TEMPLATES = [
  punchy,
  clean,
  talking,
  vlog,
  tutorial,
  podcast,
  documentary,
  explainer,
  montage,
];
export const NAMES = [
  'Shorts — Punchy',
  'Shorts — Clean',
  'YouTube — Talking',
  'YouTube — Vlog',
  'Tutorial',
  'Podcast Clips',
  'Documentary',
  'Explainer',
  'Music Montage',
];
export const VIBES = [
  'bold captions, fast punches',
  'calm captions, crisp framing',
  'clear story, restrained visual rhythm',
  'music-led cuts, vivid travel moments',
  'quiet steps, focused screen callouts',
  'speaker framing, memorable quote hooks',
  'expressive pauses, slow cinematic pushes',
  'rich diagrams, clear visual connections',
  'beat cuts, ramps and whips',
];
const previews = import.meta.glob('./creator-previews/*.webm', {
  eager: true,
  query: '?url',
  import: 'default',
});
export const previewFor = (id) => previews[`./creator-previews/${id}.webm`];
export const captionIds = [
  'kimo',
  'hormozi',
  'ali-abdaal',
  'mkbhd',
  'karaoke',
  'doc-subtitle',
  'mrbeast',
  'boxed-highlight',
];
export const lookIds = [
  'clean',
  'warm-creator',
  'mkbhd-crisp',
  'cinematic-teal-orange',
  'vlog-bright',
  'moody-doc',
  'kimo',
];

export const captionPreview = (id) =>
  previewFor(
    {
      kimo: 'youtube-vlog',
      hormozi: 'shorts-punchy',
      'ali-abdaal': 'shorts-clean',
      mkbhd: 'youtube-talking',
      karaoke: 'podcast-clips',
      'doc-subtitle': 'tutorial',
      mrbeast: 'caption-mrbeast',
      'boxed-highlight': 'caption-boxed-highlight',
    }[id],
  );
