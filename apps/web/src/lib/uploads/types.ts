import type { UploadTarget } from '@kimo/client';
import type { FileKind } from '../landing-files';

export type UploadStatus =
  'queued' | 'probing' | 'uploading' | 'done' | 'error' | 'canceled';
export interface MediaMeta {
  durationSec?: number;
  width?: number;
  height?: number;
  thumbBlobUrl?: string;
  filmstrip?: string[];
  waveform?: Float32Array;
  previewAfterUpload?: boolean;
}
export interface UploadItem {
  localId: string;
  file: File;
  kind: FileKind;
  status: UploadStatus;
  progress: number;
  bytesSent: number;
  assetId?: string;
  error?: string;
  meta: MediaMeta;
}
export interface MediaCache {
  localId: string;
  file: File;
  meta: Omit<MediaMeta, 'thumbBlobUrl' | 'filmstrip'>;
  thumbnail?: Blob;
  filmstrip?: Blob[];
  timelineWaveform?: Float32Array;
  target?: UploadTarget;
  completedParts?: { partNumber: number; etag: string }[];
  done?: boolean;
}
