import type { KimoProject } from '@kimo/client';

/** Phase 6 implements this interface with PixiJS v8; no renderer starts in Phase 0. */
export interface Compositor {
  mount(canvas: HTMLCanvasElement): Promise<void>;
  draw(project: KimoProject, timeSec: number): void;
  dispose(): void;
}
