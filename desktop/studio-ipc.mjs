import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  studioCatalog,
  studioHistory,
  cleanCreatorOptions,
} from './studio.mjs';
import { publicEdl, toTimeline } from './edl.mjs';
export { cleanCreatorOptions };
export function mediaAllowed(file, projects, projectDir, music = []) {
  const normal = (p) => {
      const value = resolve(p);
      return process.platform === 'win32' ? value.toLowerCase() : value;
    },
    path = normal(file);
  return (
    music.some((m) => normal(m.path) === path) ||
    projects.some(
      (p) =>
        normal(p.output ?? projectDir(p.id)) === path ||
        p.files.some((f) => normal(f.path) === path) ||
        path.startsWith(normal(projectDir(p.id)) + sep),
    )
  );
}
export function catalog() {
  const data = studioCatalog();
  return {
    ...data,
    music: data.music.map((m) => ({
      ...m,
      path: join(fileURLToPath(new URL('.', import.meta.url)), m.path).replace(
        /app\.asar([\\/])/,
        'app.asar.unpacked$1',
      ),
    })),
  };
}
export function registerStudioIpc({
  ipcMain,
  library,
  projectDir,
  update,
  pump,
  dialog,
  win,
  getWindow,
  probe,
  ffprobe,
}) {
  ipcMain.handle('studio:catalog', () => catalog());
  ipcMain.handle('studio:pick-music', async () => {
    const options = {
      properties: ['openFile'],
      filters: [
        {
          name: 'Music',
          extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus'],
        },
      ],
    };
    const parent = getWindow?.() ?? win;
    const r = await (parent
      ? dialog.showOpenDialog(parent, options)
      : dialog.showOpenDialog(options));
    if (r.canceled) return null;
    const f = await probe(ffprobe, r.filePaths[0]);
    if (f?.kind !== 'audio') throw new Error('Choose an audio file');
    return f;
  });
  ipcMain.handle('studio:patch', async (_event, { id, patch }) => {
    const p = library.find((p) => p.id === id);
    if (!p || ['running', 'queued'].includes(p.status)) return null;
    const edlPath = p.edlFile ?? join(projectDir(id), 'edit.edl.json');
    if (!existsSync(edlPath))
      throw new Error('Re-run this edit once to create editable decisions');
    const current = JSON.parse(readFileSync(edlPath, 'utf8'));
    if (patch?.type === 'regenerate') {
      if (
        Object.keys(patch).some(
          (k) => !['type', 'part', 'instruction'].includes(k),
        ) ||
        !['new hook', 'new b-roll picks'].includes(patch.part) ||
        (patch.instruction !== undefined &&
          (typeof patch.instruction !== 'string' ||
            patch.instruction.length > 500))
      )
        throw new Error('Unknown regeneration request');
      const historyPath = join(projectDir(id), 'studio-history.json');
      p.job = {
        needsAi: true,
        studioAppend: true,
        studioHistory: existsSync(historyPath)
          ? JSON.parse(readFileSync(historyPath, 'utf8'))
          : { entries: [current], cursor: 0 },
        mode: 'followup',
        note: `${patch.part}. ${patch.instruction ?? ''} Return a minimal validated plan patch. Variation seed ${Date.now()}.`,
      };
    } else {
      const path = join(projectDir(id), 'studio-history.json'),
        saved = existsSync(path)
          ? JSON.parse(readFileSync(path, 'utf8'))
          : null;
      const result = studioHistory(current, saved, patch);
      p.edl = publicEdl(result.edl);
      p.timeline = { ...toTimeline(result.edl), edl: p.edl };
      p.job = {
        mode: 'manual',
        ops: [],
        edl: result.edl,
        note: `studio ${patch.type}`,
        studioHistory: result.history,
      };
    }
    p.status = 'queued';
    p.error = undefined;
    update(p);
    pump();
    return { ...p, job: undefined, log: undefined };
  });
}
