export type PageMode = 'chat' | 'channels' | 'voice';

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
    const modes: PageMode[] = ['chat', 'channels', 'voice'];
    const currentIndex = modes.indexOf(state.currentPage);
    const nextIndex = (currentIndex + 1) % modes.length;
    set({ currentPage: modes[nextIndex] });
  },
});
