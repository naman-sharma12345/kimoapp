#!/usr/bin/env node
// A fake FFmpeg for tests: never touches real media, real GPUs, or a real
// FFmpeg binary. Controlled entirely by environment variables so each test
// can mock a different vendor's ffmpeg -encoders output and trial-encode
// result without needing that hardware.
//
// FAKE_FFMPEG_ENCODERS: comma-separated encoder names this "build" lists in
//   `ffmpeg -encoders` (e.g. "h264_nvenc,h264_qsv").
// FAKE_FFMPEG_WORKING: comma-separated encoder names whose trial encode (or
//   real encode) succeeds (exit 0); any encoder not in this list fails.
const args = process.argv.slice(2);
const listed = (process.env.FAKE_FFMPEG_ENCODERS || '').split(',').filter(Boolean);
const working = new Set((process.env.FAKE_FFMPEG_WORKING || '').split(',').filter(Boolean));

if (args.includes('-encoders')) {
  const lines = [
    'Encoders:',
    ' V..... = Video',
    ' -------',
  ];
  for (const enc of listed)
    lines.push(` V..... ${enc}              fake encoder for tests (codec h264)`);
  process.stdout.write(lines.join('\n') + '\n');
  process.exit(0);
}

const cvIndex = args.indexOf('-c:v');
const encoder = cvIndex >= 0 ? args[cvIndex + 1] : null;
if (!encoder) {
  // -version or anything else this fake doesn't need to understand.
  process.stdout.write('fake ffmpeg\n');
  process.exit(0);
}
if (working.has(encoder)) process.exit(0);
process.stderr.write(`fake ffmpeg: ${encoder} not available in this mock\n`);
process.exit(1);
