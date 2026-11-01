// Temporary browser-only Studio fixture. No engine, media render, account or AI.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../renderer/', import.meta.url));
const patch = `
const originalLibrary=window.kimo.library;
let projects=[];
window.kimo.library=async()=>{
 projects=await originalLibrary();
 for(const p of projects)for(const t of p.edl?.audio??[]){t.role='MUSIC';t.name='MUSIC';}
 return projects;
};
window.__audioImports=[];
window.kimo.pathsOf=files=>[...files].map(f=>'C:/music/'+f.name);
window.kimo.addMusic=async({id,path})=>{
 window.__audioImports.push(path??'picker');
 const p=projects.find(p=>p.id===id),t=p.edl.audio.find(t=>t.role==='MUSIC');
 const c=t.clips[0],s=p.edl.sources.find(s=>s.id===c.src);
 s.path=path??'C:/music/chosen.opus';
 return {...p,status:'done',edl:structuredClone(p.edl)};
};`;
const mock = readFileSync(resolve(root, 'src/dev/mock-kimo.js'), 'utf8');
const server = createServer((req, res) => {
  const path = decodeURIComponent(
    new URL(req.url, 'http://localhost').pathname,
  );
  if (path === '/') {
    // Only the fixture permits inline mocks; production CSP remains unchanged.
    const html = readFileSync(resolve(root, 'index.html'), 'utf8')
      .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
      .replace(
        '</head>',
        () => `<script>${mock}</script><script>${patch}</script></head>`,
      );
    res.setHeader('Content-Type', 'text/html');
    res.end(html);
    return;
  }
  const file = resolve(root, '.' + path);
  if (!file.startsWith(resolve(root) + sep) || !existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader(
    'Content-Type',
    { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }[
      extname(file)
    ] ?? 'application/octet-stream',
  );
  res.end(readFileSync(file));
});
server.listen(8768, '127.0.0.1', () =>
  console.log('Audio UI fixture http://127.0.0.1:8768'),
);
