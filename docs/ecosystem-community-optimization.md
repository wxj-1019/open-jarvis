# 生态社区优化方案

> **日期**: 2026年6月2日
> **状态**: 规划中
> **优先级**: P1 — 生态冷启动关键路径

---

## 现状诊断

### 生态基础设施成熟度

| 维度 | 成熟度 | 关键发现 |
|------|--------|----------|
| 插件市场 | 4/5 | OH-Plugins 仓库 + marketplace.json + 前端浏览组件 |
| MCP 注册表 | 4/5 | 连接官方 registry + 15 个内置 fallback + 前端浏览器 |
| 技能安装 | 4/5 | GitHub 拉取 + LLM 安全审查 + star 门槛 |
| 技能分享 | 2/5 | 本地导出/导入完善，无在线平台 |
| Agent 分享 | 3/5 | Character Card 导出/导入完善，缺在线市场 |
| 云同步 | 1/5 | `cloud` 连接类型已定义但实现为零 |
| 用户系统 | 2/5 | 本地认证完善，云端同步/社区身份完全缺失 |

### 核心短板

1. **无统一发现入口**：插件、MCP、技能、角色卡分散在不同位置，用户需分别查找
2. **无社区互动层**：项目中 `rating`、`review`、`comment`、`vote` 在生态文件中零结果
3. **无云端同步基础设施**：`cloud` 连接类型在 `studio-access-contract.js` 中已定义，实际实现为零

---

## Phase 1：统一发现入口（P0）

> 目标：一个入口发现所有生态内容

### 1.1 统一市场 UI

**现状**：
- 插件：`PluginMarketplaceTab.tsx` — 完整的浏览/安装/更新 UI
- MCP：`RegistryBrowser.tsx` — 注册表浏览组件
- 技能：`SkillsTab.tsx` — 仅本地管理，无浏览
- 角色卡：无浏览入口

**改造方案**：

```
Marketplace（统一入口）
  ├─ Tab: 插件 (已有 PluginMarketplaceTab)
  ├─ Tab: MCP 服务器 (已有 RegistryBrowser)
  ├─ Tab: 技能 (新建 SkillsMarketplaceTab)
  └─ Tab: 角色卡 (新建 CharacterCardsTab)
```

**涉及文件**：
- 新建 `desktop/src/react/settings/tabs/MarketplaceTab.tsx` — 统一入口容器
- 新建 `desktop/src/react/settings/tabs/marketplace/SkillsMarketplace.tsx` — 技能浏览
- 新建 `desktop/src/react/settings/tabs/marketplace/CharacterCards.tsx` — 角色卡浏览
- `desktop/src/react/settings/tabs/Settings.tsx` — 添加 Marketplace 入口

**验收标准**：
- 一个 Tab 页内可浏览插件/MCP/技能/角色卡
- 每个分类有搜索、筛选、排序功能

### 1.2 技能在线索引

**现状**：无集中式技能注册表

**改造方案**：
- 创建 `openjarvis-skills` GitHub 仓库（类似 OH-Plugins）
- 仓库结构：

```
openjarvis-skills/
  skills-index.json          # 技能索引
  categories.json            # 分类定义
  skills/
    coding-assistant/
      SKILL.md
      metadata.json
    data-analyst/
      SKILL.md
      metadata.json
    ...
```

- `skills-index.json` 格式：

```json
{
  "version": 1,
  "updated": "2026-06-02T00:00:00Z",
  "skills": [
    {
      "id": "coding-assistant",
      "name": "Coding Assistant",
      "description": "代码辅助技能",
      "category": "development",
      "author": "liliMozi",
      "tags": ["coding", "development"],
      "source": "github:liliMozi/openjarvis-skills/skills/coding-assistant",
      "downloads": 0,
      "rating": 0
    }
  ]
}
```

**涉及文件**：
- 新建 `lib/skill-marketplace.js` — 技能市场后端（拉取索引、搜索）
- 新建 `server/routes/skill-marketplace.js` — API 路由
- `desktop/src/react/settings/tabs/marketplace/SkillsMarketplace.tsx` — 前端浏览

**验收标准**：
- 前端展示远程技能列表
- 支持按名称/分类/标签搜索
- 离线时 fallback 到本地缓存

### 1.3 技能一键安装

**现状**：仅支持 GitHub URL 或本地文件

**改造方案**：
- 市场浏览 → 点击"安装" → 拉取 SKILL.md → LLM 安全审查 → 写入本地 → 启用
- 复用现有 `install-skill.js` 的安全审查逻辑
- 添加安装进度展示（下载中 → 审查中 → 安装中 → 完成）

**涉及文件**：
- `lib/tools/install-skill.js` — 扩展支持从索引安装
- `desktop/src/react/settings/tabs/marketplace/SkillsMarketplace.tsx` — 安装按钮和进度

**验收标准**：
- 一键安装，全过程 <10s
- 安装失败时展示错误原因
- 安全审查拒绝时提示风险

---

## Phase 2：社区互动层（P1）

> 目标：连接创作者与消费者，形成反馈闭环

### 2.1 评分/投票机制

**方案**：利用 GitHub 基础设施代理社区信号

**数据来源**：

| 信号 | 来源 | 实现方式 |
|------|------|----------|
| 下载量 | 本地统计 | 客户端安装时 +1，定期汇总到索引 |
| 评分 | GitHub Issues with `rating` label | 用户提交评分时自动创建 Issue |
| 投票 | GitHub Stars | 每个技能/插件对应一个 GitHub 仓库或目录 |
| 评论 | GitHub Issues | 前端链接到对应 Issue 页面 |

**索引扩展格式**：

```json
{
  "id": "coding-assistant",
  "stats": {
    "downloads": 1523,
    "stars": 47,
    "rating": 4.5,
    "ratingCount": 12
  }
}
```

**涉及文件**：
- `lib/skill-marketplace.js` — 添加统计聚合逻辑
- `desktop/src/react/settings/tabs/marketplace/` — 展示评分/下载量

**验收标准**：
- 市场中展示下载量、评分、星标数
- 用户可跳转到 GitHub 提交反馈

### 2.2 创作者身份

**方案**：关联 GitHub 用户信息

- 索引中每个条目包含 `author` 字段（GitHub username）
- 前端展示 "by @username" 并链接到 GitHub Profile
- 支持按创作者筛选

**索引格式扩展**：

```json
{
  "author": {
    "github": "liliMozi",
    "name": "A-Jie"
  }
}
```

### 2.3 技能/插件提交流程

**方案**：CLI 命令 + 自动化 PR

```bash
# 提交技能到社区
hana publish skill ./my-skill/SKILL.md

# 提交插件到社区
hana publish plugin ./my-plugin/
```

**流程**：
1. CLI 校验 SKILL.md 格式和内容
2. LLM 安全审查
3. Fork 索引仓库 → 创建分支 → 提交 PR
4. 自动化 CI 校验（格式、安全、大小限制）
5. 维护者审核 → 合并 → 索引更新

**涉及文件**：
- 新建 `cli/commands/publish.js` — publish 命令
- 新建 `.github/workflows/skill-review.yml` — CI 自动审查

**验收标准**：
- 一条命令完成提交
- CI 自动校验通过/失败
- PR 包含完整的变更描述

### 2.4 使用统计

**方案**：本地匿名统计

- 记录事件：安装、使用、卸载
- 本地 SQLite 存储，不上传原始数据
- 定期（每周）汇总匿名统计数据到索引仓库（通过 GitHub API）
- 用户可在设置中关闭统计

**涉及文件**：
- 新建 `lib/telemetry/marketplace-stats.js` — 统计收集器
- `desktop/src/react/settings/tabs/PrivacyTab.tsx` — 统计开关

---

## Phase 3：云端同步基础设施（P2）

> 目标：跨设备配置同步，本地优先

### 3.1 本地优先同步架构

**设计原则**：
- 本地优先：所有数据先写入本地
- 不上传云端：使用 P2P 或自托管同步
- E2E 加密：敏感数据加密后同步

**同步方案选择**：

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| Syncthing | P2P、开源、无需服务器 | 需额外安装 | ⭐⭐⭐⭐ |
| WebDAV | 标准协议、自托管 | 需配置服务器 | ⭐⭐⭐ |
| CRDT (Yjs) | 无冲突合并、实时 | 实现复杂 | ⭐⭐⭐ |
| Dropbox/OneDrive | 用户熟悉 | 依赖第三方 | ⭐⭐ |
| Git 仓库 | 版本管理 | 冲突处理复杂 | ⭐⭐⭐ |

**推荐方案**：Syncthing + Git 仓库混合

```
同步内容：
  ├─ Agent 配置 (yuan/*.yaml) → Git 仓库
  ├─ 技能列表和偏好 → Syncthing
  ├─ 记忆数据库 (facts.db) → Syncthing
  └─ 角色卡收藏 → Git 仓库
```

**涉及文件**：
- 新建 `lib/sync/sync-manager.js` — 同步管理器
- 新建 `lib/sync/syncthing-adapter.js` — Syncthing 集成
- `desktop/src/react/settings/tabs/SyncTab.tsx` — 同步设置 UI

### 3.2 跨设备配置同步

**最小可用方案（无外部依赖）**：

```
导出配置包 → 包含：
  ├─ agents/          # Agent 配置
  ├─ skills/          # 已安装技能列表
  ├─ preferences/     # 用户偏好
  ├─ marketplace/     # 收藏/已购
  └─ manifest.json    # 版本和时间戳
```

- "设置" → "同步" → "导出配置包" → 生成 `.jarvis-sync.zip`
- 在新设备 "导入配置包" → 自动恢复

**涉及文件**：
- 新建 `lib/sync/config-packager.js` — 配置打包/解包
- `server/routes/sync.js` — API 路由
- `desktop/src/react/settings/tabs/SyncTab.tsx` — UI

### 3.3 在线收藏/书签

**方案**：
- 市场中"收藏"技能/插件/角色卡
- 收藏列表存储在本地，可通过配置包同步
- 收藏数量展示在市场条目上（作为热度信号）

### 3.4 角色卡在线托管

**现状**：Character Card 只能本地导出 `.hana-package.zip` 手动分享

**改造方案**：
- 导出 → 上传到 GitHub Gist → 生成分享链接
- 分享链接格式：`https://openjarvis.app/card/<gist-id>`
- 链接页面展示角色卡预览 + "导入到 Jarvis" 按钮
- 市场中展示社区角色卡

**涉及文件**：
- `lib/character-cards/service.js` — 扩展 `exportToGist()` 方法
- 新建 `desktop/src/react/settings/tabs/marketplace/CharacterCards.tsx` — 浏览社区角色卡

---

## Phase 4：生态成熟度（P3）

> 目标：企业级安全 + 依赖管理 + 质量评估

### 4.1 插件沙盒隔离

**现状**：`restricted` 模式仅靠约定，无进程级隔离

**改造方案**：
- `restricted` 插件运行在 Worker Thread 中
- 限制文件系统访问（白名单路径）
- 限制网络访问（白名单域名）
- CPU/内存配额限制

**涉及文件**：
- `core/plugin-manager.js` — 添加 Worker Thread 隔离模式
- 新建 `lib/plugin-sandbox/` — 插件沙箱运行时

### 4.2 技能依赖管理

**方案**：
- SKILL.md 支持 `requires` frontmatter：

```yaml
---
name: data-analyst
requires:
  - skills: python-runner
  - plugins: mcp/sqlite
  - tools: bash
---
```

- 安装时自动检查依赖
- 缺少依赖时提示安装
- 冲突检测（A requires X v1, B requires X v2）

### 4.3 版本管理与更新

**方案**：
- 技能/插件版本号遵循 semver
- 索引中记录每个版本的发布时间和变更日志
- 客户端定期检查更新（可配置频率）
- 一键更新 + 回滚

**索引格式扩展**：

```json
{
  "id": "coding-assistant",
  "versions": [
    {
      "version": "1.2.0",
      "released": "2026-06-01",
      "changelog": "添加 TypeScript 支持",
      "source": "github:liliMozi/openjarvis-skills/skills/coding-assistant/v1.2.0"
    }
  ]
}
```

### 4.4 MCP 服务器健康检测

**方案**：
- 定期（每小时）ping 注册表中的 MCP 服务器
- 记录响应时间和可用性
- 前端展示健康状态（🟢 在线 / 🟡 缓慢 / 🔴 离线）
- 不可用时前端提示

### 4.5 技能质量评估

**方案**：
- 基于已有的 `improve_description.py` 扩展
- 自动评估维度：
  - 描述清晰度（LLM 评分）
  - 触发准确率（测试用例匹配）
  - 安全评分（LLM 审查）
  - 用户评分（社区反馈）
- 评估结果展示在市场中

---

## 技术选型参考

| 模块 | 推荐方案 | 备选方案 |
|------|----------|----------|
| 索引托管 | GitHub 仓库 + JSON | Git LFS / 自建 API |
| 社区信号 | GitHub Stars/Issues | 自建投票系统 |
| 同步协议 | Syncthing | CRDT (Yjs) / WebDAV |
| 角色卡托管 | GitHub Gist | IPFS / 自建 CDN |
| 提交流程 | GitHub CLI + PR | 自建 Web 表单 |
| 插件隔离 | Worker Thread | 子进程 + IPC |
| 版本管理 | semver + git tags | CalVer |

---

## 实施建议

### 快速启动路线（最小可用）

1. **创建 `openjarvis-skills` 仓库** + 初始 10-20 个高质量技能
2. **统一市场 UI** — 复用已有插件市场组件，添加技能和角色卡 Tab
3. **一键安装** — 从索引拉取 → 安全审查 → 启用
4. **提交 PR 流程** — CLI 命令 + GitHub Actions 自动审查

### 长期路线

```
Month 1-2: Phase 1（统一入口）
Month 3-4: Phase 2（社区互动）
Month 5-6: Phase 3（云同步）
Month 7+:   Phase 4（生态成熟）
```

### 成功指标

| 指标 | 当前 | 3个月目标 | 6个月目标 |
|------|------|-----------|-----------|
| 社区技能数 | 0 | 30+ | 100+ |
| 社区插件数 | 2 | 10+ | 30+ |
| MCP 服务器数 | 15 (内置) | 25+ | 50+ |
| 社区角色卡数 | 0 | 10+ | 50+ |
| 月活贡献者 | 0 | 5+ | 20+ |
