# 语音对话页面切换功能设计文档

**日期**: 2026-05-30  
**状态**: 待审查  
**作者**: AI Assistant

## 1. 概述

为 OpenJarvis 桌面应用添加文字对话和语音对话页面之间的切换功能，使用顶部工具栏的标签式切换按钮，提供科幻风格的动画效果。

### 1.1 用户需求
- 在页面最顶部可以在文字对话和语音对话之间切换
- 切换时使用独立页面模式（不是浮层或分屏）
- 使用标签式切换按钮
- 动画效果要有科幻感，符合 Jarvis 风格，不要过度 AI 化

### 1.2 成功标准
- 用户可以通过顶部标签在两种模式间流畅切换
- 动画效果精致但不浮夸
- 语音对话状态在切换时得到妥善保存和恢复
- 完整的 i18n 支持（中文/英文）

## 2. 架构设计

### 2.1 核心思路
使用 Zustand store 管理页面模式状态，`AppPages` 根据状态渲染不同页面。

### 2.2 数据流
```
用户点击顶部标签
    ↓
更新 Store (currentPage: 'chat' | 'voice')
    ↓
AppPages 监听状态变化
    ↓
条件渲染 ChatPage 或 VoiceChatPage
```

### 2.3 新增组件
- `PageModeTabs` - 顶部页面模式切换标签组件
- `VoiceChatPage` - 语音对话页面容器

### 2.4 修改组件
- `AppPages.tsx` - 添加页面模式切换逻辑
- `stores/index.ts` - 注册新的 page-mode-slice

## 3. 状态管理设计

### 3.1 新增 Slice: `page-mode-slice.ts`

```typescript
interface PageModeSlice {
  currentPage: 'chat' | 'voice';
  setPageMode: (mode: 'chat' | 'voice') => void;
  togglePageMode: () => void;
}
```

### 3.2 状态流转
- 初始化：`'chat'`（默认显示聊天页面）
- 点击语音标签：`setPageMode('voice')` → 切换到语音页面
- 点击文字标签：`setPageMode('chat')` → 切换回聊天页面
- 语音对话结束时：保持在 `'voice'` 状态

### 3.3 Store 集成
- 在 `stores/index.ts` 中导入并注册 `createPageModeSlice`
- 添加到 `StoreState` 类型联合中

## 4. UI 组件设计

### 4.1 PageModeTabs 组件

**位置**: `desktop/src/react/components/PageModeTabs.tsx`

**设计理念**: 全息投影风格的切换效果

**布局**:
```
┌─────────────────────────────────────────────┐
│  OpenJarvis    ╔══════════╗ ════════════  ⚙️ │
│                ║ 💬 文字  ║   🎙️ 语音
│                ╚══════════╝ ════════════
└─────────────────────────────────────────────┘
```

**动画效果**:
1. **切换动画**: 标签切换时，激活态背景使用 `clip-path` 动画从左侧扫描到右侧
2. **脉冲光效**: 激活标签的边框有微弱的呼吸光效果（2s 周期，透明度 0.6→1→0.6）
3. **图标动画**: 语音图标在激活时有缓慢的旋转效果（象征"聆听"）
4. **颜色方案**: 使用项目主题色 `#537D96` 的渐变

**CSS 关键技术**:
- `@keyframes` + `animation` 实现脉冲和扫描效果
- `clip-path: inset()` 实现光线扫描
- `background: linear-gradient()` + `background-size` 实现流光效果
- `transform` + `transition` 实现平滑切换

### 4.2 VoiceChatPage 组件

**位置**: `desktop/src/react/components/app/VoiceChatPage.tsx`

**设计理念**: 科幻布局，克制使用动画

**功能**:
- 包装 VoiceChatOverlay 作为页面级组件
- 添加页面布局容器
- 处理语音对话的生命周期

**动画层次**:
1. **L1（基础）**: 页面切换使用 `transform: scale(0.95→1)` + `opacity`
2. **L2（状态）**: 状态图标使用 SVG `stroke-dasharray` 动画
3. **L3（细节）**: 按钮 hover 时使用 `box-shadow` 光晕扩散
4. **L4（氛围）**: 背景网格 + 微弱的扫描线效果（可选开关）

**克制原则**:
- ✅ 动画时长 ≥ 0.3s（不快不慢）
- ✅ 透明度变化幅度 ≤ 0.4（不刺眼）
- ✅ 使用主题色系（不超过 3 种颜色）
- ❌ 不使用粒子效果
- ❌ 不使用强烈闪烁
- ❌ 不使用过多渐变

## 5. 错误处理和边界情况

### 5.1 语音权限处理
- 首次切换到语音页面时请求麦克风权限
- 用户拒绝权限时显示引导对话框
- 权限授予前显示占位状态

### 5.2 语音服务不可用
- STT/TTS 服务未配置时显示配置引导界面
- 提供快捷入口跳转到设置页面的语音配置 Tab
- 使用项目现有的错误边界组件

### 5.3 页面切换时的状态清理
- 用户在语音对话进行中切换回文字页面时自动暂停语音对话
- 显示提示："语音对话已暂停，切换回语音模式可继续"
- 切换回语音页面时自动恢复对话

### 5.4 网络断开
- 显示网络错误状态
- 提供重试按钮
- 3 次重试失败后提示检查网络设置

## 6. i18n 国际化

### 6.1 新增键值
在 `zh.json` 和 `en.json` 中添加：

```json
{
  "pageMode": {
    "chat": "文字对话",
    "voice": "语音对话",
    "chatDesc": "与 AI 进行文字交流",
    "voiceDesc": "与 AI 进行语音对话",
    "switching": "切换中...",
    "paused": "语音对话已暂停",
    "pausedDesc": "切换回语音模式可继续对话",
    "resume": "继续对话"
  }
}
```

## 7. 文件清单

### 7.1 新增文件
- `desktop/src/react/stores/page-mode-slice.ts` - 页面模式状态管理
- `desktop/src/react/components/PageModeTabs.tsx` - 切换标签组件
- `desktop/src/react/components/PageModeTabs.module.css` - 切换标签样式
- `desktop/src/react/components/app/VoiceChatPage.tsx` - 语音对话页面
- `desktop/src/react/components/app/VoiceChatPage.module.css` - 语音页面样式

### 7.2 修改文件
- `desktop/src/react/stores/index.ts` - 注册 page-mode-slice
- `desktop/src/react/components/app/AppPages.tsx` - 添加页面切换逻辑
- `desktop/src/locales/zh.json` - 添加中文翻译
- `desktop/src/locales/en.json` - 添加英文翻译

## 8. 测试策略

### 8.1 单元测试
- `page-mode-slice.test.ts` - 测试状态管理逻辑
- `PageModeTabs.test.tsx` - 测试组件渲染和交互

### 8.2 集成测试
- 页面切换流程测试
- 语音对话状态保持测试
- 权限请求流程测试

### 8.3 手动测试
- 动画流畅性验证
- i18n 切换验证
- 边界情况验证（网络断开、权限拒绝等）

## 9. 实现顺序

1. 创建 `page-mode-slice.ts` 并在 store 中注册
2. 创建 `PageModeTabs` 组件及样式（科幻风格动画）
3. 创建 `VoiceChatPage` 组件及样式
4. 修改 `AppPages.tsx` 集成页面切换逻辑
5. 添加 i18n 键值
6. 处理错误边界和权限请求
7. 编写单元测试
8. 手动测试和动画调优

## 10. 注意事项

### 10.1 性能考虑
- 动画使用 CSS `transform` 和 `opacity`（GPU 加速）
- 避免在动画期间触发 React 重渲染
- 使用 `will-change` 提示浏览器优化

### 10.2 兼容性
- Electron 环境，不需要考虑浏览器兼容性
- 使用现代 CSS 特性（clip-path, grid 等）

### 10.3 可访问性
- 标签按钮需要正确的 `aria` 属性
- 键盘导航支持（Tab 键切换）
- 屏幕阅读器友好的状态提示
