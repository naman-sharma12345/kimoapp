import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const alt = 'kimo · tell it the video';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export default async function OpenGraphImage() {
  const fontDir = path.join(process.cwd(), 'src/assets/fonts');
  const [geist, instrument, mark] = await Promise.all([
    readFile(path.join(fontDir, 'Geist-Regular.ttf')),
    readFile(path.join(fontDir, 'InstrumentSerif-Italic.ttf')),
    readFile(path.join(process.cwd(), 'public/brand/kimo-mark.svg')),
  ]);
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '80px',
        background: '#080809',
        color: '#F5F1E7',
        fontFamily: 'Geist',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          fontSize: 88,
          lineHeight: 0.98,
          letterSpacing: '-0.035em',
        }}
      >
        <span>tell it the video.</span>
        <span>
          watch it get{' '}
          <span
            style={{
              fontFamily: 'Instrument Serif',
              fontStyle: 'italic',
              fontSize: 93.28,
            }}
          >
            made.
          </span>
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 80,
          bottom: 64,
          alignItems: 'center',
          gap: 8,
          fontSize: 24,
          fontWeight: 500,
        }}
      >
        {/* ImageResponse consumes the exact supplied SVG as a data URL. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/svg+xml;base64,${mark.toString('base64')}`}
          alt=""
          width="24"
          height="24"
        />
        <span>kimo</span>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Geist', data: geist, weight: 400, style: 'normal' },
        {
          name: 'Instrument Serif',
          data: instrument,
          weight: 400,
          style: 'italic',
        },
      ],
    },
  );
}
