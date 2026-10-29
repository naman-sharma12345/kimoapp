/** High-quality hardware encoding; the timeline/compositor remains unchanged. */
export function videoEncoderArgs(encoder = 'libx264', duration = 0) {
  if (encoder === 'h264_nvenc')
    return [
      '-c:v',
      encoder,
      '-preset',
      'p6',
      '-tune',
      'hq',
      '-rc',
      'vbr',
      '-cq',
      '18',
      '-multipass',
      'qres',
      '-spatial-aq',
      '1',
      '-temporal-aq',
      '1',
      '-rc-lookahead',
      '20',
      '-surfaces',
      '32',
      '-no-scenecut',
      '1',
      '-forced-idr',
      '1',
    ];
  if (encoder === 'h264_qsv')
    return [
      '-c:v',
      encoder,
      '-preset',
      'slow',
      '-look_ahead',
      '1',
      '-look_ahead_depth',
      '20',
      '-async_depth',
      '2',
      '-forced_idr',
      '1',
    ];
  if (encoder === 'h264_amf')
    return [
      '-c:v',
      encoder,
      '-usage',
      'transcoding',
      '-quality',
      'quality',
      '-rc',
      'vbr_peak',
      '-vbaq',
      '1',
    ];
  if (encoder === 'libx264')
    return ['-c:v', encoder, '-preset', duration > 600 ? 'medium' : 'slow'];
  throw new Error(`Unsupported master encoder: ${encoder}`);
}
export function encodingAttempts(preferred, measured = {}) {
  if (!preferred || preferred === 'libx264')
    return [{ encoder: 'libx264', hardwareDecode: false }];
  videoEncoderArgs(preferred); // Validate before spawning anything.
  const plans = [];
  // The app's normal intermediate is 8-bit H.264. Keep its decode and encode
  // surfaces on NVDEC/NVENC, avoiding a CPU decode and GPU readback/upload.
  if (
    preferred === 'h264_nvenc' &&
    measured.vcodec === 'h264' &&
    measured.pix_fmt === 'yuv420p'
  )
    plans.push({ encoder: preferred, hardwareDecode: true });
  plans.push(
    { encoder: preferred, hardwareDecode: false },
    { encoder: 'libx264', hardwareDecode: false },
  );
  return plans;
}
export async function encodeWithFallback({
  preferred,
  measured,
  attempt,
  signal,
  onFallback,
}) {
  const plans = encodingAttempts(preferred, measured);
  for (let i = 0; i < plans.length; i++) {
    if (signal?.aborted) throw new Error('cancelled');
    try {
      const result = await attempt(plans[i]);
      return {
        ...result,
        ...plans[i],
        cpuFallback: Boolean(
          preferred &&
          plans[i].encoder === 'libx264' &&
          preferred !== 'libx264',
        ),
      };
    } catch (error) {
      if (signal?.aborted || i === plans.length - 1) throw error;
      onFallback?.({ from: plans[i], to: plans[i + 1], error });
    }
  }
}
