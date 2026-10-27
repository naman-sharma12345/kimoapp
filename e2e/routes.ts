export const routes = [
  { path: '/', name: 'landing', phase: '02', studio: false },
  { path: '/dev/tokens', name: 'tokens', phase: '00', studio: false },
  { path: '/dev/ui', name: 'ui', phase: '01', studio: false },
  { path: '/dev/uploads', name: 'uploads', phase: '03', studio: false },
] as const;
