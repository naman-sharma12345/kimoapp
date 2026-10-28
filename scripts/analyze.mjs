import { spawnSync } from 'node:child_process';
const result = spawnSync(
  process.execPath,
  [process.env.npm_execpath, 'build'],
  { stdio: 'inherit', env: { ...process.env, ANALYZE: 'true' } },
);
process.exitCode = result.status ?? 1;
