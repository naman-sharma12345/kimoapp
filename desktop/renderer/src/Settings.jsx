import { useState } from 'react';
import { RefreshCw, Download, FileText, RotateCw } from 'lucide-react';
import { Button } from '@web/components/ui/button';
import { Progress } from '@web/components/ui/progress';
import { kimo } from './lib.js';

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
          <Row title="engine check" detail="look for ffmpeg, whisper and the gpu again">
            <Button size="sm" variant="ghost" icon={RefreshCw} loading={checking} onClick={recheck}>
              check again
            </Button>
          </Row>
        </div>

        <div className="desk-section-label">privacy</div>
        <p className="desk-fine desk-privacy">
          your footage stays on this pc. ai edits send transcripts and a few small frames for planning and checking. subject effects upload a downscaled (≤720p, silent) copy of the processed segment to meta via kimo, and it is deleted after. no sign-in is needed.
        </p>
      </section>
    </div>
  );
}
