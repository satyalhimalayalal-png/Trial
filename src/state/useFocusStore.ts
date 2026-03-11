import { create } from "zustand";

export type FocusTimerSource = "stopwatch" | "pomodoro";

interface FocusState {
  activeSessionId: string | null;
  activeStartedAt: string | null;
  activeTaskId: string | null;
  activeSource: FocusTimerSource | null;
  setActive: (sessionId: string, startedAt: string, taskId?: string, source?: FocusTimerSource) => void;
  clearActive: () => void;
}

export const useFocusStore = create<FocusState>((set) => ({
  activeSessionId: null,
  activeStartedAt: null,
  activeTaskId: null,
  activeSource: null,
  setActive: (sessionId, startedAt, taskId, source) =>
    set({
      activeSessionId: sessionId,
      activeStartedAt: startedAt,
      activeTaskId: taskId ?? null,
      activeSource: source ?? null,
    }),
  clearActive: () =>
    set({ activeSessionId: null, activeStartedAt: null, activeTaskId: null, activeSource: null }),
}));
