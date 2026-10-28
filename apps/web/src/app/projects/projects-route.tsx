'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KimoClient } from '@kimo/client';
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

/**
 * /projects. There is no project-list endpoint yet, so a signed-in session
 * against the mock backend shows the demo library and a real session starts
 * empty. Signed-out visitors get the sign-in state.
 */
export function ProjectsRoute() {
  const router = useRouter();
  const client = useMemo(() => new KimoClient(), []);
  const [state, setState] = useState<ProjectsPageState>('loading');
  const [projects, setProjects] = useState<Project[]>([]);
  const [user, setUser] = useState<UserProfile | null>(null);
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
        if (session.mock) {
          setUser(MOCK_USER);
          setProjects([...INITIAL_PROJECTS]);
          setState('loaded');
        } else {
          setProjects([]);
          setState('empty');
        }
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
        await mockRenameProject(id, title);
        setProjects((list) =>
          list.map((p) => (p.id === id ? { ...p, title } : p)),
        );
      }}
      onDuplicate={async (id) => {
        const source = projects.find((p) => p.id === id);
        if (!source) throw new Error('project not found');
        const copy = await mockDuplicateProject(source);
        setProjects((list) => [copy, ...list]);
        return copy;
      }}
      onDelete={async (id) => {
        await mockDeleteProject(id);
        const index = projects.findIndex((p) => p.id === id);
        const project = projects[index];
        if (project) deleted.current.set(id, { project, index });
        setProjects((list) => list.filter((p) => p.id !== id));
      }}
      onUndoDelete={async (id) => {
        await mockUndoDeleteProject(id);
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
      onSignOut={() => router.push('/')}
    />
  );
}
