import { spawn } from 'node:child_process';
const children = ['mock', 'dev'].map((script) =>
  spawn(process.execPath, [process.env.npm_execpath, script], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NEXT_PUBLIC_KIMO_API: 'http://localhost:8787',
      NEXT_PUBLIC_KIMO_WS: 'ws://localhost:8787',
      MOCK_PORT: '8787',
    },
  }),
);
const stop = () => children.forEach((child) => child.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children)
  child.on('exit', (code) => {
    stop();
    process.exitCode = code ?? 0;
  });
