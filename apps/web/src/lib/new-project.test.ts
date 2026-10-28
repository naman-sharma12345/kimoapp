import { describe, expect, it, vi } from 'vitest';
import { KimoApiError } from '@kimo/client';
import { safeNext } from './safe-next';
import {
  NEW_PROJECT_PATH,
  NEW_PROJECT_TITLE,
  newProjectSignInHref,
  startNewProject,
} from './new-project';

const project = {
  id: 'p-1',
  sessionId: 's/1',
  title: NEW_PROJECT_TITLE,
  prompt: '',
  status: 'draft',
  aspect: '16:9',
  durationSec: 0,
  clipCount: 0,
  trackCount: 0,
  createdAt: '2026-10-28T00:00:00.000Z',
  updatedAt: '2026-10-28T00:00:00.000Z',
} as const;

function client(
  auth: { signedIn: boolean; mock: boolean },
  create: () => Promise<unknown> = async () => ({ project }),
) {
  return {
    auth: vi.fn(async () => ({ remaining: 0, ...auth })),
    createProject: vi.fn(create),
  } as unknown as Parameters<typeof startNewProject>[0] & {
    auth: ReturnType<typeof vi.fn>;
    createProject: ReturnType<typeof vi.fn>;
  };
}

describe('/studio/new', () => {
  it('creates one empty project and opens its studio', async () => {
    const api = client({ signedIn: true, mock: false });
    const [a, b] = await Promise.all([
      startNewProject(api),
      startNewProject(api),
    ]);
    expect(a).toBe('/studio/s%2F1');
    expect(b).toBe(a);
    expect(api.createProject).toHaveBeenCalledTimes(1);
    // Only a title and aspect are sent: no media leaves the tab.
    expect(api.createProject).toHaveBeenCalledWith({
      title: NEW_PROJECT_TITLE,
      aspect: '16:9',
    });
  });

  it('sends signed-out visitors to sign-in with a safe return path', async () => {
    const api = client({ signedIn: false, mock: false });
    const href = await startNewProject(api);
    expect(href).toBe(newProjectSignInHref());
    expect(api.createProject).not.toHaveBeenCalled();
    const next = new URL(href, 'https://app.invalid').searchParams.get('next');
    expect(safeNext(next)).toBe(NEW_PROJECT_PATH);
  });

  it('falls back to sign-in when the session expired mid-create', async () => {
    const api = client({ signedIn: true, mock: false }, async () => {
      throw new KimoApiError(401, 'unauthorized', 'sign in');
    });
    expect(await startNewProject(api)).toBe(newProjectSignInHref());
  });

  it('uses the landing composer against the mock backend', async () => {
    const api = client({ signedIn: true, mock: true });
    expect(await startNewProject(api)).toBe('/');
    expect(api.createProject).not.toHaveBeenCalled();
  });

  it('surfaces other failures and lets the next try run', async () => {
    let fail = true;
    const api = client({ signedIn: true, mock: false }, async () => {
      if (fail) throw new KimoApiError(500, 'server_error', 'boom');
      return { project };
    });
    await expect(startNewProject(api)).rejects.toThrow('boom');
    fail = false;
    expect(await startNewProject(api)).toBe('/studio/s%2F1');
  });
});
