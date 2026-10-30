// Builds the kimo desktop renderer from desktop/renderer/src into desktop/renderer/
// (index.html + assets/), which is what main.cjs loads and electron-builder packs.
// The studio's real design system is reused straight from apps/web: tokens, fonts,
// ui/studio/agent CSS and the components/ui primitives are imported, not copied.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, '../../apps/web');
const webAssets = web.replaceAll('\\', '/');

// apps/web CSS is written for Tailwind v4 + Next: `@theme static` blocks hold the
// tokens and assets are referenced from /public. Turn them into plain CSS that
// Vite can bundle for file:// loading.
const studioCss = {
  name: 'kimo-studio-css',
  enforce: 'pre',
  transform(code, id) {
    if (!id.replaceAll('\\', '/').startsWith(webAssets) || !id.endsWith('.css')) return null;
    return code
      .replace(/@theme\s+static\s*\{/g, ':root {')
      .replace(/url\((['"]?)\/(fonts|brand)\//g, `url($1${webAssets}/public/$2/`)
      .replace(/url\((['"]?)\/grain\.png/g, `url($1${webAssets}/public/grain.png`);
  },
};
// One classic deferred script instead of an ES module: loads from file:// in any
// Chromium without CORS rules for module scripts.
const classicScript = {
  name: 'kimo-classic-script',
  enforce: 'post',
  transformIndexHtml(html) {
    return html.replace(/<script type="module" crossorigin/g, '<script defer').replace(/<link rel="stylesheet" crossorigin/g, '<link rel="stylesheet"');
  },
};
const cleanAssets = {
  name: 'kimo-clean-assets',
  buildStart() {
    rmSync(resolve(here, 'assets'), { recursive: true, force: true });
  },
};
// apps/web components import their packages by bare name; resolve those from the
// desktop install (apps/web's own node_modules is not needed to build the renderer).
const fromDesktop = {
  name: 'kimo-web-deps',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (!importer || !importer.replaceAll('\\', '/').startsWith(webAssets) || source.startsWith('.') || source.startsWith('/') || source.startsWith('@web') || source.startsWith('\0')) return null;
    return this.resolve(source, resolve(here, 'src/main.jsx'), { ...options, skipSelf: true });
  },
};

export default defineConfig({
  root: resolve(here, 'src'),
  base: './',
  plugins: [cleanAssets, fromDesktop, studioCss, react(), classicScript],
  resolve: {
    alias: [
      { find: '@web', replacement: resolve(web, 'src') },
    ],
    dedupe: ['react', 'react-dom'],
  },
  server: { fs: { allow: [resolve(here, '../..')] } },
  build: {
    minify: process.env.KIMO_DEBUG ? false : 'esbuild',
    outDir: here,
    emptyOutDir: false,
    assetsDir: 'assets',
    modulePreload: false,
    target: 'chrome128',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    cssCodeSplit: false,
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
  },
});
