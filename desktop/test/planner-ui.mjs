// Browser-only preload fixture. No engine, account, media render or AI calls.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { templateStyles } from '../planner/templates.mjs';
const root = fileURLToPath(new URL('../renderer/', import.meta.url));
const styles = Object.fromEntries(
  Object.entries(templateStyles()).map(([id, t]) => [id, t.label]),
);
const patch = `
const originalStatus=window.kimo.status,originalLibrary=window.kimo.library;
let projects=[];window.__creatorPatches=[];window.__creatorUndos=0;
window.kimo.status=async()=>({...await originalStatus(),styles:${JSON.stringify(styles)}});
window.kimo.library=async()=>{
 projects=await originalLibrary();const p=projects.find(p=>p.id==='p2');p.style='youtube-talking';
 p.creator={template:'youtube-talking',score:68.2,accepted:false,budget:{reserved_usd:.06},undoDepth:1};
 p.beforeOutput='previous.mp4';return projects;
};
window.kimo.followup=async({id,text})=>{window.__creatorPatches.push(text);const p=projects.find(p=>p.id===id);p.creator={...p.creator,undoDepth:p.creator.undoDepth+1};return structuredClone(p);};
window.kimo.undoPlan=async({id})=>{window.__creatorUndos++;const p=projects.find(p=>p.id===id);p.creator={...p.creator,undoDepth:p.creator.undoDepth-1};return structuredClone(p);};
`;
const mock = readFileSync(resolve(root, 'src/dev/mock-kimo.js'), 'utf8');
const server = createServer((req, res) => {
  const pathname = decodeURIComponent(
    new URL(req.url, 'http://localhost').pathname,
  );
  if (pathname === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end(
      readFileSync(resolve(root, 'index.html'), 'utf8')
        .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
        .replace(
          '</head>',
          () => `<script>${mock}</script><script>${patch}</script></head>`,
        ),
    );
    return;
  }
  const path = resolve(root, '.' + pathname);
  if (!path.startsWith(resolve(root) + sep) || !existsSync(path)) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader(
    'Content-Type',
    {
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.woff2': 'font/woff2',
      '.webp': 'image/webp',
    }[extname(path)] ?? 'application/octet-stream',
  );
  res.end(readFileSync(path));
});
server.listen(8769, '127.0.0.1', () =>
  console.log('Creator UI fixture http://127.0.0.1:8769'),
);
