import { create } from 'zustand';
import type { View } from '../core/view';

export interface TipRow {
  value?: string;
  label: string;
  color?: string;
  marked?: boolean;
}

export interface TipContent {
  head: string[];
  rows: TipRow[];
}

export interface UiState {
  hoveredPr: number | null;
  tip: TipContent | null;
  tipX: number;
  tipY: number;
  view: View | null;
  frameRequest: number;
  setHoveredPr(pr: number | null): void;
  setTip(tip: TipContent | null): void;
  moveTip(x: number, y: number): void;
  setView(view: View | null): void;
  requestFrame(): void;
}

export const useUi = create<UiState>((set) => ({
  hoveredPr: null,
  tip: null,
  tipX: 0,
  tipY: 0,
  view: null,
  frameRequest: 0,
  setHoveredPr: (hoveredPr) => set({ hoveredPr }),
  setTip: (tip) => set({ tip }),
  moveTip: (tipX, tipY) => set({ tipX, tipY }),
  setView: (view) => set({ view }),
  requestFrame: () => set((s) => ({ frameRequest: s.frameRequest + 1 })),
}));
