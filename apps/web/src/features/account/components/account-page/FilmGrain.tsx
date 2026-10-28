import { useEffect, useState } from 'react';

let cachedGrainDataUrl: string | null = null;

function getGrainDataUrl(): string {
  if (cachedGrainDataUrl) {
    return cachedGrainDataUrl;
  }
  if (typeof document === 'undefined') {
    return '';
  }

  const size = 160;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return '';
  }

  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  // Deterministic pseudo-random generator so noise tile is consistent
  let seed = 918273;
  for (let i = 0; i < data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const value = seed & 0xff;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  cachedGrainDataUrl = canvas.toDataURL('image/png');
  return cachedGrainDataUrl;
}

export function FilmGrain() {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    setDataUrl(getGrainDataUrl());
  }, []);

  if (!dataUrl) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-50"
      style={{
        backgroundImage: `url(${dataUrl})`,
        backgroundRepeat: 'repeat',
        backgroundSize: '160px 160px',
        opacity: 0.035,
        mixBlendMode: 'overlay',
      }}
    />
  );
}
