'use client';
import type { Asset, KimoProject } from '@kimo/client';

/**
 * Hands the studio's current cut to the export screen inside this tab. It
 * lives in memory only, like the clips themselves, so it survives the
 * in-app navigation to /render but not a refresh.
 */
export type ExportJob = {
  sessionId: string;
  project: KimoProject;
  assets: Asset[];
  title: string;
  burnInCaptions: boolean;
  resolution: '1080p' | '720p';
  format: 'mp4' | 'webm';
};
const jobs = new Map<string, ExportJob>();
const exported = new Map<string, number>();

export function setExportJob(job: ExportJob) {
  jobs.set(job.sessionId, job);
}
export function getExportJob(sessionId: string) {
  return jobs.get(sessionId);
}
/** Remembers which version was last exported, for the leave warning. */
export function markExported(sessionId: string, version: number) {
  exported.set(sessionId, version);
}
export function exportedVersion(sessionId: string) {
  return exported.get(sessionId);
}
/** The cut as exported: caption clips dropped when burn-in is off. */
export function exportCut(job: ExportJob): KimoProject {
  if (job.burnInCaptions) return job.project;
  const clips = Object.fromEntries(
    Object.entries(job.project.clips).filter(
      ([, clip]) =>
        !(clip.kind === 'text' && clip.text?.style.startsWith('caption')),
    ),
  );
  return { ...job.project, clips };
}
