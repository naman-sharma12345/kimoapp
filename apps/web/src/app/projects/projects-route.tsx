'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KimoClient, type ApiProject } from '@kimo/client';
import ProjectsPage from '@/features/projects/pages/ProjectsPage';
import {
  INITIAL_PROJECTS,
  MOCK_USER,
  mockDeleteProject,
  mockDuplicateProject,
  mockRenameProject,
  mockUndoDeleteProject,
} from '@/features/projects/mock/projects';
import type {
  Project,
  ProjectsPageState,
  UserProfile,
} from '@/features/projects/types/projects';

function initials(name: string, email: string): string {
  const source = name.trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toLowerCase() || 'k';
}

const toProject = (project: ApiProject): Project => ({ ...project });

/**
 * /projects. Against the real API (api.getkimo.tech) the library, rename,
 * duplicate, delete and undo all go through /v1/projects. Against the mock
 * backend (local dev) the demo library and mock mutations are used.
 * Signed-out visitors get the sign-in state.
 */
export function ProjectsRoute() {
  const router = useRouter();
  const client = useMemo(() => new KimoClient(), []);
  const [state, setState] = useState<ProjectsPageState>('loading');
  const [projects, setProjects] = useState<Project[]>([]);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [mock, setMock] = useState(true);
  const deleted = useRef(
    new Map<string, { project: Project; index: number }>(),
  );

  const load = useCallback(() => {
    setState('loading');
    client
      .auth()
      .then((session) => {
        if (!session.signedIn) {
          setUser(null);
          setState('signed_out');
          return;
        }
        setMock(session.mock);
        if (session.mock) {
          setUser(MOCK_USER);
          setProjects([...INITIAL_PROJECTS]);
          setState('loaded');
          return;
        }
        return Promise.all([client.me(), client.projects()]).then(
          ([me, list]) => {
            setUser({
              name: me.user.name,
              email: me.user.email,
              avatarInitials: initials(me.user.name, me.user.email),
            });
            setProjects(list.projects.map(toProject));
            setState(list.projects.length ? 'loaded' : 'empty');
          },
        );
      })
      .catch(() => setState('error'));
  }, [client]);

  useEffect(load, [load]);

  const videoUrl = (videoId: string) =>
    `${window.location.origin}/v/${encodeURIComponent(videoId)}`;

  return (
    <ProjectsPage
      projects={
        state === 'loading' || state === 'error' || state === 'signed_out'
          ? null
          : projects
      }
      state={state === 'loaded' && projects.length === 0 ? 'empty' : state}
      user={user}
      onOpenStudio={(id) => router.push(`/studio/${encodeURIComponent(id)}`)}
      onOpenRender={(id) => router.push(`/render/${encodeURIComponent(id)}`)}
      onOpenVideo={(id) => router.push(`/v/${encodeURIComponent(id)}`)}
      onRename={async (id, title) => {
        if (mock) await mockRenameProject(id, title);
        else await client.updateProject(id, { title });
        setProjects((list) =>
          list.map((p) => (p.id === id ? { ...p, title } : p)),
        );
      }}
      onDuplicate={async (id) => {
        const source = projects.find((p) => p.id === id);
        if (!source) throw new Error('project not found');
        const copy = mock
          ? await mockDuplicateProject(source)
          : toProject((await client.duplicateProject(id)).project);
        setProjects((list) => [copy, ...list]);
        return copy;
      }}
      onDelete={async (id) => {
        if (mock) await mockDeleteProject(id);
        else await client.deleteProject(id);
        const index = projects.findIndex((p) => p.id === id);
        const project = projects[index];
        if (project) deleted.current.set(id, { project, index });
        setProjects((list) => list.filter((p) => p.id !== id));
      }}
      onUndoDelete={async (id) => {
        if (mock) await mockUndoDeleteProject(id);
        else await client.restoreProject(id);
        const cached = deleted.current.get(id);
        if (!cached) return;
        deleted.current.delete(id);
        setProjects((list) => {
          if (list.some((p) => p.id === id)) return list;
          const next = [...list];
          next.splice(Math.min(cached.index, next.length), 0, cached.project);
          return next;
        });
      }}
      onDownload={(id) => window.open(videoUrl(id), '_blank', 'noopener')}
      onCopyLink={(id) => void navigator.clipboard?.writeText(videoUrl(id))}
      onStartWithFiles={() => router.push('/')}
      onRetry={load}
      onSignIn={() => router.push('/signin?next=%2Fprojects')}
      onSignOut={() => {
        const leave = () => router.push('/');
        if (mock) leave();
        else void client.signOut().then(leave, leave);
      }}
    />
  );
}
