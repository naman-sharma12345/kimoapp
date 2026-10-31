// The app's graphics host: a hidden offscreen BrowserWindow that loads
// graphics/render.html and renders jobs with Chromium's canvas. Registered
// with graphics/renderer.mjs setGraphicsHost() by main.cjs. Main process only.
const { BrowserWindow } = require('electron');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

function createGraphicsHost({ dir, fontsDir, emojiDir, log = () => {} }) {
  let win = null;
  let starting = null;
  const start = () =>
    (starting ??= (async () => {
      win = new BrowserWindow({
        show: false,
        width: 64,
        height: 64,
        transparent: true,
        webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
      });
      win.webContents.setFrameRate(1); // nothing is painted on screen; frames are read from the page canvas
      await win.loadFile(join(dir, 'render.html'));
      const info = await win.webContents.executeJavaScript(
        `(async () => { for (let i = 0; i < 100 && !window.kimoGraphics; i++) await new Promise((r) => setTimeout(r, 30)); return window.kimoGraphics.init(${JSON.stringify({ fontsBase: pathToFileURL(fontsDir).href, emojiBase: pathToFileURL(emojiDir).href })}); })()`,
      );
      log(`graphics host ready: ${info.fonts}/${info.of} fonts`);
      if (!info.fonts) throw new Error('graphics page loaded no fonts');
      win.on('closed', () => {
        win = null;
        starting = null;
      });
      return info;
    })().catch((error) => {
      starting = null;
      try {
        win?.destroy();
      } catch {
        /* gone */
      }
      win = null;
      throw error;
    }));
  return {
    name: 'chromium-offscreen',
    start,
    async render(job, frames) {
      await start();
      const out = await win.webContents.executeJavaScript(`window.kimoGraphics.render(${JSON.stringify(job)}, ${JSON.stringify(frames)}, 'base64')`);
      return out.map((s) => Buffer.from(s, 'base64'));
    },
    close() {
      try {
        win?.destroy();
      } catch {
        /* gone */
      }
      win = null;
      starting = null;
    },
  };
}
module.exports = { createGraphicsHost };
