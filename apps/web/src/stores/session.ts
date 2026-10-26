import { create } from 'zustand';
import type { SessionSnapshot } from '@kimo/client';

interface SessionState {
  sessionId: string | null;
  status: SessionSnapshot['status'] | null;
  setSession: (id: string, status: SessionSnapshot['status']) => void;
  reset: () => void;
}
export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  status: null,
  setSession: (sessionId, status) => set({ sessionId, status }),
  reset: () => set({ sessionId: null, status: null }),
}));
