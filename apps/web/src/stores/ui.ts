import { create } from 'zustand';

interface UiState {
  inspectorOpen: boolean;
  setInspectorOpen: (open: boolean) => void;
}
export const useUiStore = create<UiState>((set) => ({
  inspectorOpen: false,
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
}));
