import { describe, it, expect } from 'vitest';
import { create } from 'zustand';
import { createPageModeSlice, type PageModeSlice } from '../page-mode-slice';

const createStore = () =>
  create<PageModeSlice>()((set, get) => ({
    ...createPageModeSlice(set, get),
  }));

describe('page-mode-slice', () => {
  it('should initialize with chat mode', () => {
    const store = createStore();
    expect(store.getState().currentPage).toBe('chat');
  });

  it('should set page mode to voice', () => {
    const store = createStore();
    store.getState().setPageMode('voice');
    expect(store.getState().currentPage).toBe('voice');
  });

  it('should toggle through all three modes', () => {
    const store = createStore();
    
    store.getState().togglePageMode();
    expect(store.getState().currentPage).toBe('channels');
    
    store.getState().togglePageMode();
    expect(store.getState().currentPage).toBe('voice');
    
    store.getState().togglePageMode();
    expect(store.getState().currentPage).toBe('chat');
  });

  it('should set page mode to channels', () => {
    const store = createStore();
    store.getState().setPageMode('channels');
    expect(store.getState().currentPage).toBe('channels');
  });
});
