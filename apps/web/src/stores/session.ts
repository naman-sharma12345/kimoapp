import { create } from 'zustand';
import type { SessionSnapshot } from '@kimo/client';
import { z } from 'zod';

const savedSession = z.object({
  version: z.literal(1),
  sessionId: z.string(),
  prompt: z.string(),
  assetLocalMap: z.record(z.string()),
  pendingRemovals: z.array(z.string()).optional(),
  aspect: z.enum(['auto', '16:9', '9:16', '1:1']),
  durationHint: z.number().positive().optional(),
  attachments: z.array(
    z.object({
      localId: z.string(),
      name: z.string(),
      size: z.number(),
      mime: z.string(),
    }),
  ),
});
export type SavedSession = z.infer<typeof savedSession>;
export const SESSION_STORAGE_KEY = 'kimo.session.v1';
function persist(record: SavedSession) {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* The in-memory edit stays usable in storage-restricted browsers. */
  }
}

interface SessionState {
  sessionId: string | null;
  status: SessionSnapshot['status'] | null;
  setSession: (id: string, status: SessionSnapshot['status']) => void;
  reset: () => void;
  wsUrl: string | null;
  uploadStatus: 'idle' | 'uploading' | 'complete' | 'failed';
  draft: {
    prompt: string;
    files: File[];
    aspect: 'auto' | '16:9' | '9:16' | '1:1';
    durationHint?: number;
    localIds?: string[];
  } | null;
  setDraft: (draft: SessionState['draft']) => void;
  setUploadStatus: (status: SessionState['uploadStatus']) => void;
  setWsUrl: (url: string | null) => void;
  saved: SavedSession | null;
  startSession: (record: Omit<SavedSession, 'version'>) => void;
  hydrate: () => SavedSession | null;
  removeAttachment: (localId: string) => void;
  acknowledgeRemoval: (sessionId: string, assetId: string) => void;
}
export const useSessionStore = create<SessionState>((set, get) => ({
  sessionId: null,
  status: null,
  wsUrl: null,
  uploadStatus: 'idle',
  draft: null,
  saved: null,
  startSession: (record) => {
    const saved = { ...record, version: 1 as const };
    persist(saved);
    set({ saved, sessionId: saved.sessionId, status: 'warming' });
  },
  hydrate: () => {
    if (get().saved) return get().saved;
    try {
      const value = sessionStorage.getItem(SESSION_STORAGE_KEY);
      const result = savedSession.safeParse(value ? JSON.parse(value) : null);
      if (result.success) {
        set({ saved: result.data, sessionId: result.data.sessionId });
        return result.data;
      }
    } catch {
      /* Ignore invalid or unavailable browser storage. */
    }
    return null;
  },
  removeAttachment: (localId) => {
    const current = get().saved;
    if (!current) return;
    const assetLocalMap = Object.fromEntries(
      Object.entries(current.assetLocalMap).filter(([id]) => id !== localId),
    );
    const saved = {
      ...current,
      assetLocalMap,
      pendingRemovals: [
        ...new Set([
          ...(current.pendingRemovals ?? []),
          ...[current.assetLocalMap[localId]].filter((id): id is string =>
            Boolean(id),
          ),
        ]),
      ],
      attachments: current.attachments.filter(
        (item) => item.localId !== localId,
      ),
    };
    persist(saved);
    set({ saved });
  },
  acknowledgeRemoval: (sessionId, assetId) => {
    const current = get().saved;
    if (!current || current.sessionId !== sessionId) return;
    const saved = {
      ...current,
      pendingRemovals: current.pendingRemovals?.filter((id) => id !== assetId),
    };
    persist(saved);
    set({ saved });
  },
  setSession: (sessionId, status) => set({ sessionId, status }),
  setWsUrl: (wsUrl) => set({ wsUrl }),
  setDraft: (draft) => set({ draft }),
  setUploadStatus: (uploadStatus) => set({ uploadStatus }),
  reset: () => {
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      /* Storage may be disabled. */
    }
    set({
      sessionId: null,
      status: null,
      wsUrl: null,
      uploadStatus: 'idle',
      draft: null,
      saved: null,
    });
  },
}));
