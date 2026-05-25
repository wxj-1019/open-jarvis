/**
 * schemas.js — TypeBox 请求体 Schema 定义
 * 用于 API 路由参数校验，配合 validate.js 使用
 */
import { Type } from "typebox";

// ── 日志 ──
export const LogBody = Type.Object({
  level: Type.Optional(Type.String()),
  module: Type.Optional(Type.String()),
  message: Type.String(),
});

// ── 计划模式 ──
export const PlanModeBody = Type.Object({
  enabled: Type.Optional(Type.Boolean()),
  mode: Type.Optional(Type.String()),
});

// ── 会话 ──
export const SessionNewBody = Type.Object({
  cwd: Type.Optional(Type.String()),
  memoryEnabled: Type.Optional(Type.Boolean()),
  agentId: Type.Optional(Type.String()),
  currentSessionPath: Type.Optional(Type.String()),
  workspaceFolders: Type.Optional(Type.Array(Type.String())),
  currentAgentId: Type.Optional(Type.String()),
});

export const SessionRenameBody = Type.Object({
  path: Type.String(),
  title: Type.String(),
});

export const SessionPinBody = Type.Object({
  path: Type.String(),
  pinned: Type.Boolean(),
});

export const SessionSwitchBody = Type.Object({
  path: Type.String(),
  currentSessionPath: Type.Optional(Type.String()),
});

// ── Agent ──
export const AgentCreateBody = Type.Object({
  name: Type.String(),
  id: Type.Optional(Type.String()),
  yuan: Type.Optional(Type.String()),
});

export const AgentSwitchBody = Type.Object({
  id: Type.String(),
});

export const AgentOrderBody = Type.Object({
  order: Type.Array(Type.String()),
});

export const AgentPrimaryBody = Type.Object({
  id: Type.String(),
});

// ── 配置 ──
export const ConfigRecentWorkspaceBody = Type.Object({
  path: Type.String(),
});

// ── Desk ──
export const DeskCronBody = Type.Object({
  action: Type.Union([
    Type.Literal("add"),
    Type.Literal("remove"),
    Type.Literal("toggle"),
    Type.Literal("update"),
  ]),
  scheduleType: Type.Optional(Type.String()),
  schedule: Type.Optional(Type.String()),
  prompt: Type.Optional(Type.String()),
  label: Type.Optional(Type.String()),
  model: Type.Optional(Type.String()),
  actorAgentId: Type.Optional(Type.String()),
  executionContext: Type.Optional(Type.String()),
  id: Type.Optional(Type.String()),
});

// ── 搜索验证 ──
export const SearchVerifyBody = Type.Object({
  provider: Type.String(),
  api_key: Type.Optional(Type.String()),
  search_provider: Type.Optional(Type.String()),
});

// ── 头像上传 ──
export const AvatarUploadBody = Type.Object({
  data: Type.String(),
});

// ── 通用内容 ──
export const ContentBody = Type.Object({
  content: Type.String(),
});

// ── 置顶消息 ──
export const PinsBody = Type.Object({
  pins: Type.Array(Type.String()),
});

// ── Agent 部分更新（松散校验） ──
export const AgentUpdateBody = Type.Object({
  name: Type.Optional(Type.String()),
  yuan: Type.Optional(Type.String()),
});

// ── 会话路径（通用） ──
export const SessionPathBody = Type.Object({
  path: Type.Optional(Type.String()),
  sessionPath: Type.Optional(Type.String()),
});

// ── 重播最新消息 ──
export const SessionReplayBody = Type.Object({
  path: Type.Optional(Type.String()),
  sessionPath: Type.Optional(Type.String()),
  sourceEntryId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  clientMessageId: Type.Optional(Type.String()),
  text: Type.Optional(Type.String()),
  uiContext: Type.Optional(Type.Any()),
  displayMessage: Type.Optional(Type.Any()),
});

// ── 会话清理 ──
export const SessionCleanupBody = Type.Object({
  maxAgeDays: Type.Optional(Type.Number()),
});

// ── 确认 ──
export const ConfirmBody = Type.Object({
  action: Type.Union([Type.Literal("confirmed"), Type.Literal("rejected")]),
  value: Type.Optional(Type.String()),
});

// ── 技能包 ──
export const SkillBundleBody = Type.Object({
  name: Type.String(),
  skillNames: Type.Array(Type.String()),
});

export const SkillBundleOrderBody = Type.Object({
  bundleIds: Type.Array(Type.String()),
});

// ── 技能启用/停用 ──
export const SkillEnabledBody = Type.Object({
  enabled: Type.Array(Type.String()),
});

export const SkillToggleBody = Type.Object({
  enabled: Type.Boolean(),
});

// ── 技能外部路径 ──
export const SkillPathsBody = Type.Object({
  paths: Type.Array(Type.String()),
});

// ── 技能翻译 ──
export const SkillTranslateBody = Type.Object({
  names: Type.Array(Type.String()),
  lang: Type.String(),
  agentId: Type.String(),
});

// ── 浏览器关闭 ──
export const SessionBrowserCloseBody = Type.Object({
  sessionPath: Type.String(),
});

// ── 频道 ──
export const ChannelCreateBody = Type.Object({
  name: Type.String(),
  description: Type.Optional(Type.String()),
  members: Type.Optional(Type.Array(Type.String())),
  intro: Type.Optional(Type.String()),
});

export const ChannelPhoneModeBody = Type.Object({
  mode: Type.String(),
});

export const ChannelMemberBody = Type.Object({
  memberId: Type.String(),
});

export const ChannelMessageBody = Type.Object({
  body: Type.String(),
});

export const ChannelBookmarkBody = Type.Object({
  timestamp: Type.String(),
});

export const ChannelToggleBody = Type.Object({
  enabled: Type.Boolean(),
});

// ── Bridge ──
export const BridgeOwnerBody = Type.Object({
  platform: Type.String(),
  userId: Type.Optional(Type.String()),
});

export const BridgeSettingsBody = Type.Object({
  readOnly: Type.Optional(Type.Boolean()),
  receiptEnabled: Type.Optional(Type.Boolean()),
});

export const BridgeStopBody = Type.Object({
  platform: Type.String(),
});

export const BridgeMediaBody = Type.Object({
  platform: Type.String(),
  chatId: Type.String(),
  filePath: Type.String(),
});

export const BridgeQrcodeBody = Type.Object({
  qrcodeId: Type.String(),
});

// ── Web 认证 ──
export const WebAuthBody = Type.Object({
  credential: Type.Optional(Type.String()),
});

// ── 上传 ──
export const UploadPathsBody = Type.Object({
  paths: Type.Array(Type.String()),
  sessionPath: Type.Optional(Type.String()),
});
