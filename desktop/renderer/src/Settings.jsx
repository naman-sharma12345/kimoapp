import { useEffect, useState } from 'react';
import { RefreshCw, Download, FileText, RotateCw, KeyRound, LogIn, LogOut } from 'lucide-react';
import { Button } from '@web/components/ui/button';
import { Progress } from '@web/components/ui/progress';
import { kimo, cleanErr } from './lib.js';

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI', model: 'gpt-4.1-mini' },
  { value: 'anthropic', label: 'Anthropic', model: 'claude-sonnet-4-5' },
  { value: 'gemini', label: 'Gemini', model: 'gemini-2.5-flash' },
  { value: 'meta', label: 'Meta (also unlocks subject effects)', model: 'muse-spark-1.3' },
  { value: 'groq', label: 'Groq', model: 'llama-3.3-70b-versatile' },
  { value: 'openrouter', label: 'OpenRouter', model: 'openai/gpt-4.1-mini' },
  { value: 'custom', label: 'Custom (OpenAI-compatible)', model: '' },
];

/** AI access: kimo-team sign-in, or the user's own key (held in memory only, never saved). */
export function AiAccess({ guard }) {
  const [access, setAccess] = useState(null);
  const [form, setForm] = useState({ provider: 'openai', key: '', model: PROVIDERS[0].model, baseUrl: '' });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => {
    kimo.authStatus?.().then(setAccess).catch(() => undefined);
  }, []);
  const act = (label, fn) =>
    guard(async () => {
      setBusy(label);
      setNote('');
      try {
        setAccess(await fn());
      } catch (e) {
        setNote(cleanErr(e));
      } finally {
        setBusy('');
      }
    });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v, ...(k === 'provider' ? { model: PROVIDERS.find((p) => p.value === v)?.model ?? '' } : {}) }));
  return (
    <>
      <div className="desk-section-label">ai access</div>
      <p className="desk-fine">
        ai edits, explainer visuals and subject effects need an ai key. kimo&apos;s own key is reserved for the kimo team; bring your own and it stays in this app&apos;s memory only, never saved, and is gone when you quit. captions, manual edits and exports work without any key.
      </p>
      <div className="desk-set-group">
        <Row ok={Boolean(access?.byok)} title="your own key" detail={access?.byok ? `${access.byok.provider} · ${access.byok.model} · …${access.byok.last4} (memory only)` : 'not set'}>
          {access?.byok ? (
            <Button size="sm" variant="ghost" onClick={act('clear', () => kimo.clearKey())}>
              forget key
            </Button>
          ) : null}
        </Row>
        {!access?.byok ? (
          <div className="desk-byok">
            <label className="desk-select">
              <select value={form.provider} onChange={(e) => set('provider', e.target.value)} aria-label="ai provider">
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <input className="ui-input" type="password" autoComplete="off" spellCheck={false} placeholder="paste your api key" value={form.key} onChange={(e) => set('key', e.target.value)} aria-label="api key" />
            <input className="ui-input" placeholder="model" value={form.model} onChange={(e) => set('model', e.target.value)} aria-label="model" />
            {form.provider === 'custom' ? <input className="ui-input" placeholder="https://… base url" value={form.baseUrl} onChange={(e) => set('baseUrl', e.target.value)} aria-label="base url" /> : null}
            <Button size="sm" variant="primary" icon={KeyRound} loading={busy === 'key'} onClick={act('key', async () => {
              const r = await kimo.setKey(form);
              setForm((f) => ({ ...f, key: '' }));
              return r;
            })}>
              use this key
            </Button>
          </div>
        ) : null}
        <Row ok={access?.owner} title="kimo team sign-in" detail={access?.owner ? `signed in${access.subject ? ` as ${access.subject}` : ''}` : 'only for the kimo team; opens your browser'}>
          {access?.owner ? (
            <Button size="sm" variant="ghost" icon={LogOut} loading={busy === 'out'} onClick={act('out', () => kimo.signOut())}>
              sign out
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" icon={LogIn} loading={busy === 'github'} onClick={act('github', () => kimo.signIn('github'))}>
                github
              </Button>
              <Button size="sm" variant="ghost" icon={LogIn} loading={busy === 'google'} onClick={act('google', () => kimo.signIn('google'))}>
                google
              </Button>
            </>
          )}
        </Row>
      </div>
      {note ? <p className="desk-fine desk-ai-note" role="status">{note}</p> : null}
    </>
  );
}

function Row({ ok, title, detail, children }) {
  return (
    <div className="desk-set-row">
      <span className="desk-set-dot" data-ok={ok === undefined ? undefined : ok ? 'yes' : 'no'} />
      <div className="desk-set-text">
        <b>{title}</b>
        <span>{detail}</span>
      </div>
      <div className="desk-set-act">{children}</div>
    </div>
  );
}

export function Settings({ status: s, refresh, model, downloadModel, update, guard }) {
  const [checking, setChecking] = useState(false);
  const [cache,setCache]=useState(null),[cleaning,setCleaning]=useState(false);
  useEffect(()=>{kimo.cacheInfo?.().then(setCache).catch(()=>{});},[]);
  const recheck = guard(async () => {
    setChecking(true);
    try {
      await refresh();
    } finally {
      setChecking(false);
    }
  });
  const presets = Object.values(s?.presets ?? {});
  return (
    <div className="desk-settings">
      <section className="studio-panel desk-set-panel">
        <h1 className="desk-display desk-display-sm">
          settings<em>.</em>
        </h1>
        <p className="desk-lede">kimo runs the real v6 engine, ffmpeg and whisper on this pc. only ai planning and subject effects talk to the network.</p>

        <div className="desk-section-label">engine</div>
        <div className="desk-set-group">
          <Row ok={s?.kimo} title="kimo v6 engine" detail={s?.kimo ? 'ready' : 'missing: reinstall kimo'} />
          <Row ok={Boolean(s?.ffmpeg)} title="ffmpeg" detail={s?.ffmpeg ? String(s.ffmpeg).slice(0, 60) : 'missing'} />
          <Row ok={Boolean(s?.gpu)} title="gpu encode" detail={s?.gpu ? String(s.gpu).replace('h264_', '').toUpperCase() : 'none found, cpu encode'} />
          <Row ok={Boolean(s?.whisper && s?.model)} title="offline captions" detail={s?.model ? 'whisper model downloaded' : 'needs the whisper model (≈190 MB, one time)'}>
            {model ? (
              <div className="desk-set-progress">
                <Progress value={model.f} running label={model.label} thin />
                <span>{Math.round(model.f * 100)}%</span>
              </div>
            ) : !s?.model && s?.whisper ? (
              <Button size="sm" variant="primary" icon={Download} onClick={downloadModel}>
                download
              </Button>
            ) : null}
          </Row>
        </div>

        <AiAccess guard={guard} />

        <div className="desk-section-label">formats</div>
        <div className="desk-formats">
          {presets.map((p) => (
            <div key={p.label} className="desk-format">
              <b>{p.label}</b>
              <span className="mono">
                {p.width}×{p.height}
                {p.mbps ? ` · ${p.mbps} Mbps` : ''}
              </span>
            </div>
          ))}
        </div>

        <div className="desk-section-label">app</div>
        <div className="desk-set-group">
          <Row ok={!update ? undefined : true} title={`kimo ${s ? `v${s.version}` : ''}`} detail={update ? `kimo ${update.version} is downloaded and ready` : 'updates download in the background and install on restart'}>
            {update ? (
              <Button size="sm" variant="primary" icon={RotateCw} onClick={() => kimo.installUpdate()}>
                restart to update
              </Button>
            ) : null}
          </Row>
          <Row title="log file" detail="what kimo did, for bug reports">
            <Button size="sm" icon={FileText} onClick={() => kimo.openLog()}>
              open log
            </Button>
          </Row>
          <Row title="cache" detail={cache?`${(cache.bytes/1024/1024).toFixed(1)} MB · saved projects and input copies are kept`:'calculating cache size'}>
            <Button size="sm" variant="ghost" loading={cleaning} onClick={guard(async()=>{setCleaning(true);try{setCache(await kimo.cleanCache());}finally{setCleaning(false);}})}>clean cache</Button>
          </Row>
          <Row title="engine check" detail="look for ffmpeg, whisper and the gpu again">
            <Button size="sm" variant="ghost" icon={RefreshCw} loading={checking} onClick={recheck}>
              check again
            </Button>
          </Row>
        </div>

        <div className="desk-section-label">privacy</div>
        <p className="desk-fine desk-privacy">
          your footage stays on this pc. ai edits send transcripts and a few small frames for planning and checking. subject effects upload a downscaled (≤720p, silent) copy of the processed segment to meta via kimo, and it is deleted after. your own ai key is sent with each ai call over https and never stored, logged or written to disk.
        </p>
      </section>
    </div>
  );
}
