// Keep media workers cooperative with the foreground desktop. No encode-quality
// options, timeline decisions or engine binaries are changed here.
const childProcess = require('node:child_process');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function workerThreads(
  env = process.env,
  parallelism = os.availableParallelism(),
) {
  const requested = Number(env.KIMO_WORKER_THREADS);
  const ceiling = Math.max(1, Math.min(2, parallelism - 2));
  return Number.isInteger(requested) && requested > 0
    ? Math.min(requested, ceiling)
    : 1;
}
function backgroundEnv(env = process.env) {
  const next = { ...process.env, ...env };
  const threads = workerThreads(next);
  for (const key of [
    'RAYON_NUM_THREADS',
    'OMP_NUM_THREADS',
    'OPENBLAS_NUM_THREADS',
    'MKL_NUM_THREADS',
  ]) {
    const value = Number(next[key]);
    next[key] = String(
      Number.isInteger(value) && value > 0 ? Math.min(value, threads) : threads,
    );
  }
  return next;
}
function ffmpegArgs(bin, args, env = process.env) {
  if (!/(^|[\\/])ffmpeg(?:\.exe)?$/i.test(bin) || !args.includes('-i'))
    return [...args];
  const threads = String(workerThreads(env));
  const cleaned = [];
  for (let i = 0; i < args.length; i++) {
    if (
      /^-threads(?::.*)?$|^-filter_threads$|^-filter_complex_threads$/.test(
        args[i],
      )
    ) {
      i++;
      continue;
    }
    if (args[i] === '-i') cleaned.push('-threads', threads);
    cleaned.push(args[i]);
  }
  // These app commands have one output, always their final argument.
  return [
    '-filter_threads',
    '1',
    '-filter_complex_threads',
    '1',
    ...cleaned.slice(0, -1),
    '-threads',
    threads,
    cleaned.at(-1),
  ];
}
function lowerPriority(pid) {
  if (!pid) return false;
  try {
    const target = os.constants.priority.PRIORITY_BELOW_NORMAL;
    if (os.getPriority(pid) < target) os.setPriority(pid, target);
    return true;
  } catch {
    return false;
  } // Gone already, or the OS disallows priority changes.
}
function spawnBackground(bin, args, options = {}) {
  const env = backgroundEnv(options.env);
  const child = childProcess.spawn(bin, ffmpegArgs(bin, args, env), {
    ...options,
    env,
    windowsHide: true,
  });
  lowerPriority(child.pid);
  return child;
}
function execFileBackground(bin, args, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  const env = backgroundEnv(options?.env);
  const child = childProcess.execFile(
    bin,
    ffmpegArgs(bin, args, env),
    { ...options, env, windowsHide: true },
    callback,
  );
  lowerPriority(child.pid);
  return child;
}
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code !== 'ESRCH';
  }
}
/** One expensive job across app instances or benchmark processes. */
function acquireExclusive(name, directory = os.tmpdir()) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Invalid worker lock name');
  const lock = path.join(directory, `kimo-${name}.lock`);
  const busy = () =>
    new Error(
      `Another kimo ${name} job is already running. Finish or stop it before starting another.`,
    );
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.mkdirSync(lock);
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const owners = fs.readdirSync(lock);
      if (!owners.length) {
        if (Date.now() - fs.statSync(lock).mtimeMs < 30_000) throw busy();
      } else {
        if (owners.length !== 1 || !/^\d+-[0-9a-f-]+\.json$/.test(owners[0]))
          throw busy();
        const pid = Number(owners[0].split('-')[0]);
        if (!pid || alive(pid)) throw busy();
        // Remove only the dead owner's unique marker. A competing recovery
        // cannot remove a new owner's marker; rmdir refuses nonempty folders.
        try {
          fs.unlinkSync(path.join(lock, owners[0]));
        } catch (err) {
          if (err.code !== 'ENOENT') throw err;
        }
      }
      try {
        fs.rmdirSync(lock);
      } catch (err) {
        if (err.code !== 'ENOENT') throw busy();
      }
      continue;
    }
    const marker = path.join(lock, `${process.pid}-${randomUUID()}.json`);
    try {
      fs.writeFileSync(
        marker,
        JSON.stringify({ pid: process.pid, started: new Date().toISOString() }),
        { flag: 'wx' },
      );
    } catch (e) {
      try {
        fs.rmdirSync(lock);
      } catch {
        /* another owner won recovery */
      }
      throw e;
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      try {
        fs.unlinkSync(marker);
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
      try {
        fs.rmdirSync(lock);
      } catch (e) {
        if (!['ENOENT', 'ENOTEMPTY'].includes(e.code)) throw e;
      }
    };
  }
  throw busy();
}
module.exports = {
  workerThreads,
  backgroundEnv,
  ffmpegArgs,
  lowerPriority,
  spawnBackground,
  execFileBackground,
  acquireExclusive,
};
