export function formatTimecode(seconds: number, fps = 30): string {
  const frames = Math.max(0, Math.floor(seconds * fps));
  return [
    Math.floor(frames / (fps * 3600)),
    Math.floor(frames / (fps * 60)) % 60,
    Math.floor(frames / fps) % 60,
    frames % fps,
  ]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
