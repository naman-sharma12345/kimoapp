#!/usr/bin/env node
// Captures the exact argv FFmpeg would have been called with, writes it to
// CAPTURE_OUT as JSON, and exits 0 without touching any real media. Used to
// assert on exact command-line construction (preset, bitrate, etc.) without
// spawning a real encode.
import { writeFileSync, appendFileSync, existsSync } from 'node:fs';
const out = process.env.CAPTURE_OUT;
const line = JSON.stringify(process.argv.slice(2)) + '\n';
if (existsSync(out)) appendFileSync(out, line);
else writeFileSync(out, line);
// -progress pipe:1 readers expect at least an out_time_us line to see 100%,
// and some callers check the output file exists; write a tiny stub file if
// an output path is present as the final arg.
const outputPath = process.argv.at(-1);
try {
  if (outputPath && !outputPath.startsWith('-') && outputPath !== 'pipe:1' && outputPath !== '-')
    writeFileSync(outputPath, Buffer.from([0]));
} catch {
  /* best effort */
}
process.stdout.write('out_time_us=1000000\n');
process.exit(0);
