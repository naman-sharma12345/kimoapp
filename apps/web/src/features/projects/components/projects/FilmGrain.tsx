import React, { useEffect, useState } from 'react';

let cachedNoiseDataUrl: string | null = null;

function getNoiseDataUrl(): string {
  if (cachedNoiseDataUrl) return cachedNoiseDataUrl;
  if (typeof document === 'undefined') return '';

  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const imageData = ctx.createImageData(160, 160);
  const data = imageData.data;
  let seed = 1337;
  for (let i = 0; i < data.length; i += 4) {
    seed = (seed * 16807) % 2147483647;
    const val = seed & 255;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
    data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  cachedNoiseDataUrl = canvas.toDataURL('image/png');
  return cachedNoiseDataUrl;
}

export function FilmGrain() {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    setDataUrl(getNoiseDataUrl());
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
        backgroundSize: '160px 160px',
      }}
    />
  );
}
