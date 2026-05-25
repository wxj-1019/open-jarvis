/**
 * gui-whitelist-slice.ts - GUI 白名单请求状态管理
 */

import { StateCreator } from 'zustand';

export interface GuiWhitelistRequest {
  executable: string;
  currentWhitelist: string[];
}

export interface GuiWhitelistSlice {
  guiWhitelistRequest: GuiWhitelistRequest | null;
}

export const createGuiWhitelistSlice: StateCreator<
  GuiWhitelistSlice,
  [],
  [],
  GuiWhitelistSlice
> = () => ({
  guiWhitelistRequest: null,
});
