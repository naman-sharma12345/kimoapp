import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { KimoClient, aiHeaders, type AiCredentials } from '@kimo/client';
import {
  AI_KEY_NOTE,
  AiSettings,
  activeAi,
  readAiChoice,
} from '../components/studio/ai-settings';

const KEY = 'sk-test-SECRET-abcdef123456';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (media: string) => ({
      matches: false,
      media,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('PointerEvent', MouseEvent);
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.scrollIntoView = () => undefined;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

function Harness({ onValue }: { onValue?: (value: AiCredentials) => void }) {
  const [value, setValue] = useState<AiCredentials>({
    provider: 'openai',
    key: '',
    model: '',
  });
  return (
    <AiSettings
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

/** Everything the browser could persist, flattened to one string. */
function persisted() {
  const dump: string[] = [document.cookie];
  for (const store of [localStorage, sessionStorage])
    for (let index = 0; index < store.length; index++) {
      const name = store.key(index) ?? '';
      dump.push(name, store.getItem(name) ?? '');
    }
  return dump.join('\n');
}

describe('bring your own ai key', () => {
  it('keeps the key in memory only, loads real models and remembers only provider and model', async () => {
    const calls: { url: string; headers: Headers }[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      calls.push({ url: String(input), headers: new Headers(init?.headers) });
      return Response.json({
        models: [{ id: 'claude-a', name: 'Claude A' }, { id: 'claude-b' }],
      });
    });
    let latest: AiCredentials | undefined;
    const user = userEvent.setup();
    render(<Harness onValue={(value) => (latest = value)} />);
    await user.click(screen.getByRole('button', { name: 'ai settings' }));
    await screen.findByRole('dialog', { name: 'ai settings' });
    expect(screen.getByText(AI_KEY_NOTE)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('provider'), 'anthropic');
    const key = screen.getByLabelText('api key');
    expect(key.getAttribute('type')).toBe('password');
    expect(key.getAttribute('autocomplete')).toBe('off');
    await user.type(key, KEY);
    await user.click(screen.getByRole('button', { name: 'load models' }));
    await waitFor(() => expect(screen.getByLabelText('model')).toBeTruthy());
    expect(calls[0]?.url).toContain('/v1/ai/models');
    expect(calls[0]?.headers.get('X-AI-Key')).toBe(KEY);
    expect(calls[0]?.headers.get('X-AI-Provider')).toBe('anthropic');
    expect(latest?.model).toBe('claude-a');
    expect(latest && activeAi(latest)).toBeTruthy();
    expect(persisted()).not.toContain(KEY);
    expect(readAiChoice()).toEqual({
      provider: 'anthropic',
      model: 'claude-a',
    });
    await user.click(screen.getByRole('button', { name: 'forget key' }));
    expect(latest?.key).toBe('');
  });

  it('shows a clean message when the provider refuses the key, and allows a typed model id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json(
        { code: 'ai_key_rejected', message: 'The provider refused that key' },
        { status: 400 },
      ),
    );
    let latest: AiCredentials | undefined;
    const user = userEvent.setup();
    render(<Harness onValue={(value) => (latest = value)} />);
    await user.click(screen.getByRole('button', { name: 'ai settings' }));
    await user.type(await screen.findByLabelText('api key'), KEY);
    await user.click(screen.getByRole('button', { name: 'load models' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'the provider refused that key. check it and try again.',
    );
    await user.type(screen.getByLabelText('model id'), 'gpt-x');
    expect(latest?.model).toBe('gpt-x');
    expect(persisted()).not.toContain(KEY);
  });

  it('needs a key, a model and a base url for custom before it is used', () => {
    expect(activeAi({ provider: 'openai', key: '', model: 'm' })).toBeNull();
    expect(activeAi({ provider: 'openai', key: KEY, model: '' })).toBeNull();
    expect(activeAi({ provider: 'custom', key: KEY, model: 'm' })).toBeNull();
    expect(
      activeAi({
        provider: 'custom',
        key: KEY,
        model: 'm',
        baseUrl: 'https://llm.example.com/v1',
      }),
    ).toBeTruthy();
  });

  it('sends the key per request in headers only, never in the body', async () => {
    const seen: { headers: Headers; body: string }[] = [];
    const client = new KimoClient('https://api.test', async (_input, init) => {
      seen.push({
        headers: new Headers(init?.headers),
        body: String(init?.body ?? ''),
      });
      return new Response(null, { status: 202 });
    });
    await client.message(
      'session-1',
      { text: 'tighten it' },
      { provider: 'groq', key: KEY, model: 'llama' },
    );
    expect(seen[0]?.headers.get('X-AI-Key')).toBe(KEY);
    expect(seen[0]?.headers.get('X-AI-Model')).toBe('llama');
    expect(seen[0]?.body).not.toContain(KEY);
    await client.message('session-1', { text: 'again' });
    expect(seen[1]?.headers.get('X-AI-Key')).toBeNull();
    expect(
      aiHeaders({
        provider: 'openai',
        key: KEY,
        model: 'm',
        baseUrl: 'https://x.example',
      })['X-AI-Base-URL'],
    ).toBeUndefined();
  });
});
