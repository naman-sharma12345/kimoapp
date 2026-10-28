import { KimoClient, type AiCredentials, type Asset } from '@kimo/client';
import { localFile } from './local-media';

/**
 * The look-and-listen pass. For each clip in this tab, a few small frames and
 * its sound (16 kHz mono) go to the AI model through kimo's API, which passes
 * them straight on and stores only the text notes it gets back (summary,
 * scene notes, timed words). The media itself is never written anywhere.
 */
export const PERCEIVE_NOTE = 'kimo is watching and listening to your clips';
const MAX_SECONDS = 300;
const RATE = 16000;
const done = new Set<string>();
const running = new Map<string, Promise<void>>();

function wavBase64(samples: Float32Array, rate: number) {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(at + i, value.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(
      44 + i * 2,
      value < 0 ? value * 0x8000 : value * 0x7fff,
      true,
    );
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** The clip's sound as 16 kHz mono WAV, base64, or undefined without sound. */
async function soundOf(file: File): Promise<string | undefined> {
  if (typeof OfflineAudioContext === 'undefined') return undefined;
  try {
    const probe = new OfflineAudioContext(1, 1, RATE);
    const decoded = await probe.decodeAudioData(await file.arrayBuffer());
    const seconds = Math.min(decoded.duration, MAX_SECONDS);
    const length = Math.max(1, Math.floor(seconds * RATE));
    const context = new OfflineAudioContext(1, length, RATE);
    const source = context.createBufferSource();
    source.buffer = decoded;
    source.connect(context.destination);
    source.start();
    const mixed = await context.startRendering();
    return wavBase64(mixed.getChannelData(0), RATE);
  } catch {
    return undefined;
  }
}

/** A few small JPEG frames spread over the clip. */
function framesOf(
  file: File,
): Promise<{ duration: number; frames: { t: number; image: string }[] }> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    const frames: { t: number; image: string }[] = [];
    let times: number[] = [];
    let duration = 0;
    const finish = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
      resolve({ duration, frames });
    };
    const timer = setTimeout(finish, 60_000);
    const next = () => {
      const time = times.shift();
      if (time === undefined) {
        clearTimeout(timer);
        finish();
        return;
      }
      video.currentTime = time;
    };
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.onloadedmetadata = () => {
      duration = Number.isFinite(video.duration) ? video.duration : 0;
      if (!duration || !video.videoWidth) {
        clearTimeout(timer);
        finish();
        return;
      }
      const count = Math.max(4, Math.min(12, Math.round(duration / 3)));
      times = Array.from(
        { length: count },
        (_, i) => Math.round(((i + 0.5) / count) * duration * 100) / 100,
      );
      next();
    };
    video.onseeked = () => {
      const scale = 512 / Math.max(video.videoWidth, video.videoHeight);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(2, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(2, Math.round(video.videoHeight * scale));
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push({
          t: video.currentTime,
          image: canvas.toDataURL('image/jpeg', 0.7),
        });
      }
      next();
    };
    video.onerror = () => {
      clearTimeout(timer);
      finish();
    };
    video.src = url;
  });
}

async function perceiveOne(
  sessionId: string,
  asset: Asset,
  file: File,
  ai: AiCredentials | null,
) {
  const sight =
    asset.kind === 'video'
      ? await framesOf(file)
      : { duration: asset.durationSec ?? 0, frames: [] };
  const duration = sight.duration || asset.durationSec || 0;
  if (!duration || duration > 600) return;
  const audio = await soundOf(file);
  if (!audio && !sight.frames.length) return;
  await new KimoClient().perceive(
    sessionId,
    {
      assetId: asset.id,
      durationSec: duration,
      ...(audio ? { audio } : {}),
      frames: sight.frames,
    },
    ai,
  );
}

/**
 * Runs the pass once per clip in this tab; failures are quiet (the edit
 * still runs on the measured numbers). Calls onStart once when work begins.
 */
export async function perceiveClips(
  sessionId: string,
  assets: Asset[],
  ai: AiCredentials | null,
  onStart: () => void = () => undefined,
) {
  const jobs: Promise<void>[] = [];
  let started = false;
  for (const asset of assets) {
    if (asset.kind !== 'video' && asset.kind !== 'audio') continue;
    const busy = running.get(asset.id);
    if (busy) {
      jobs.push(busy);
      continue;
    }
    if (done.has(asset.id)) continue;
    const file = localFile(asset.id);
    if (!file) continue;
    if (!started) {
      started = true;
      onStart();
    }
    done.add(asset.id);
    const job = perceiveOne(sessionId, asset, file, ai)
      .catch(() => undefined)
      .finally(() => running.delete(asset.id));
    running.set(asset.id, job);
    jobs.push(job);
  }
  await Promise.all(jobs);
}
