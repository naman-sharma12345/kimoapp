import type { ServerEvent } from '@kimo/client';
import type { UploadItem } from '../uploads/types';

export type WarmupStep = 'upload' | 'watch' | 'plan' | 'ready';
const steps: WarmupStep[] = ['upload', 'watch', 'plan', 'ready'];
export interface WarmupState {
  step: WarmupStep;
  serverProgress: number;
  notice: string;
  clipIndex?: number;
  clipCount?: number;
  error?: string;
}
export const initialWarmup: WarmupState = {
  step: 'upload',
  serverProgress: 0,
  notice: '',
};
export function updateWarmup(
  state: WarmupState,
  event: ServerEvent,
): WarmupState {
  if (event.t === 'error') return { ...state, error: event.message };
  if (event.t === 'agent.status')
    return event.label ? { ...state, notice: event.label } : state;
  if (event.t === 'agent.action.start') return { ...state, step: 'ready' };
  if (event.t !== 'warmup.step') return state;
  const next =
    event.step === 'probe' || event.step === 'watch' ? 'watch' : event.step;
  const step =
    steps.indexOf(next) >= steps.indexOf(state.step) ? next : state.step;
  return {
    ...state,
    step,
    serverProgress: Math.max(state.serverProgress, event.pct),
    clipIndex: event.clipIndex ?? state.clipIndex,
    clipCount: event.clipCount ?? state.clipCount,
  };
}
export function aggregateUpload(
  items: readonly UploadItem[],
  noFiles: boolean,
  fallback: number,
) {
  const available = items.filter((item) => item.status !== 'canceled');
  if (!available.length) return noFiles ? 1 : fallback;
  const total = available.reduce((sum, item) => sum + item.file.size, 0);
  if (!total) return available.every((item) => item.status === 'done') ? 1 : 0;
  return Math.min(
    1,
    available.reduce(
      (sum, item) =>
        sum + (item.status === 'done' ? item.file.size : item.bytesSent),
      0,
    ) / total,
  );
}
