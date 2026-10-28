import { test, expect } from '@playwright/test';
import { WebSocket } from 'ws';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createGzip } from 'node:zlib';
import { finished } from 'node:stream/promises';
import type { SessionSnapshot } from '../packages/kimo-client/src/schema';

test('50-clip timeline, 20-minute Chrome process memory and heap snapshots', async ({
  page,
  browser,
  browserName,
}) => {
  test.skip(
    process.env.KIMO_SOAK !== '1' || browserName !== 'chromium',
    'Dedicated production soak job',
  );
  test.setTimeout(1_300_000);
  const api = 'http://localhost:8787';
  const response = await page.request.post(`${api}/v1/sessions`, {
    data: {
      prompt: 'fifty clip performance fixture',
      aspect: '16:9',
      assetIds: [],
    },
  });
  const { sessionId, wsUrl } = (await response.json()) as {
    sessionId: string;
    wsUrl: string;
  };
  const ws = new WebSocket(wsUrl);
  await expect
    .poll(
      async () => {
        const s = (await (
          await page.request.get(`${api}/v1/sessions/${sessionId}`)
        ).json()) as SessionSnapshot;
        return Object.values(s.project.clips).some((c) => c.kind === 'video');
      },
      { timeout: 30000 },
    )
    .toBe(true);
  await page.request.post(`${api}/v1/sessions/${sessionId}/reopen`, {
    data: {},
  });
  ws.close();
  const snapshot = (await (
    await page.request.get(`${api}/v1/sessions/${sessionId}`)
  ).json()) as SessionSnapshot;
  const sample = Object.values(snapshot.project.clips).find(
    (c) => c.kind === 'video',
  );
  if (!sample) throw new Error('Missing source video');
  await page.request.post(`${api}/v1/sessions/${sessionId}/ops`, {
    data: {
      baseVersion: snapshot.project.version,
      ops: [
        ...Object.keys(snapshot.project.clips).map((id) => ({
          op: 'clip.remove',
          id,
        })),
        ...Array.from({ length: 50 }, (_, i) => ({
          op: 'clip.add',
          clip: {
            ...sample,
            id: `perf-${i}`,
            start: i * 2,
            duration: 2,
            in: 0,
            effects: [],
            keyframes: [],
            mask: undefined,
          },
        })),
      ],
    },
  });
  await page.addInitScript(() => localStorage.setItem('kimo.coached', '1'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/studio/${sessionId}`);
  await page.getByRole('button', { name: 'finish', exact: true }).waitFor();
  await page.waitForTimeout(3000);
  const cdp = await page.context().newCDPSession(page);
  const browserCdp = await browser.newBrowserCDPSession();
  await cdp.send('Performance.enable');
  await mkdir('test-results-soak', { recursive: true });
  const heap = async (label: string) => {
    const gzip = createGzip();
    const file = createWriteStream(
      `test-results-soak/${label}.heapsnapshot.gz`,
    );
    gzip.pipe(file);
    const onChunk = ({ chunk }: { chunk: string }) => {
      gzip.write(chunk);
    };
    cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
    cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
    gzip.end();
    await finished(file);
  };
  const frames = await page.evaluate(async () => {
    const el = document.querySelector<HTMLElement>('.editor-timeline-scroll');
    if (!el) throw new Error('Missing timeline');
    return await new Promise<number[]>((resolve) => {
      const times: number[] = [];
      let previous = performance.now();
      const frame = (now: number) => {
        times.push(now - previous);
        previous = now;
        el.scrollLeft =
          (el.scrollLeft + 3) % Math.max(1, el.scrollWidth - el.clientWidth);
        if (times.length < 180) requestAnimationFrame(frame);
        else resolve(times.slice(5));
      };
      requestAnimationFrame(frame);
    });
  });
  const fps = 1000 / (frames.reduce((a, b) => a + b, 0) / frames.length);
  const samples: {
    elapsedSec: number;
    rssBytes: number;
    jsHeapBytes: number;
    nodes: number;
  }[] = [];
  const started = Date.now();
  await heap('start');
  let middle = false;
  while (Date.now() - started < 1_200_000) {
    // Exercise seek, playback, zoom and scrolling repeatedly on the real UI.
    await page
      .getByRole('button', { name: 'go to start', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'play', exact: true })
      .click({ timeout: 10000 });
    await page.waitForTimeout(1200);
    await page
      .getByRole('button', { name: 'pause playback', exact: true })
      .click({ timeout: 10000 });
    await page.locator('.editor-timeline-scroll').evaluate((el) => {
      el.scrollLeft =
        (el.scrollLeft + 200) % Math.max(1, el.scrollWidth - el.clientWidth);
    });
    const { processInfo } = await browserCdp.send('SystemInfo.getProcessInfo');
    const ids = processInfo.map((p) => p.id);
    let rssBytes = 0;
    if (process.platform === 'win32') {
      rssBytes = Number(
        execFileSync(
          'powershell.exe',
          [
            '-NoProfile',
            '-Command',
            `(Get-Process -Id ${ids.join(',')} -ErrorAction SilentlyContinue | Measure-Object -Property WorkingSet64 -Sum).Sum`,
          ],
          { encoding: 'utf8', windowsHide: true },
        ).trim(),
      );
    } else {
      for (const id of ids) {
        try {
          const status = await readFile(`/proc/${id}/status`, 'utf8');
          rssBytes += Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0) * 1024;
        } catch {
          /* Process may exit between samples. */
        }
      }
    }
    const metrics = await cdp.send('Performance.getMetrics');
    const dom = await cdp.send('Memory.getDOMCounters');
    samples.push({
      elapsedSec: (Date.now() - started) / 1000,
      rssBytes,
      jsHeapBytes:
        metrics.metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0,
      nodes: dom.nodes,
    });
    if (!middle && Date.now() - started >= 600000) {
      await heap('middle');
      middle = true;
    }
    await page.waitForTimeout(12000);
  }
  await heap('end');
  const report = {
    durationSec: (Date.now() - started) / 1000,
    clips: 50,
    fps,
    browser: browser.version(),
    scope:
      'RSS of all processes belonging to this isolated Chrome instance; not JS heap alone',
    samples,
  };
  await writeFile(
    'docs/performance-soak.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  expect(fps).toBeGreaterThanOrEqual(58);
  expect(samples.length).toBeGreaterThan(50);
  expect(Math.max(...samples.map((s) => s.rssBytes))).toBeLessThan(800_000_000);
});
