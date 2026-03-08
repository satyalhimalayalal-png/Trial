import { create } from "zustand";

interface FocusState {
  activeSessionId: string | null;
  activeStartedAt: string | null;
  activeTaskId: string | null;
  setActive: (sessionId: string, startedAt: string, taskId?: string) => void;
  clearActive: () => void;
}

export const useFocusStore = create<FocusState>((set) => ({
  activeSessionId: null,
  activeStartedAt: null,
  activeTaskId: null,
  setActive: (sessionId, startedAt, taskId) =>
    set({ activeSessionId: sessionId, activeStartedAt: startedAt, activeTaskId: taskId ?? null }),
  clearActive: () => set({ activeSessionId: null, activeStartedAt: null, activeTaskId: null }),
}));
