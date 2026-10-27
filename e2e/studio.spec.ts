import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type WebSocketRoute,
} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { WebSocket } from 'ws';

async function studio(page: Page, request: APIRequestContext) {
  const response = await request.post('http://127.0.0.1:8787/v1/sessions', {
    data: { prompt: 'a small film', assetIds: [], aspect: 'auto' },
  });
  const { sessionId, wsUrl } = (await response.json()) as {
    sessionId: string;
    wsUrl: string;
  };
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('warm-up timed out'));
    }, 15000);
    ws.on('message', (bytes) => {
      const event = JSON.parse(bytes.toString()) as {
        t: string;
        step?: string;
      };
      if (event.t === 'warmup.step' && event.step === 'ready') {
        clearTimeout(timer);
        ws.close();
        resolve();
      }
    });
    ws.on('error', reject);
  });
  await page.goto(`/studio/${sessionId}`);
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  await expect(page.getByRole('region', { name: 'viewer' })).toBeVisible();
  return sessionId;
}

test('desktop geometry, controls, persisted resize and keyboard', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await studio(page, request);
  const box = async (selector: string) => {
    const value = await page.locator(selector).boundingBox();
    if (!value) throw new Error(`missing ${selector}`);
    return value;
  };
  expect((await box('.studio-topbar')).height).toBe(48);
  await expect(page.locator('.studio-mark')).toHaveCSS(
    'background-image',
    /kimo-mark\.svg/,
  );
  await expect(page.locator('.ui-avatar-mark').first()).toHaveCSS(
    'background-image',
    /kimo-mark\.svg/,
  );
  expect(await box('.studio-agent')).toMatchObject({
    x: 8,
    y: 48,
    width: 360,
    height: 668,
  });
  expect(await box('.studio-viewer')).toMatchObject({
    x: 376,
    y: 48,
    width: 1208,
    height: 668,
  });
  expect(await box('.studio-inspector')).toMatchObject({
    x: 1592,
    y: 48,
    width: 320,
    height: 668,
  });
  expect(await box('.studio-timeline')).toMatchObject({
    x: 8,
    y: 724,
    width: 1904,
    height: 320,
  });
  expect(await box('.studio-statusbar')).toMatchObject({
    x: 0,
    y: 1052,
    width: 1920,
    height: 28,
  });
  expect((await box('.studio-agent')).width).toBe(360);
  expect((await box('.studio-inspector')).width).toBe(320);
  expect((await box('.studio-timeline')).height).toBe(320);
  expect((await box('.studio-statusbar')).height).toBe(28);
  expect((await box('.studio-viewer')).x).toBe(376);
  expect((await box('.studio-timeline')).y).toBe(724);
  await page.screenshot({
    path: 'docs/screens/phase-05-studio-1920x1080.png',
    animations: 'disabled',
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await expect(
    page.getByText(/kimo is editing|kimo is thinking|waiting for you/).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'finish', exact: true }),
  ).toBeEnabled({ timeout: 15000 });
  await page.getByRole('button', { name: 'pause kimo' }).click();
  await expect(page.getByText('paused', { exact: true })).toBeVisible();
  await page.locator('.studio-clip').first().click();
  await expect(page.locator('.studio-inspector-title')).toContainText('clip ·');
  await page.getByRole('button', { name: 'untitled video' }).click();
  await page.getByRole('textbox', { name: 'project title' }).fill('my film');
  await page.getByRole('textbox', { name: 'project title' }).press('Enter');
  await expect(page.getByRole('button', { name: 'my film' })).toBeVisible();
  await page.getByRole('button', { name: 'my film' }).click();
  await page
    .getByRole('textbox', { name: 'project title' })
    .fill('discard this');
  await page.getByRole('textbox', { name: 'project title' }).press('Escape');
  await expect(page.getByRole('button', { name: 'my film' })).toBeVisible();
  await page.getByRole('button', { name: 'let kimo continue' }).click();
  const resizer = page.getByRole('slider', { name: 'resize agent panel' });
  await resizer.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.studio-agent')).toHaveCSS('width', '368px');
  await page.reload();
  await expect(page.locator('.studio-agent')).toHaveCSS('width', '368px');
  await page.getByRole('slider', { name: 'resize agent panel' }).dblclick();
  await expect(page.locator('.studio-agent')).toHaveCSS('width', '360px');
  const inspectorResize = page.getByRole('slider', {
    name: 'resize inspector',
  });
  await inspectorResize.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.studio-inspector')).toHaveCSS('width', '328px');
  await inspectorResize.dblclick();
  await expect(page.locator('.studio-inspector')).toHaveCSS('width', '320px');
  const timelineResize = page.getByRole('slider', { name: 'resize timeline' });
  await timelineResize.focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.studio-timeline')).toHaveCSS('height', '328px');
  await timelineResize.dblclick();
  await expect(page.locator('.studio-timeline')).toHaveCSS('height', '320px');
  await page.getByRole('button', { name: 'collapse timeline' }).click();
  await expect(page.locator('.studio-timeline')).toHaveCSS('height', '36px');
  await page.getByRole('button', { name: 'expand timeline' }).click();
  await page.getByRole('button', { name: 'collapse agent panel' }).click();
  await expect(
    page.getByRole('button', { name: 'expand agent panel' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'expand agent panel' }).click();
  await page.getByRole('button', { name: 'toggle inspector' }).click();
  await expect(page.getByRole('region', { name: 'inspector' })).toHaveCount(0);
  await page.keyboard.press('?');
  await expect(
    page.getByRole('dialog', { name: 'keyboard shortcuts' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('b');
  await expect(
    page.getByRole('button', { name: 'blade', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByRole('textbox', { name: 'tell kimo what to change' })
    .fill('abc');
  await expect(page.locator('.studio-composer')).toHaveCSS(
    'box-shadow',
    'none',
  );
  await expect(
    page.getByRole('textbox', { name: 'tell kimo what to change' }),
  ).toHaveCSS('box-shadow', 'none');
  await expect(
    page.getByRole('textbox', { name: 'tell kimo what to change' }),
  ).toHaveCSS('resize', 'none');
  await page.keyboard.press('v');
  await expect(
    page.getByRole('button', { name: 'blade', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});

for (const size of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`responsive ${size.width} × ${size.height}`, async ({
    page,
    request,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.setViewportSize(size);
    await studio(page, request);
    if (size.width === 390) {
      await expect(
        page.getByText('for full editing, open kimo on a bigger screen'),
      ).toBeVisible();
      await expect(
        page.getByRole('tab', { name: 'timeline', exact: true }),
      ).toBeVisible();
      await page.getByRole('tab', { name: 'timeline', exact: true }).click();
      await expect(
        page.getByRole('region', { name: 'timeline' }).last(),
      ).toBeVisible();
      await page
        .getByRole('tab', { name: 'chat', exact: true })
        .first()
        .click();
    } else {
      await expect(page.locator('.studio-agent')).toHaveCSS('width', '320px');
      await expect(page.locator('.studio-inspector')).toHaveCSS(
        'width',
        '280px',
      );
      await expect(page.locator('.studio-timeline')).toHaveCSS(
        'height',
        '280px',
      );
    }
    await page.screenshot({
      path: `docs/screens/phase-05-studio-${size.width}x${size.height}.png`,
      animations: 'disabled',
    });
    expect(errors).toEqual([]);
  });
}

test('inspector becomes an overlay at the compact desktop breakpoint', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await studio(page, request);
  await expect(page.locator('.studio-agent')).toHaveCSS('width', '300px');
  await expect(page.getByRole('region', { name: 'inspector' })).toHaveCount(0);
  await page.getByRole('button', { name: 'toggle inspector' }).click();
  const inspector = page.getByRole('region', { name: 'inspector' });
  await expect(inspector).toBeVisible();
  await expect(inspector).toHaveCSS('width', '320px');
});

test('agent events enable finish and show the review pulse', async ({
  page,
  request,
}) => {
  const response = await request.post('http://127.0.0.1:8787/v1/sessions', {
    data: { prompt: 'test', assetIds: [], aspect: 'auto' },
  });
  const { sessionId } = (await response.json()) as { sessionId: string };
  let socket: WebSocketRoute | undefined;
  await page.routeWebSocket('**/v1/sessions/*/ws', (route) => {
    socket = route;
  });
  await page.goto(`/dev/studio/${sessionId}`);
  await expect.poll(() => Boolean(socket)).toBe(true);
  const finish = page.getByRole('button', { name: 'finish', exact: true });
  await expect(finish).toBeDisabled();
  socket?.send(
    JSON.stringify({
      t: 'agent.action.start',
      id: 'action-test',
      tool: 'cut',
      title: 'cut',
      args: {},
    }),
  );
  await expect(finish).toBeEnabled();
  await expect(
    page.getByText('kimo is editing', { exact: false }),
  ).toBeVisible();
  socket?.send(
    JSON.stringify({
      t: 'agent.status',
      state: 'waiting_user',
      label: 'ready for your review',
    }),
  );
  await expect(page.getByText('waiting for you')).toBeVisible();
  await expect(finish).toHaveCSS('animation-iteration-count', '3');
});
