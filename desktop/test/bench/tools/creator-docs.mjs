// UI-only documentation capture; no footage render, AI call or installer build.
// Start desktop/test/studio-ui.mjs in a separate process before running this.
import { chromium } from '@playwright/test';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { toolPaths } from '../run.mjs';
import { run } from '../../../audio/process.mjs';
const scratch = await mkdtemp(join(tmpdir(), 'kimo-picker-')),
  output = resolve('docs/readme/creator-picker.gif'),
  browser = await chromium.launch({ channel: 'chrome', headless: true });
await mkdir(resolve('docs/readme'), { recursive: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  await page.request.post('http://127.0.0.1:8770/reset');
  await page.goto('http://127.0.0.1:8770');
  await page.locator('.creator-home').waitFor();
  for (const [i, name] of [
    'Shorts — Clean',
    'YouTube — Talking',
    'Explainer',
  ].entries()) {
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await page.locator('.creator-home').scrollIntoViewIfNeeded();
    await page
      .locator('.creator-template video')
      .evaluateAll(async (videos) => {
        await Promise.all(
          videos.map(
            (video) =>
              new Promise((done) => {
                video.pause();
                if (video.readyState >= 2) return done();
                video.addEventListener('loadeddata', done, { once: true });
              }),
          ),
        );
      });
    await page
      .locator('.creator-home')
      .screenshot({ path: join(scratch, `${i}.png`) });
  }
} finally {
  await browser.close();
}
await run(toolPaths().ffmpeg, [
  '-framerate',
  '1',
  '-i',
  join(scratch, '%d.png'),
  '-filter_complex',
  '[0:v]scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer',
  '-loop',
  '0',
  output,
]);
console.log(output);
