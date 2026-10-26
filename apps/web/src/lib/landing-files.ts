export const MAX_FILES = 30;
export const MAX_FILE_BYTES = 2 * 1024 ** 3;
export const MAX_TOTAL_BYTES = 5 * 1024 ** 3;
export const FILE_ACCEPT =
  'video/*,image/*,audio/*,application/pdf,.txt,.md,.srt,.vtt';
export const prompts = [
  'a 30 second reel of my trip to manali, upbeat, with captions',
  'turn this podcast clip into three vertical shorts',
  'product launch video for my sneakers, cinematic, 45 seconds',
  'cut my vlog, remove the ums, add a calm lofi track',
] as const;
export type FileKind = 'video' | 'image' | 'audio' | 'doc';
export function fileKind(file: Pick<File, 'type' | 'name'>): FileKind | null {
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf' || /\.(pdf|txt|md|srt|vtt)$/.test(name))
    return 'doc';
  return null;
}
export function validateFiles(
  existing: readonly File[],
  incoming: readonly File[],
) {
  const accepted: File[] = [];
  const rejected: { file: File; reason: string }[] = [];
  let total = existing.reduce((sum, file) => sum + file.size, 0);
  for (const file of incoming) {
    const reason =
      file.size > MAX_FILE_BYTES
        ? 'it’s over 2 GB'
        : !fileKind(file)
          ? 'that file type isn’t supported yet'
          : existing.length + accepted.length >= MAX_FILES
            ? 'you can add up to 30 files'
            : total + file.size > MAX_TOTAL_BYTES
              ? 'your files total more than 5 GB'
              : null;
    if (reason) rejected.push({ file, reason });
    else {
      accepted.push(file);
      total += file.size;
    }
  }
  return { accepted, rejected };
}
export function uploadMime(file: File) {
  if (file.type) return file.type;
  if (file.name.toLowerCase().endsWith('.pdf')) return 'application/pdf';
  if (/\.(txt|md|srt|vtt)$/i.test(file.name)) return 'text/plain';
  return 'application/octet-stream';
}
export function fileMeta(file: File, duration?: number) {
  const size =
    file.size >= 1024 ** 3
      ? `${(file.size / 1024 ** 3).toFixed(1)} GB`
      : file.size >= 1024 ** 2
        ? `${Math.round(file.size / 1024 ** 2)} MB`
        : `${Math.max(1, Math.round(file.size / 1024))} KB`;
  if (duration === undefined || !Number.isFinite(duration)) return size;
  const seconds = Math.floor(duration);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} · ${size}`;
}

/** Browser-only first-frame extraction; always releases the temporary blob URL. */
export function videoPoster(
  file: File,
): Promise<{ thumbnail?: string; duration?: number }> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    let settled = false;
    const done = (result: { thumbnail?: string; duration?: number }) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
      resolve(result);
    };
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.onloadeddata = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 90;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          done({ duration: video.duration });
          return;
        }
        ctx.drawImage(video, 0, 0, 160, 90);
        done({
          thumbnail: canvas.toDataURL('image/jpeg', 0.8),
          duration: video.duration,
        });
      } catch {
        done({ duration: video.duration });
      }
    };
    video.onerror = () => done({});
    video.src = url;
  });
}
