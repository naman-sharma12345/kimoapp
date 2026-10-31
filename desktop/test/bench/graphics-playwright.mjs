// Headless CI / bench path for the graphics engine: the same render page the
// app's offscreen window loads (graphics/render.html), driven by Playwright
// Chromium. Playwright is not an app dependency; it is imported dynamically
// (root devDependency, or PLAYWRIGHT_MODULE=/path/to/playwright).
// Usage: const host = await playwrightHost(); setGraphicsHost(host); ... await host.close();
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DESKTOP = fileURLToPath(new URL('../../', import.meta.url));
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.ttf': 'font/ttf', '.png': 'image/png', '.json': 'application/json' };

async function loadPlaywright() {
  const spec = process.env.PLAYWRIGHT_MODULE;
  try {
    return await import(spec ? pathToFileURL(spec).href : 'playwright');
  } catch {
    return await import('@playwright/test');
  }
}

/** Serves desktop/graphics and desktop/fonts read-only on 127.0.0.1 (module scripts need http, not file://). */
function serve() {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([\\/])+/, '');
    if (!/^(graphics|fonts)[\\/]/.test(path) || path.includes('..')) {
      res.writeHead(404).end();
      return;
    }
    try {
      const body = await readFile(join(DESKTOP, path));
      res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

export async function playwrightHost({ executablePath = process.env.KIMO_CHROMIUM, args = [] } = {}) {
  const pw = await loadPlaywright();
  const chromium = pw.chromium ?? pw.default?.chromium;
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), args });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/graphics/render.html`);
  await page.waitForFunction(() => window.kimoGraphics?.ready === true, null, { timeout: 15000 });
  const info = await page.evaluate((o) => window.kimoGraphics.init(o), { fontsBase: `${base}/fonts`, emojiBase: `${base}/graphics/emoji` });
  return {
    name: 'chromium-playwright',
    info,
    errors,
    async render(job, frames) {
      const out = await page.evaluate(([j, f]) => window.kimoGraphics.render(j, f, 'base64'), [job, frames]);
      return out.map((s) => Buffer.from(s, 'base64'));
    },
    async close() {
      await browser.close();
      server.close();
    },
  };
}
