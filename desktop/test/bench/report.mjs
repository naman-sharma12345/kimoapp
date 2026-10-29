import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { command, filterPath } from './io.mjs';

export const escapeHtml = (text) =>
  String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
export async function reviewMedia({
  ffmpeg,
  output,
  directory,
  duration,
  font,
}) {
  const text = `drawtext=${font ? `fontfile='${filterPath(font)}':` : ''}text='%{pts\\:hms}':fontsize=16:fontcolor=white:box=1:boxcolor=black:x=4:y=h-th-4`;
  await command(ffmpeg, [
    '-nostdin',
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    output,
    '-t',
    '1',
    '-vf',
    `fps=10,scale=240:-2,${text},tile=5x2:padding=4:margin=4`,
    '-frames:v',
    '1',
    '-q:v',
    '3',
    join(directory, 'hook.jpg'),
  ]);
  await command(ffmpeg, [
    '-nostdin',
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    output,
    '-vf',
    `fps=1,scale=192:-2,${text},tile=6x${Math.ceil(duration / 6)}:padding=4:margin=4`,
    '-frames:v',
    '1',
    '-q:v',
    '3',
    join(directory, 'sheet.jpg'),
  ]);
  await command(ffmpeg, [
    '-nostdin',
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    output,
    '-t',
    '10',
    '-vf',
    'scale=trunc(iw/4)*2:trunc(ih/4)*2',
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '23',
    '-c:a',
    'aac',
    '-movflags',
    '+faststart',
    join(directory, 'strip.mp4'),
  ]);
}
export function reviewHtml({ title, metrics, ops }) {
  const e = escapeHtml;
  const checks =
    metrics.checks ??
    Object.entries(metrics.values)
      .filter(
        ([, v]) => (!Array.isArray(v) && typeof v !== 'object') || v === null,
      )
      .map(([name, value]) => ({
        name,
        value,
        status: value == null ? 'unavailable' : 'measured',
        target: {},
      }));
  const rows = checks
    .map(({ name, value, status, target, estimated }) => {
      const v =
        value === null
          ? 'unavailable'
          : typeof value === 'number'
            ? +value.toFixed(4)
            : value;
      const band = Object.hasOwn(target, 'equals')
        ? String(target.equals)
        : [
            target.min != null ? `>= ${target.min}` : '',
            target.max != null ? `<= ${target.max}` : '',
            target.maxExclusive != null ? `< ${target.maxExclusive}` : '',
          ]
            .filter(Boolean)
            .join(', ');
      return `<tr><th scope="row">${e(name)}${estimated ? ' (estimate)' : ''}</th><td>${e(v)}</td><td>${e(band)}</td><td>${e(status)}</td></tr>`;
    })
    .join('');
  const duration = metrics.values.duration_s;
  const lanes = ['cut', 'punch', 'graphic', 'caption', 'sfx', 'music'];
  const timeline = lanes
    .map(
      (kind) =>
        `<div class="lane"><span>${kind}</span><div class="track">${metrics.events
          .filter((x) => x.kind === kind)
          .map(
            (x) =>
              `<button class="${kind}" style="left:${(100 * x.start) / duration}%;width:${Math.max(0.2, (100 * (x.end - x.start)) / duration)}%" data-time="${x.start}" title="${e(`${x.id} ${x.start.toFixed(2)}-${x.end.toFixed(2)} ${x.text ?? ''}`)}" aria-label="${e(`${kind} at ${x.start.toFixed(2)} seconds`)}"></button>`,
          )
          .join('')}</div></div>`,
    )
    .join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title><style>
  :root{color-scheme:dark;--ink-0:#080809;--ink-1:#0e0e0f;--ink-2:#151516;--cream:#f5f1e7;--line:rgb(245 241 231 / .12);--muted:rgb(245 241 231 / .6)}*{box-sizing:border-box}body{margin:0;background:var(--ink-0);color:var(--cream);font:15px/1.5 system-ui}main{max-width:1080px;margin:auto;padding:32px 24px}h1,h2{font-weight:500}h1{font-size:28px}h2{font-size:20px;margin-top:32px}p{color:var(--muted)}video{display:block;width:100%;max-height:640px;background:var(--ink-1)}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:8px 12px;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}th{font-weight:400}td{font-family:ui-monospace,monospace}.lane{display:flex;gap:12px;margin:8px 0}.lane>span{width:72px;flex:none}.track{position:relative;flex:1;min-height:28px;background:var(--ink-2)}button{position:absolute;top:2px;height:24px;min-width:2px;border:1px solid var(--line);border-radius:4px;cursor:pointer}button:focus-visible{outline:2px solid var(--cream);outline-offset:2px}.cut{background:#3a3833}.punch{background:#383338}.graphic{background:#36343a}.caption{background:#2f3036}.sfx{background:#38353a}.music{background:#33382f}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--ink-1);padding:16px;font:12px/1.5 ui-monospace,monospace}details{border-top:1px solid var(--line);padding:12px 0}summary{cursor:pointer}a{color:var(--cream)}
  table{table-layout:fixed}th,td,summary{overflow-wrap:anywhere}.track{min-width:0}
  </style><main><h1>${e(title)}</h1><p>Creator Score ${metrics.creator.score}/100. Unavailable applicable metrics score zero. Estimates require visual review.</p><video controls preload="metadata" src="final.mp4"></video><p><a href="sheet.jpg">Contact sheet</a> · <a href="strip.mp4">First ten seconds</a> · <a href="project.kimo.json">Saved project</a> · <a href="metrics.json">Full measurement evidence</a></p><h2>Edit decisions</h2><p>Select a block to seek. Times come from the saved project.</p>${timeline}<h2>Metrics</h2><table><thead><tr><th>Metric</th><th>Value</th><th>Target</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table><h2>Measurement limits</h2><pre>${e(JSON.stringify(metrics.evidence, null, 2))}</pre><h2>Operations</h2>${ops.map((o) => `<details><summary>${e(`${o.phase ?? o.t} ${o.tool ?? ''} ${o.title ?? o.text ?? ''}`)}</summary><pre>${e(JSON.stringify(o, null, 2))}</pre></details>`).join('')}</main><script>document.querySelectorAll('[data-time]').forEach(b=>b.addEventListener('click',()=>{document.querySelector('video').currentTime=Number(b.dataset.time)}));</script></html>`;
}
export async function writeReview(directory, data) {
  await writeFile(join(directory, 'review.html'), reviewHtml(data));
}
export function summaryTable(rows) {
  return (
    '| Clip | Aspect | Mode | Status | Score | First speech | Dead air | Repeats | Match coverage | Jitter | Delivery |\n|---|---|---|---|---:|---:|---:|---:|---:|---:|---|\n' +
    rows
      .map((r) => {
        const m = r.metrics?.values ?? {},
          c = r.metrics?.creator;
        const f = (v, n = 2) => (typeof v === 'number' ? v.toFixed(n) : 'n/a');
        return `| ${r.id} | ${r.aspect} | ${r.mode} | ${r.error ? 'FAILED: ' + r.error.replaceAll('|', '/').replaceAll('\n', ' ').slice(0, 180) : 'measured'} | ${c?.score ?? 'n/a'} | ${f(m.first_speech_s)} | ${f(m.dead_air_ratio == null ? null : m.dead_air_ratio * 100)}% | ${m.repeated_frames ?? 'n/a'} | ${f(m.frame_match_coverage == null ? null : m.frame_match_coverage * 100)}% | ${f(m.jitter_px)} | ${m.delivery_ok ?? 'n/a'} |`;
      })
      .join('\n') +
    '\n'
  );
}
