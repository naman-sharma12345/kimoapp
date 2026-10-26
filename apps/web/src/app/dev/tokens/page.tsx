import { colors } from './catalog';
import { MotionDemos } from './motion-demos';
import { Ready } from './ready';

const sample = 'the quick cut jumps over the lazy fade';
const scale = [
  ['t-11', '11 / 16 / +0.06em / 500', 'text-t11'],
  ['t-12', '12 / 16 / 0 / 400', 'text-t12'],
  ['t-13', '13 / 20 / 0 / 400', 'text-t13'],
  ['t-15', '15 / 22 / −0.005em / 500', 'text-t15'],
  ['t-17', '17 / 26 / −0.01em / 400', 'text-t17'],
  ['t-20', '20 / 28 / −0.01em / 500', 'text-t20'],
  ['t-28', '28 / 34 / −0.02em / 500', 'text-t28'],
  [
    't-display',
    'clamp(44px, 6.2vw, 88px) / 0.98 / −0.035em / 400',
    'text-display',
  ],
] as const;
function SectionTitle({
  id,
  title,
  note,
}: {
  id: string;
  title: string;
  note: string;
}) {
  return (
    <div className="section-label">
      <h2 id={id} className="text-t15">
        {title}
      </h2>
      <span className="font-mono text-t12 text-cream-60">{note}</span>
    </div>
  );
}
export default function TokensPage() {
  return (
    <main id="main" className="token-page" data-ready="false">
      <Ready />
      <header className="token-header">
        <div>
          <p className="text-t11 text-cream-60">kimo web / phase 0</p>
          <h1 className="mt-3 text-t28">the foundation</h1>
          <p className="mt-3 text-t13 text-cream-60">
            colour, type, shape and time. the shared language of every cut.
          </p>
        </div>
        <p className="font-mono text-t12 text-cream-60">
          design tokens
          <br />
          v0.0 / dark canvas
        </p>
      </header>
      <section className="token-section" aria-labelledby="colours">
        <SectionTitle
          id="colours"
          title="colour"
          note={`${colors.length} tokens`}
        />
        <div className="swatch-grid">
          {colors.map(([name, value]) => (
            <figure key={name}>
              <div
                className="swatch"
                style={{ background: `var(--${name})` }}
                data-token={name}
              />
              <figcaption className="mt-3 font-mono text-t12">
                <div>{name}</div>
                <div className="mt-1 break-words text-cream-60">{value}</div>
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="mt-6 text-t12 text-cream-60">
          orange marks the primary action or the AI at work. swatches here are
          reference specimens.
        </p>
      </section>
      <section className="token-section" aria-labelledby="type">
        <SectionTitle id="type" title="type" note="Geist Sans / 400, 500" />
        {scale.map(([name, detail, className]) => (
          <div key={name} className="type-row">
            <p className="mb-3 font-mono text-t12 text-cream-60">
              {name} · {detail}
            </p>
            <p className={className}>{sample}</p>
          </div>
        ))}
        <div className="type-row">
          <p className="mb-3 font-mono text-t12 text-cream-60">
            Geist Mono · tabular numerals
          </p>
          <p className="font-mono text-t20">00:01:24:08</p>
        </div>
        <div className="type-row">
          <p className="mb-3 font-mono text-t12 text-cream-60">
            Instrument Serif · italic 400 · headline specimen
          </p>
          <p className="font-display text-t28">{sample}</p>
        </div>
      </section>
      <section className="token-section" aria-labelledby="shape">
        <SectionTitle id="shape" title="radius" note="a shape for each role" />
        <div className="specimen-row">
          {['4', '6', '8', '12', '20', 'pill'].map((radius) => (
            <div className="specimen" key={radius}>
              <div
                className="radius-specimen"
                style={{ borderRadius: `var(--r-${radius})` }}
              />
              <p className="font-mono text-t12 text-cream-60">r-{radius}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="token-section" aria-labelledby="controls">
        <SectionTitle
          id="controls"
          title="control height"
          note="24 / 28 / 32 / 40 / 48"
        />
        <div className="specimen-row">
          {(['xs', 'sm', 'md', 'lg', 'send'] as const).map((size) => (
            <div className="specimen" key={size}>
              <div
                className="control-specimen"
                style={{ height: `var(--control-${size})` }}
              >
                {size}
              </div>
              <p className="font-mono text-t12 text-cream-60">control-{size}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="token-section" aria-labelledby="space">
        <SectionTitle id="space" title="spacing" note="one scale, in pixels" />
        <div className="specimen-row">
          {[2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128].map(
            (size) => (
              <div className="specimen" key={size}>
                <div
                  className="bg-ink-4"
                  style={{
                    width: `var(--space-${size})`,
                    height: 'var(--space-8)',
                  }}
                />
                <p className="font-mono text-t12 text-cream-60">{size}</p>
              </div>
            ),
          )}
        </div>
      </section>
      <section className="token-section" aria-labelledby="motion">
        <SectionTitle
          id="motion"
          title="motion"
          note="precise, never restless"
        />
        <MotionDemos />
      </section>
      <section className="token-section" aria-labelledby="elevation">
        <SectionTitle
          id="elevation"
          title="elevation & focus"
          note="the only permitted shadows"
        />
        <div className="specimen-row">
          <div className="rounded-r12 bg-ink-1 p-6 shadow-pop">
            popover elevation
          </div>
          <div className="rounded-r12 bg-ink-0 p-6 shadow-viewer">
            viewer frame
          </div>
          <div
            className="rounded-r8 bg-ink-2 p-3"
            style={{ boxShadow: 'var(--focus-ring)' }}
          >
            focus-visible
          </div>
        </div>
      </section>
      <footer className="mt-16 border-t border-line pt-6 text-t12 text-cream-60">
        built from the kimo design bible. product screens begin in the next
        phases.
      </footer>
    </main>
  );
}
