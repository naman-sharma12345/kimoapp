import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { applyOps, type KimoProject, type Op } from '@kimo/client';

interface ProjectState {
  project: KimoProject | null;
  replace: (project: KimoProject) => void;
  apply: (ops: Op[], version: number) => void;
}
export const useProjectStore = create<ProjectState>()(
  immer((set) => ({
    project: null,
    replace: (project) =>
      set((state) => {
        state.project = project;
      }),
    apply: (ops, version) =>
      set((state) => {
        if (state.project)
          state.project = applyOps(state.project, ops, version);
      }),
  })),
);
