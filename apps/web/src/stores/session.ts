import { create } from 'zustand';
import type { SessionSnapshot } from '@kimo/client';

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
  } | null;
  setDraft: (draft: SessionState['draft']) => void;
  setUploadStatus: (status: SessionState['uploadStatus']) => void;
  setWsUrl: (url: string | null) => void;
}
export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  status: null,
  wsUrl: null,
  uploadStatus: 'idle',
  draft: null,
  setSession: (sessionId, status) => set({ sessionId, status }),
  setWsUrl: (wsUrl) => set({ wsUrl }),
  setDraft: (draft) => set({ draft }),
  setUploadStatus: (uploadStatus) => set({ uploadStatus }),
  reset: () =>
    set({
      sessionId: null,
      status: null,
      wsUrl: null,
      uploadStatus: 'idle',
      draft: null,
    }),
}));
