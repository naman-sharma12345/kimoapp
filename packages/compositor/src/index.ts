import type { KimoProject } from '@kimo/client';
export * from './media-cache.ts';

/** Phase 6 implements this interface with PixiJS v8; no renderer starts in Phase 0. */
export interface Compositor {
  mount(canvas: HTMLCanvasElement): Promise<void>;
  draw(project: KimoProject, timeSec: number): void;
  dispose(): void;
}
