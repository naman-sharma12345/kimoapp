/// <reference lib="webworker" />
import { waveformPeaks } from './peaks';

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = async (
  event: MessageEvent<
    { kind: 'image'; file: File } | { kind: 'peaks'; samples: Float32Array }
  >,
) => {
  try {
    if (event.data.kind === 'peaks') {
      const result = waveformPeaks(event.data.samples);
      scope.postMessage(result, [
        result.waveform.buffer,
        result.timeline.buffer,
      ]);
      return;
    }
    const bitmap = await createImageBitmap(event.data.file);
    const scale = Math.min(1, 160 / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale)),
    );
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No canvas context');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const result = {
      width: bitmap.width,
      height: bitmap.height,
      thumbnail: await canvas.convertToBlob({
        type: 'image/jpeg',
        quality: 0.8,
      }),
    };
    bitmap.close();
    scope.postMessage(result);
  } catch {
    scope.postMessage({ failed: true });
  }
};
