import {
  KimoClient,
  type AiCredentials,
  type SessionSnapshot,
} from '@kimo/client';
import { localFile } from '@/lib/local-media';

export const ENGINE_OFFLINE_NOTE =
  'real kimo engine offline — using browser editor';
const MAX_UPLOAD = 95 * 1024 ** 2;
const MAX_STEPS = 40;

function extension(file: File, kind: string) {
  const match = /\.(mp4|mov|webm|m4a|mp3|wav|png|jpg)$/i.exec(file.name);
  if (match?.[1]) return match[1].toLowerCase();
  if (kind === 'audio') return 'm4a';
  if (kind === 'image') return 'png';
  return file.type.includes('quicktime') ? 'mov' : 'mp4';
}

/**
 * Edits with the real kimo v6 engine when it is online: uploads this
 * session's clips to one engine job, lets the AI drive kimo's tools step by
 * step (script, build, export, frame + audio check, up to 3 fix passes; the
 * studio's op log shows every tool call), then downloads the render.
 * Answers false when the engine is offline or stops, so the caller falls
 * back to the browser editor.
 */
export async function editWithRealKimo(options: {
  sessionId: string;
  note: string;
  snapshot: SessionSnapshot | null;
  ai: AiCredentials | null;
  say: (line: string) => void;
}): Promise<boolean> {
  const client = new KimoClient();
  const status = await client.engineStatus().catch(() => null);
  if (!status?.online || status.busy) {
    options.say(ENGINE_OFFLINE_NOTE);
    return false;
  }
  const snap = options.snapshot;
  const clips = (snap?.assets ?? [])
    .filter((asset) => asset.kind !== 'doc')
    .map((asset) => ({ asset, file: localFile(asset.id) }))
    .filter(
      (item): item is { asset: typeof item.asset; file: File } =>
        Boolean(item.file) && item.file!.size <= MAX_UPLOAD,
    )
    .slice(0, 12);
  if (!snap || !clips.length) {
    options.say(ENGINE_OFFLINE_NOTE);
    return false;
  }
  let job = '';
  try {
    options.say('real kimo engine online · sending your clips to it');
    job = (await client.engineStart(options.sessionId)).job;
    const files = [];
    for (const [index, { asset, file }] of clips.entries()) {
      const name = `clip-${index + 1}.${extension(file, asset.kind)}`;
      await client.engineUpload(options.sessionId, job, name, file);
      files.push({
        name,
        kind: asset.kind as 'video' | 'audio' | 'image',
        label: asset.name.slice(0, 120),
        ...(asset.durationSec ? { duration: asset.durationSec } : {}),
      });
    }
    const { width, height } = snap.project;
    const aspect = width === height ? '1:1' : width > height ? '16:9' : '9:16';
    let done = false;
    for (let step = 0; step < MAX_STEPS && !done; step++) {
      const result = await client.engineStep(
        options.sessionId,
        job,
        { note: options.note.slice(0, 4000), aspect, files },
        options.ai,
      );
      done = result.done;
    }
    if (!done) throw new Error('engine did not finish');
    const video = await client.engineOutput(options.sessionId, job);
    const url = URL.createObjectURL(video);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kimo-${new Date().toISOString().slice(0, 10)}.mp4`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
    options.say(
      `real kimo render saved · ${(video.size / 1024 ** 2).toFixed(1)} MB (${link.download})`,
    );
    return true;
  } catch {
    if (job)
      void client.engineStop(options.sessionId, job).catch(() => undefined);
    options.say('real kimo engine stopped — using browser editor');
    return false;
  }
}
