import { useEffect, useState } from 'react';

const TILE_SIZE = 160;

/**
 * Film grain overlay:
 * A 160x160 noise tile generated in code (canvas, once, to a data URL)
 * at 3.5% opacity, mix-blend-mode overlay, fixed over the whole page, pointer-events none.
 */
export function FilmGrain() {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.createImageData(TILE_SIZE, TILE_SIZE);
    const buffer = imageData.data;

    // Deterministic pseudo-random LCG so grain texture is crisp and reproducible
    let seed = 1337;
    for (let i = 0; i < buffer.length; i += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const value = (seed >>> 24) & 0xff;
      buffer[i] = value;
      buffer[i + 1] = value;
      buffer[i + 2] = value;
      buffer[i + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
    setDataUrl(canvas.toDataURL('image/png'));
  }, []);

  if (!dataUrl) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 50,
        opacity: 0.035,
        mixBlendMode: 'overlay',
        backgroundImage: `url(${dataUrl})`,
        backgroundRepeat: 'repeat',
        backgroundSize: `${TILE_SIZE}px ${TILE_SIZE}px`,
      }}
    />
  );
}
