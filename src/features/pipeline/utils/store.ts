import { create } from 'zustand';

export type PipelineApplication = {
  id: string;
  companyId: string;
  companyName: string;
  roleTitle: string;
  status: string;
  excitementLevel: string | null;
  statusChangedAt: Date | string | null;
  source: string | null;
  referredById: string | null;
  referredByName: string | null;
};

type PipelineState = {
  applications: PipelineApplication[];
  draggedApp: string | null;
  setApplications: (apps: PipelineApplication[]) => void;
  setDraggedApp: (id: string | null) => void;
  moveApplication: (id: string, newStatus: string) => void;
};

export const usePipelineStore = create<PipelineState>((set) => ({
  applications: [],
  draggedApp: null,
  setApplications: (applications) => set({ applications }),
  setDraggedApp: (draggedApp) => set({ draggedApp }),
  moveApplication: (id, newStatus) =>
    set((state) => ({
      applications: state.applications.map((app) =>
        app.id === id ? { ...app, status: newStatus } : app
      )
    }))
}));
