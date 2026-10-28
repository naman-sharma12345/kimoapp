export const agentTiming = {
  word: 40,
  announce: 3000,
  clock: 100,
  bottom: 80,
} as const;
export function agentLabel(
  tool: string,
  args: Record<string, unknown> = {},
  clip = 'clip',
) {
  const value = (key: string, fallback: string) =>
    typeof args[key] === 'string' ? String(args[key]) : fallback;
  const labels: Record<string, string> = {
    import_media: `adding ${value('name', clip)}`,
    import_clip: `adding ${value('name', clip)}`,
    trim_clip: `trimming ${clip}`,
    split_clip: `splitting ${clip}`,
    move_clip: `moving ${clip}`,
    reorder_clip: `moving ${clip}`,
    add_text: 'writing a title',
    add_title: 'writing a title',
    add_captions: 'writing captions',
    color_grade: `grading colour on ${clip}`,
    colour_grade: `grading colour on ${clip}`,
    sam_segment: `finding the ${value('label', 'person')} with sam 3.1`,
    segment_subject: `finding the ${value('label', 'person')} with sam 3.1`,
    reframe: `reframing for ${value('aspect', 'the frame')}`,
    reframe_clip: `reframing for ${value('aspect', 'the frame')}`,
    web_image_search: `searching the web for “${value('query', 'images')}”`,
    add_music: 'adding music',
    duck_audio: 'balancing music under voice',
    add_transition: `adding a ${value('type', 'transition')}`,
    muse_watch: `watching ${clip}`,
    transcribe: 'transcribing speech',
    remove_silence: 'removing pauses',
    apply_effect: `adding ${value('effect', 'an effect')}`,
  };
  return (labels[tool] ?? tool.replaceAll('_', ' ')).toLowerCase();
}
