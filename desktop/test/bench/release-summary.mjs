import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const input = resolve(process.argv[2]),
  output = resolve(process.argv[3]);
const rows = [];
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (e.name === 'summary.json')
      rows.push(JSON.parse(await readFile(p, 'utf8')));
  }
}
await walk(input);
rows.sort((a, b) =>
  `${a.clip}/${a.template}`.localeCompare(`${b.clip}/${b.template}`),
);
await mkdir(output, { recursive: true });
const seen = new Set(rows.map((r) => r.template));
const fmt = (v, n = 2) =>
  typeof v === 'number'
    ? v.toFixed(n)
    : v === true
      ? 'pass'
      : v === false
        ? 'fail'
        : 'unavailable';
let report =
  '# v0.4.0 creator qualification\n\nSaved deterministic-plan replay on exact prepared raw-v2 media. No paid AI/SAM calls.\nNatural-footage frame ambiguity remains unavailable; unknowns never count as green.\n\n';
report +=
  '| Clip | Template | Score | First speech s | Dead air | Repeats | Frame coverage | Jitter px | True peak | Safe captions | Critical gates |\n|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|\n';
for (const r of rows) {
  const m = r.metrics;
  report += `| ${r.clip} | ${r.template} | ${r.score} | ${fmt(m.first_speech_s)} | ${fmt(m.dead_air_ratio)} | ${fmt(m.repeated_frames, 0)} | ${fmt(m.frame_match_coverage)} | ${fmt(m.jitter_px, 4)} | ${fmt(m.true_peak)} | ${fmt(m.caption_safe)} | ${r.gates.red ? 'red' : r.gates.unverified ? 'unverified' : 'green'} |\n`;
}
report +=
  '\nRegression gate: each template must stay within 3 points of its measured committed release baseline. Initial baseline collection is explicitly separate from this comparison.\n';
await writeFile(join(output, 'RESULTS.md'), report);
await writeFile(
  join(output, 'release-baseline.json'),
  JSON.stringify(
    {
      version: 1,
      commit: process.env.GITHUB_SHA,
      scope:
        'Actual hosted deterministic-plan replay, modern measurement v7 with hash-attested grade references and ASS-clock overlay masks, fixed prepared raw-v2 bytes; not provider adherence.',
      rows,
    },
    null,
    2,
  ) + '\n',
);
if (rows.length !== 9 || seen.size !== 9)
  throw new Error(
    `Incomplete qualification: ${rows.length}/9 rows, ${seen.size}/9 templates`,
  );
console.log(report);
