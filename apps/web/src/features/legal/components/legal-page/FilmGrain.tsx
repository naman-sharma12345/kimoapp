import React, { useEffect, useState } from 'react';

let cachedNoiseDataUrl: string | null = null;

function generateFilmGrainDataUrl(): string {
  if (cachedNoiseDataUrl) {
    return cachedNoiseDataUrl;
  }
  if (typeof document === 'undefined') {
    return '';
  }
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return '';
  }

  const imageData = ctx.createImageData(160, 160);
  const data = imageData.data;
  // Deterministic PRNG so the film grain tile is crisp and consistent
  let seed = 192837465;
  for (let i = 0; i < data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const value = seed & 0xff;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  cachedNoiseDataUrl = canvas.toDataURL('image/png');
  return cachedNoiseDataUrl;
}

export const FilmGrain: React.FC = () => {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    setDataUrl(generateFilmGrainDataUrl());
  }, []);

  if (!dataUrl) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-50 bg-repeat"
      style={{
        backgroundImage: `url(${dataUrl})`,
        backgroundSize: '160px 160px',
        opacity: 0.035,
        mixBlendMode: 'overlay',
      }}
    />
  );
};
