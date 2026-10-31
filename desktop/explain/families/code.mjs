// code: a monospaced code card (Geist Mono) with syntax colouring (tiny
// tokenizer for js / py / bash / json); lines type on in sync with the
// speech (props.items[i].t per line); the current line is highlighted.
import { drawPanel, visualAlpha, activeIndex, text, scale, panelLayout, fitPanel, withAlpha, clamp01, roundRectPath } from './common.mjs';
import { panelOf } from '../panel.mjs';

const KW = {
  js: /^(const|let|var|function|return|if|else|for|while|import|from|export|await|async|new|class|true|false|null)$/,
  py: /^(def|return|if|elif|else|for|while|import|from|as|class|True|False|None|print|with|in|and|or|not)$/,
  bash: /^(npm|npx|pnpm|yarn|git|cd|ls|mkdir|rm|cp|mv|sudo|apt|brew|pip|python|node|curl|echo|export|install|run)$/,
  json: /^(true|false|null)$/,
};
/** Tokens [{s, k}] where k is kw | str | num | com | punc | id. */
export function tokenize(line, lang = 'js') {
  const out = [];
  const re = /(\s+)|(#.*$|\/\/.*$)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`[^`]*`?)|(\d+(?:\.\d+)?)|([A-Za-z_$][\w$-]*)|(.)/g;
  for (const m of String(line).matchAll(re)) {
    const [s, ws, com, str, num, id] = m;
    const k = ws ? 'ws' : com && (lang === 'py' || lang === 'bash' ? s.startsWith('#') : s.startsWith('//')) ? 'com' : str ? 'str' : num ? 'num' : id ? ((KW[lang] ?? KW.js).test(id) ? 'kw' : 'id') : 'punc';
    out.push({ s, k: com && k !== 'com' ? 'punc' : k });
  }
  return out;
}
export default {
  kind: 'ex_code',
  label: 'Code',
  defaults: { dur: 4 },
  layout(canvas, props, env) {
    const P0 = panelOf(canvas, props);
    const { pad, body } = scale(P0, canvas);
    const lines = (props.items ?? String(props.code ?? '').split('\n').map((text) => ({ text }))).slice(0, 10);
    const mono = env.theme.fonts.mono ?? { family: 'Geist Mono', weight: 600 };
    const P = P0;
    let size = body * 0.9;
    const longest = lines.reduce((m, l) => Math.max(m, [...String(l.text)].length), 1);
    for (let i = 0; i < 12 && env.measure('M'.repeat(longest), mono, size) > P.w - 2 * pad - size * 2; i++) size *= 0.92;
    const lineH = Math.min(size * 1.7, (P.h - pad * 2 - size * 1.6) / Math.max(1, lines.length));
    const Pf = props.mode === 'full' || props.mode === 'pip' ? P : fitPanel(P, pad * 2 + size * 1.6 + lineH * lines.length, props.mode);
    return panelLayout(Pf, canvas, { pad, size, lineH, mono, lines, cw: env.measure('M', mono, size), overflow: env.measure('M'.repeat(longest), mono, size) > P.w - 2 * pad - size * 2 });
  },
  draw(ctx, t, props, L, env) {
    const { fps, dur, theme: th, canvas } = env;
    const a = visualAlpha(t, dur, fps);
    const colours = { kw: th.colors.accent, str: '#9BE38B', num: th.colors.accent2 ?? '#FFC23D', com: withAlpha(th.colors.text, 0.45), punc: withAlpha(th.colors.text, 0.75), id: th.colors.text, ws: th.colors.text };
    ctx.save();
    ctx.globalAlpha = a;
    drawPanel(ctx, L.P, th, canvas, { full: props.mode === 'full' || props.mode === 'pip' });
    // window dots
    ['#FF5F57', '#FEBC2E', '#28C840'].forEach((c, i) => {
      ctx.beginPath();
      ctx.arc(L.P.x + L.pad + i * L.size, L.P.y + L.pad * 0.8, L.size * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
    });
    const k = activeIndex(L.lines, t);
    const top = L.P.y + L.pad + L.size * 1.6;
    L.lines.forEach((ln, i) => {
      const t0 = ln.t ?? i * 0.4;
      if (t < t0) return;
      const chars = [...String(ln.text)];
      // type on at ~40 chars/s, never slower than the line's own span
      const shown = Math.min(chars.length, Math.ceil((t - t0) * 40 + 1));
      const y = top + i * L.lineH;
      if (i === k) {
        roundRectPath(ctx, L.P.x + L.pad * 0.5, y - L.lineH * 0.2, L.P.w - L.pad, L.lineH, 6);
        ctx.fillStyle = withAlpha(th.colors.accent, 0.14);
        ctx.fill();
      }
      let x = L.P.x + L.pad;
      let used = 0;
      for (const tok of tokenize(chars.join(''), props.lang)) {
        if (used >= shown) break;
        const part = [...tok.s].slice(0, shown - used).join('');
        used += [...tok.s].length;
        text(ctx, part, x, y + L.size * 0.62, L.mono, L.size, colours[tok.k]);
        x += L.cw * [...part].length;
      }
      if (i === k && shown < chars.length + 1 && Math.floor(t * 2.5) % 2 === 0) {
        ctx.fillStyle = th.colors.accent;
        ctx.fillRect(x + 2, y - L.size * 0.1, L.size * 0.08, L.size * 0.9 * clamp01(1));
      }
    });
    ctx.restore();
  },
};
