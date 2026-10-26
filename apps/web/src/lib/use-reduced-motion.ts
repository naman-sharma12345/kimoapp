'use client';
import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
const read = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const server = () => false;
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, read, server);
}
