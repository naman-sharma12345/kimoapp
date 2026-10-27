import type { Asset, KimoProject } from '@kimo/client';
import { AudioEngine } from './audio.ts';
import { PixiRenderer } from './renderer.ts';
import { cachedWaveform, filmstripFor } from './filmstrip.ts';

export interface PreviewMetrics {
  fps: number;
  time: number;
  playing: boolean;
  approximate: boolean;
  latencyMs: number | null;
  lowQuality: boolean;
}
export class CompositorController {
  private renderer: PixiRenderer;
  private audio: AudioEngine;
  private project: KimoProject;
  private assets: readonly Asset[];
  private canvas: HTMLCanvasElement;
  private frame = 0;
  private time = 0;
  private playing = false;
  private rate = 1;
  private looping = false;
  private range: [number, number] | undefined;
  private baseTime = 0;
  private baseClock = 0;
  private dirty = true;
  private changedAt = 0;
  private latency: number | null = null;
  private frames = 0;
  private sampleStart = 0;
  private fps = 0;
  private slowSince = 0;
  private lowQuality =
    typeof navigator !== 'undefined' && navigator.hardwareConcurrency <= 4;
  private lastReport = 0;
  private disposed = false;
  private scrubbing = false;
  constructor(
    canvas: HTMLCanvasElement,
    project: KimoProject,
    assets: readonly Asset[],
    private readonly report: (metrics: PreviewMetrics) => void,
  ) {
    this.canvas = canvas;
    this.project = project;
    this.assets = assets;
    this.audio = new AudioEngine(() => this.invalidate());
    this.renderer = new PixiRenderer(
      () => this.invalidate(),
      (video, clipId) => this.audio.registerVideo(video, clipId),
      (clipId) => this.audio.removeVideo(clipId),
    );
  }
  async mount() {
    const [width, height] = this.dimensions();
    await this.renderer.mount(this.canvas, width, height);
    if (!this.disposed) this.invalidate();
  }
  update(project: KimoProject, assets: readonly Asset[], receivedAt?: number) {
    this.project = project;
    this.assets = assets;
    if (receivedAt !== undefined) this.changedAt = receivedAt;
    this.invalidate();
  }
  private clock() {
    return this.audio.time ?? performance.now() / 1000;
  }
  async play() {
    if (this.playing || !this.project.duration) return;
    try {
      await this.audio.resume();
    } catch {
      /* Silent playback uses the performance clock. */
    }
    if (this.disposed) return;
    if (this.time >= this.project.duration) this.time = 0;
    this.playing = true;
    this.baseTime = this.time;
    this.baseClock = this.clock();
    this.invalidate();
  }
  pause() {
    if (!this.playing) return;
    this.time = this.currentTime();
    this.playing = false;
    this.audio.stop();
    this.renderer.media.pause();
    this.invalidate();
  }
  seek(time: number) {
    this.time = Math.max(0, Math.min(this.project.duration, time));
    this.audio.stop();
    if (this.scrubbing) this.audio.scrub(this.project, this.assets, this.time);
    this.baseTime = this.time;
    this.baseClock = this.clock();
    this.invalidate();
  }
  setScrubbing(active: boolean) {
    this.scrubbing = active;
    if (active) void this.audio.resume().catch(() => undefined);
    else this.invalidate();
  }
  setSpeed(rate: number) {
    if (this.playing) this.time = this.currentTime();
    this.rate = Math.max(0.5, Math.min(2, rate));
    this.baseTime = this.time;
    this.baseClock = this.clock();
    this.audio.stop();
    this.invalidate();
  }
  setLoop(enabled: boolean, range?: [number, number]) {
    this.looping = enabled;
    this.range = range;
  }
  setVolume(volume: number) {
    const wasAudioClock = this.audio.time !== undefined;
    if (this.playing) this.time = this.currentTime();
    this.audio.setVolume(volume, volume === 0);
    if (this.playing && wasAudioClock !== (this.audio.time !== undefined)) {
      this.baseTime = this.time;
      this.baseClock = this.clock();
    }
  }
  get current() {
    return this.time;
  }
  async getFilmstrip(clipId: string, widthPx: number) {
    const clip = this.project.clips[clipId];
    const asset = clip?.assetId
      ? this.assets.find((item) => item.id === clip.assetId)
      : undefined;
    return clip && asset ? filmstripFor(clip, asset, widthPx) : [];
  }
  async getWaveform(clipId: string) {
    const clip = this.project.clips[clipId];
    const asset = clip?.assetId
      ? this.assets.find((item) => item.id === clip.assetId)
      : undefined;
    return asset ? cachedWaveform(asset) : undefined;
  }
  private currentTime() {
    return this.playing
      ? this.baseTime + (this.clock() - this.baseClock) * this.rate
      : this.time;
  }
  private dimensions(): [number, number] {
    const ratio = this.project.width / this.project.height;
    const maxWidth = this.lowQuality
      ? ratio < 1
        ? 720
        : 1280
      : this.project.width;
    const maxHeight = this.lowQuality
      ? ratio < 1
        ? 1280
        : 720
      : this.project.height;
    const displayWidth = Math.max(
      1,
      this.canvas.clientWidth * (window.devicePixelRatio || 1),
    );
    const displayHeight = Math.max(
      1,
      this.canvas.clientHeight * (window.devicePixelRatio || 1),
    );
    const scale = Math.min(
      1,
      maxWidth / this.project.width,
      maxHeight / this.project.height,
      Math.max(
        displayWidth / this.project.width,
        displayHeight / this.project.height,
      ),
    );
    return [
      Math.max(1, Math.round(this.project.width * scale)),
      Math.max(1, Math.round(this.project.height * scale)),
    ];
  }
  invalidate() {
    if (this.disposed) return;
    this.dirty = true;
    if (!this.frame) this.frame = requestAnimationFrame(this.tick);
  }
  private tick = (now: number) => {
    this.frame = 0;
    if (this.disposed) return;
    if (this.playing) {
      this.time = this.currentTime();
      const end = this.range?.[1] ?? this.project.duration;
      if (this.time >= end) {
        if (this.looping) this.seek(this.range?.[0] ?? 0);
        else {
          this.time = end;
          this.playing = false;
          this.audio.stop();
          this.renderer.media.pause();
        }
      }
    }
    let rendered = false;
    if (this.dirty || this.playing) {
      const [width, height] = this.dimensions();
      const frameReady = this.renderer.draw(
        this.project,
        this.assets,
        this.time,
        this.playing,
        this.rate,
        width,
        height,
        this.scrubbing,
      );
      rendered = frameReady;
      this.audio.sync(
        this.project,
        this.assets,
        this.time,
        this.playing,
        this.rate,
      );
      if (this.changedAt && frameReady) {
        this.latency = Math.max(0, performance.now() - this.changedAt);
        this.changedAt = 0;
      }
      this.dirty = false;
    }
    if (!this.sampleStart) this.sampleStart = now;
    if (rendered) this.frames++;
    if (now - this.sampleStart >= 1000) {
      this.fps = Math.round((this.frames * 1000) / (now - this.sampleStart));
      this.frames = 0;
      this.sampleStart = now;
      if (this.playing && this.fps < 40) {
        if (!this.slowSince) this.slowSince = now;
        if (now - this.slowSince >= 2000 && !this.lowQuality) {
          this.lowQuality = true;
          this.dirty = true;
        }
      } else this.slowSince = 0;
    }
    if (now - this.lastReport >= 100 || !this.playing) {
      this.lastReport = now;
      this.report({
        fps: this.playing ? this.fps : 0,
        time: this.time,
        playing: this.playing,
        approximate: this.renderer.approximate,
        latencyMs: this.latency,
        lowQuality: this.lowQuality,
      });
    }
    if (this.playing || this.dirty)
      this.frame = requestAnimationFrame(this.tick);
  };
  destroy() {
    this.disposed = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.audio.destroy();
    this.renderer.destroy();
  }
}
