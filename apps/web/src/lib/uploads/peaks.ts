export function waveformPeaks(samples: Float32Array, sampleRate = 8000) {
  const waveform = new Float32Array(64);
  const step = Math.max(1, Math.round(sampleRate / 100));
  const timeline = new Float32Array(Math.ceil(samples.length / step));
  for (let index = 0; index < samples.length; index++) {
    const peak = Math.min(1, Math.abs(samples[index] ?? 0));
    const bin = Math.min(
      63,
      Math.floor((index * 64) / Math.max(1, samples.length)),
    );
    waveform[bin] = Math.max(waveform[bin] ?? 0, peak);
    const frame = Math.floor(index / step);
    timeline[frame] = Math.max(timeline[frame] ?? 0, peak);
  }
  return { waveform, timeline };
}
