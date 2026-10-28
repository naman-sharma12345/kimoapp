import type { Asset, Clip, KimoProject } from '@kimo/client';

type AudioClip = {
  source: AudioBufferSourceNode;
  gain: GainNode;
  rate: number;
};
export class AudioEngine {
  private context?: AudioContext;
  private master?: GainNode;
  private analyser?: AnalyserNode;
  private samples = new Float32Array(256);
  get levelDb() {
    if (!this.analyser) return -60;
    this.analyser.getFloatTimeDomainData(this.samples);
    const rms = Math.sqrt(
      this.samples.reduce((sum, value) => sum + value * value, 0) /
        this.samples.length,
    );
    return rms > 0 ? Math.max(-60, 20 * Math.log10(rms)) : -60;
  }
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Set<string>();
  private active = new Map<string, AudioClip>();
  private videos = new Map<
    string,
    {
      element: HTMLVideoElement;
      gain?: GainNode;
      source?: MediaElementAudioSourceNode;
    }
  >();
  private volume = 1;
  private muted = false;
  private lastScrub = 0;
  constructor(private readonly invalidate: () => void) {}
  registerVideo(element: HTMLVideoElement, clipId: string) {
    this.videos.set(clipId, { element });
    if (this.context) this.connectVideo(clipId);
  }
  private connectVideo(id: string) {
    const entry = this.videos.get(id);
    if (!entry || entry.gain || !this.context || !this.master) return;
    try {
      const source = this.context.createMediaElementSource(entry.element);
      const gain = this.context.createGain();
      source.connect(gain).connect(this.master);
      entry.element.muted = false;
      entry.gain = gain;
      entry.source = source;
    } catch {
      entry.element.muted = true;
    }
  }
  removeVideo(clipId: string) {
    const entry = this.videos.get(clipId);
    entry?.source?.disconnect();
    entry?.gain?.disconnect();
    this.videos.delete(clipId);
  }
  async resume() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      this.master.connect(this.analyser).connect(this.context.destination);
      this.setVolume(this.volume, this.muted);
      for (const id of this.videos.keys()) this.connectVideo(id);
    }
    await this.context.resume();
  }
  get time() {
    return this.context?.state === 'running' && !this.muted
      ? this.context.currentTime
      : undefined;
  }
  setVolume(volume: number, muted = false) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.muted = muted;
    if (this.master && this.context)
      this.master.gain.setTargetAtTime(
        muted ? 0 : this.volume,
        this.context.currentTime,
        0.01,
      );
  }
  async prepare(asset: Asset) {
    if (
      !this.context ||
      this.buffers.has(asset.id) ||
      this.loading.has(asset.id)
    )
      return;
    this.loading.add(asset.id);
    try {
      const response = await fetch(asset.proxyUrl ?? asset.url);
      if (!response.ok) throw new Error('Audio fetch failed');
      const decoded = await this.context.decodeAudioData(
        await response.arrayBuffer(),
      );
      this.buffers.set(asset.id, decoded);
      this.invalidate();
    } catch {
      /* Preview remains usable when audio cannot be decoded. */
    } finally {
      this.loading.delete(asset.id);
    }
  }
  sync(
    project: KimoProject,
    assets: readonly Asset[],
    time: number,
    playing: boolean,
    rate: number,
  ) {
    const context = this.context;
    const tracks = new Map(project.tracks.map((track) => [track.id, track]));
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const clips = Object.values(project.clips).filter(
      (clip) =>
        time >= clip.start &&
        time < clip.start + clip.duration &&
        !tracks.get(clip.trackId)?.muted,
    );
    const voice = clips.some(
      (clip) =>
        clip.kind === 'audio' &&
        /voice|speech/i.test(tracks.get(clip.trackId)?.name ?? ''),
    );
    const ids = new Set(
      clips.filter((clip) => clip.kind === 'audio').map((clip) => clip.id),
    );
    for (const [id, item] of this.active)
      if (!playing || !ids.has(id) || item.rate !== rate) {
        try {
          item.source.stop();
        } catch {
          /* Already ended. */
        }
        item.source.disconnect();
        item.gain.disconnect();
        this.active.delete(id);
      }
    if (!context || !this.master) return;
    const gainFor = (clip: Clip) => {
      const elapsed = time - clip.start;
      const fade = Math.min(
        1,
        clip.fadeIn ? elapsed / clip.fadeIn : 1,
        clip.fadeOut ? (clip.duration - elapsed) / clip.fadeOut : 1,
      );
      return (
        (clip.volume ?? 1) *
        Math.max(0, fade) *
        (voice &&
        (clip.duckUnderVoice ??
          /music/i.test(tracks.get(clip.trackId)?.name ?? ''))
          ? 10 ** (-12 / 20)
          : 1)
      );
    };
    for (const [id, item] of this.videos) {
      const clip = clips.find((entry) => entry.id === id);
      item.element.preservesPitch = clip?.keepPitch ?? true;
      if (item.gain)
        item.gain.gain.setTargetAtTime(
          clip ? gainFor(clip) : 0,
          context.currentTime,
          0.3,
        );
    }
    if (!playing) return;
    for (const clip of clips) {
      if (clip.kind !== 'audio' || !clip.assetId) continue;
      const asset = assetsById.get(clip.assetId);
      if (!asset) continue;
      const buffer = this.buffers.get(asset.id);
      if (!buffer) {
        void this.prepare(asset);
        continue;
      }
      let active = this.active.get(clip.id);
      if (!active) {
        const offset = clip.in + (time - clip.start) * clip.speed;
        if (offset >= buffer.duration) continue;
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = clip.speed * rate;
        const gain = context.createGain();
        source.connect(gain).connect(this.master);
        gain.gain.value = gainFor(clip);
        source.start(0, Math.max(0, offset));
        active = { source, gain, rate };
        this.active.set(clip.id, active);
        source.onended = () => {
          if (this.active.get(clip.id)?.source === source)
            this.active.delete(clip.id);
        };
      }
      active.gain.gain.setTargetAtTime(gainFor(clip), context.currentTime, 0.3);
    }
  }
  stop() {
    for (const item of this.active.values()) {
      try {
        item.source.stop();
      } catch {
        /* Already ended. */
      }
      item.source.disconnect();
      item.gain.disconnect();
    }
    this.active.clear();
  }
  scrub(project: KimoProject, assets: readonly Asset[], time: number) {
    const context = this.context;
    const master = this.master;
    if (
      !context ||
      !master ||
      this.muted ||
      context.currentTime - this.lastScrub < 0.06
    )
      return;
    this.lastScrub = context.currentTime;
    const active = Object.values(project.clips).filter(
      (clip) =>
        clip.kind === 'audio' &&
        time >= clip.start &&
        time < clip.start + clip.duration &&
        !project.tracks.find((track) => track.id === clip.trackId)?.muted,
    );
    for (const clip of active) {
      const asset = assets.find((item) => item.id === clip.assetId);
      if (!asset) continue;
      const buffer = this.buffers.get(asset.id);
      if (!buffer) {
        void this.prepare(asset);
        continue;
      }
      const offset = clip.in + (time - clip.start) * clip.speed;
      if (offset >= buffer.duration) continue;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.playbackRate.value = clip.speed;
      gain.gain.value = clip.volume ?? 1;
      source.connect(gain).connect(master);
      source.start(
        0,
        offset,
        Math.min(0.06 * clip.speed, buffer.duration - offset),
      );
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
    }
  }
  destroy() {
    this.stop();
    void this.context?.close();
    this.context = undefined;
    this.videos.clear();
    this.buffers.clear();
  }
}
