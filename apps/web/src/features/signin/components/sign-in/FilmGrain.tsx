import { useEffect, useState } from 'react';

const TILE_SIZE = 160;

/**
 * Film grain: a 160x160 noise tile generated in code (canvas, once, to a data URL)
 * at 3.5% opacity, mix-blend-mode overlay, fixed over the whole page, pointer-events none.
 */
export function FilmGrain() {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.createImageData(TILE_SIZE, TILE_SIZE);
    const data = imageData.data;

    // Deterministic PRNG so grain texture is consistent across renders
    let seed = 1337;
    for (let i = 0; i < data.length; i += 4) {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      const v = (seed >>> 24) & 0xff;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
    setDataUrl(canvas.toDataURL('image/png'));
  }, []);

  if (!dataUrl) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50"
      style={{
        backgroundImage: `url(${dataUrl})`,
        backgroundRepeat: 'repeat',
        backgroundSize: `${TILE_SIZE}px ${TILE_SIZE}px`,
        opacity: 0.035,
        mixBlendMode: 'overlay',
      }}
    />
  );
}
