import { StateCreator } from 'zustand';

export type PageMode = 'chat' | 'voice';

export interface PageModeSlice {
  /** 当前页面模式 */
  currentPage: PageMode;
  /** 设置页面模式 */
  setPageMode: (mode: PageMode) => void;
  /** 切换页面模式 */
  togglePageMode: () => void;
}

export const createPageModeSlice: StateCreator<
  PageModeSlice,
  [],
  [],
  PageModeSlice
> = (set) => ({
  currentPage: 'chat',
  setPageMode: (mode) => set({ currentPage: mode }),
  togglePageMode: () =>
    set((state) => ({
      currentPage: state.currentPage === 'chat' ? 'voice' : 'chat',
    })),
});
