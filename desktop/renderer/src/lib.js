export const kimo = window.kimo;
export const fmtTime = (s) => {
  s = Math.max(0, s || 0);
  return (s >= 3600 ? `${Math.floor(s / 3600)}:` : '') + `${Math.floor((s % 3600) / 60)}`.padStart(s >= 3600 ? 2 : 1, '0') + ':' + `${Math.floor(s % 60)}`.padStart(2, '0');
};
export const fmtTc = (s) => `${fmtTime(s || 0)}.${Math.floor(((s || 0) % 1) * 10)}`;
export const fmtBytes = (b) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round((b || 0) / 1e6))} MB`);
export const fmtMs = (ms) => (ms >= 60_000 ? `${Math.floor(ms / 60_000)}m${String(Math.round((ms % 60_000) / 1000)).padStart(2, '0')}s` : ms > 900 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`);
export const fmtEta = (eta, estimated) => (eta == null || eta <= 0 ? '' : `${estimated ? '~' : ''}${eta < 60 ? `${Math.ceil(eta)} s` : `${Math.floor(eta / 60)} min ${Math.round(eta % 60)} s`} left`);
// kimo.mediaUrl exists only in the browser test harness (src/dev/mock-kimo.js)
export const media = (p) => (window.kimo?.mediaUrl ? window.kimo.mediaUrl(p) : `kimo-media://f/?p=${encodeURIComponent(p)}`);
export const base = (p) => String(p || '').split(/[\\/]/).pop();
export const STATUS = { queued: 'queued', running: 'editing live', done: 'ready', failed: 'failed', stopped: 'stopped' };
export const cleanErr = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
export const isTyping = () => ['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
export const busy = (p) => ['running', 'queued'].includes(p?.status);
export const SAM_EFFECTS = [
  { value: 'reframe', label: 'follow subject', hint: 'smart reframe to the format' },
  { value: 'text_behind', label: 'text behind', hint: 'a word tucked behind the subject' },
  { value: 'bg_blur', label: 'background blur', hint: 'soft lens blur behind them' },
  { value: 'bg_color', label: 'background colour', hint: 'flat colour behind them' },
  { value: 'bg_image', label: 'background image', hint: 'your image behind them' },
  { value: 'cutout', label: 'subject cutout', hint: 'transparent .mov' },
  { value: 'redact', label: 'blur object', hint: 'faces, plates, logos' },
];
