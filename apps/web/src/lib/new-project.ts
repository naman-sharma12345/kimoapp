import { KimoApiError, type KimoClient } from '@kimo/client';

/** The "new video" entry point used by /projects, its shortcuts and nav. */
export const NEW_PROJECT_PATH = '/studio/new';
export const NEW_PROJECT_TITLE = 'untitled video';

export const isNewProjectId = (id: string) => id === 'new';

/** Where signed-out visitors go: sign-in, then straight back here. */
export const newProjectSignInHref = () =>
  `/signin?next=${encodeURIComponent(NEW_PROJECT_PATH)}`;

type Client = Pick<KimoClient, 'auth' | 'createProject'>;

let inflight: Promise<string> | null = null;

/**
 * Creates an empty project through POST /v1/projects (the same API the
 * library uses) and answers where to go next: the new project's studio,
 * sign-in for signed-out visitors, or the landing composer against the mock
 * backend, which has no project store. Nothing about media is sent: clips
 * are picked in the studio and stay in this tab. Concurrent calls (a double
 * click, a re-run effect) share one request, so only one project is made.
 */
export function startNewProject(client: Client): Promise<string> {
  inflight ??= create(client).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function create(client: Client): Promise<string> {
  const session = await client.auth();
  if (!session.signedIn) return newProjectSignInHref();
  if (session.mock) return '/';
  try {
    const { project } = await client.createProject({
      title: NEW_PROJECT_TITLE,
      aspect: '16:9',
    });
    return `/studio/${encodeURIComponent(project.sessionId)}`;
  } catch (caught) {
    if (caught instanceof KimoApiError && caught.status === 401)
      return newProjectSignInHref();
    throw caught;
  }
}
