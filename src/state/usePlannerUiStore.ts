import { startOfDay } from "date-fns";
import { create } from "zustand";

interface PlannerUiState {
  currentAnchorDate: Date;
  editingTaskId: string | null;
  draggingTaskId: string | null;
  searchQuery: string;
  setCurrentAnchorDate: (date: Date) => void;
  setEditingTaskId: (id: string | null) => void;
  setDraggingTaskId: (id: string | null) => void;
  setSearchQuery: (value: string) => void;
  goToToday: () => void;
}

export const usePlannerUiStore = create<PlannerUiState>((set) => ({
  currentAnchorDate: startOfDay(new Date()),
  editingTaskId: null,
  draggingTaskId: null,
  searchQuery: "",
  setCurrentAnchorDate: (date) => set({ currentAnchorDate: startOfDay(date) }),
  setEditingTaskId: (editingTaskId) => set({ editingTaskId }),
  setDraggingTaskId: (draggingTaskId) => set({ draggingTaskId }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  goToToday: () => set({ currentAnchorDate: startOfDay(new Date()) }),
}));
