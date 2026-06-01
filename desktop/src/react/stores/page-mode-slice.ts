export type PageMode = 'chat' | 'voice';

export interface PageModeSlice {
  currentPage: PageMode;
  setPageMode: (mode: PageMode) => void;
  togglePageMode: () => void;
}

export const createPageModeSlice = (
  set: (partial: Partial<PageModeSlice>) => void,
  get: () => PageModeSlice
): PageModeSlice => ({
  currentPage: 'chat',
  setPageMode: (mode) => set({ currentPage: mode }),
  togglePageMode: () => {
    const state = get();
    set({ currentPage: state.currentPage === 'chat' ? 'voice' : 'chat' });
  },
});
