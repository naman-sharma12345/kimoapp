'use client';
import { useEffect } from 'react';

export function Ready() {
  useEffect(() => {
    let active = true;
    void document.fonts.ready.then(() => {
      requestAnimationFrame(() => {
        if (active)
          document.getElementById('main')?.setAttribute('data-ready', 'true');
      });
    });
    return () => {
      active = false;
    };
  }, []);
  return null;
}
