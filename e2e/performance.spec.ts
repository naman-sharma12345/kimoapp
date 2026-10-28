import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('landing meets mobile loading and interaction budgets', async ({
  page,
  browserName,
}) => {
  test.skip(
    process.env.KIMO_PERF !== '1' || browserName !== 'chromium',
    'Run on the production server with KIMO_PERF=1',
  );
  await page.setViewportSize({ width: 412, height: 823 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 60 * 2.75,
    downloadThroughput: (9_000_000 / 8) * 0.9,
    uploadThroughput: (1_500_000 / 8) * 0.9,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => {
    const vitals = {
      lcp: 0,
      cls: 0,
      interaction: 0,
      lcpElement: '',
      shifts: [] as unknown[],
    };
    Object.assign(window, { kimoVitals: vitals });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        vitals.lcp = Math.max(vitals.lcp, e.startTime);
        if ('element' in e && e.element instanceof HTMLElement)
          vitals.lcpElement = e.element.className;
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        if (!('hadRecentInput' in e) || !e.hadRecentInput) {
          if ('sources' in e) vitals.shifts.push(e.toJSON());
          vitals.cls +=
            'value' in e && typeof e.value === 'number' ? e.value : 0;
        }
    }).observe({ type: 'layout-shift', buffered: true });
    const eventOptions: PerformanceObserverInit & {
      durationThreshold: number;
    } = { type: 'event', buffered: true, durationThreshold: 16 };
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        if ('interactionId' in e && e.interactionId)
          vitals.interaction = Math.max(vitals.interaction, e.duration);
    }).observe(eventOptions);
  });
  await page.goto('/');
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(3500);
  await page
    .getByRole('textbox', { name: 'describe your video' })
    .pressSequentially('a calm travel reel', { delay: 40 });
  await page.waitForTimeout(1000);
  const resources = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((e) => ({
      name: e.name.replace(location.origin, ''),
      start: e.startTime,
      duration: e.duration,
      size: 'transferSize' in e ? e.transferSize : 0,
    })),
  );
  const vitals = await page.evaluate(
    () =>
      (
        window as unknown as {
          kimoVitals: { lcp: number; cls: number; interaction: number };
        }
      ).kimoVitals,
  );
  await writeFile(
    'docs/performance-mobile.json',
    JSON.stringify(
      {
        profile:
          'Moto G Power viewport, DevTools Fast 4G (9Mbps/1.5Mbps/60ms targets with emulation adjustments), CPU 4x, cold cache',
        browser: browserName,
        ...vitals,
        resources,
      },
      null,
      2,
    ) + '\n',
  );
  expect(vitals.lcp).toBeGreaterThan(0);
  expect(vitals.lcp).toBeLessThanOrEqual(1800);
  expect(vitals.cls).toBe(0);
  expect(vitals.interaction).toBeLessThanOrEqual(100);
});
