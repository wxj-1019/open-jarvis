# open-jarvis Apple-Style UI/UX 设计研究文档

> 研究日期: 2026-05-24
> 目标: 为 open-jarvis 项目提供 Apple 级别的高质量 UI/UX 设计参考,结合 Apple macOS/Vision Pro 的设计语言与业界最佳实践

---

## 目录

1. [动画模式研究](#1-动画模式研究)
2. [空间/深度效果](#2-空间深度效果)
3. [微交互设计模式](#3-微交互设计模式)
4. [色彩/排版灵感](#4-色彩排版灵感)
5. [open-jarvis 具体实现建议](#5-open-jarvis-具体实现建议)

---

## 1. 动画模式研究

### 1.1 Apple macOS Sonoma 动画设计

**核心原则**: 运动应该有意义,服务于用户体验而非炫技

**关键技术模式**:
- **目的性运动**: 每个动画都应该传达状态、提供反馈或引导注意力
- **真实感反馈**: 动画应符合用户的物理直觉(例如最小化窗口时,窗口平滑移动到 Dock)
- **简洁精确**: 动画应短暂而精准,避免让用户等待
- **可取消性**: 用户不应被动画阻塞,特别是在重复操作中

**参考来源**: [Apple HIG - Motion](https://developers.apple.com/design/human-interface-guidelines/foundations/motion)

### 1.2 Spring Animation (弹簧动画)

**为什么重要**: 弹簧物理模拟让界面感觉更自然、更有生命力

**CSS 实现方案**:

#### 方案 A: CSS `linear()` 函数 (现代浏览器支持)
```css
/* 使用 CSS linear() 创建弹簧效果 */
.toast-enter {
  animation: toast-spring 0.4s linear forwards;
}

@keyframes toast-spring {
  0% { transform: translateY(-100%) scale(0.9); }
  30% { transform: translateY(12px) scale(1.02); }
  50% { transform: translateY(-4px) scale(0.99); }
  70% { transform: translateY(2px) scale(1.005); }
  100% { transform: translateY(0) scale(1); }
}
```

#### 方案 B: Cubic-bezier 曲线 (兼容性更好)
```css
:root {
  /* Apple 风格的缓动曲线 */
  --ease-spring: cubic-bezier(0.175, 0.885, 0.32, 1.275);
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
}

.button-press {
  transition: transform 0.15s var(--ease-out-expo);
}

.button-press:active {
  transform: scale(0.97);
  transition-duration: 0.05s;
}
```

**推荐时长**:
- 微交互 (hover/press): **120-200ms**
- UI 状态切换 (toggle/select): **180-260ms**
- 小过渡 (popover/toast): **220-320ms**
- 页面元素入场: **400-800ms**

**参考来源**: [ICS Media - CSS Spring Animation](https://ics.media/en/entry/260402/), [Pyxofy - Cubic Bezier Spring](https://www.pyxofy.com/css-animation-using-cubic-bezier-for-anticipation-and-spring-effects/)

### 1.3 Linear.app 动画系统

Linear 被誉为 web 应用中动画质量最高的产品之一

**核心设计原则**:
1. **克制**: 更少的动画,更好的选择。一个强烈的 hero 动画,其余都是辅助
2. **清晰的编排**: 主元素先动,次要元素跟随,建立"阅读顺序"
3. **物理感但不卡通**: 使用人性化的缓动,避免过度弹跳
4. **纹理和深度**: 微妙的视差、柔和阴影、模糊淡入

**Linear 的 Motion Primitives**:

```css
/* A) Fade + Rise (默认入场动画) */
.fade-rise {
  opacity: 0;
  transform: translateY(16px);
  transition: opacity 0.5s var(--ease-out), transform 0.5s var(--ease-out);
}
.fade-rise.visible {
  opacity: 1;
  transform: translateY(0);
}

/* B) Scale + Fade (微强调) */
.scale-fade {
  opacity: 0;
  transform: scale(0.98);
  transition: opacity 0.25s var(--ease-out), transform 0.25s var(--ease-out);
}
.scale-fade.visible {
  opacity: 1;
  transform: scale(1);
}

/* C) Hover: Lift + Glow */
.card-hover {
  transition: transform 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out);
}
.card-hover:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.12);
}
```

**Stagger 延迟**: 40-90ms 每个元素,移动端使用更小的 stagger

**参考来源**: [Aura - Animation Systems](https://www.aura.build/skills/6bfd1a89-6f9a-403f-ab0d-5e81110ecea6/animation-systems-for-product-grade-web-motion)

### 1.4 Raycast 微交互设计

**核心理念**: 在零延迟前提下注入个性

**关键发现**:
- **50ms 规则**: 用户能感知到超过 50ms 的延迟,这应该作为严格的工程约束
- **即时响应**: UI 立即显示,数据异步加载
- **个性不增加性能成本**: 达成时的纸屑动画、有趣的空状态、巧妙的文案

```css
/* Raycast 风格的即时响应 */
.command-item {
  transition: background 0.1s ease;
}
.command-item:hover {
  background: rgba(0, 122, 255, 0.1);
}
.command-item:active {
  transition-duration: 0.05s;
  transform: scale(0.99);
}
```

**参考来源**: [Blake Crosley - Raycast Design Analysis](https://blakecrosley.com/ja/guides/design/raycast)

---

## 2. 空间/深度效果

### 2.1 Apple Liquid Glass (2025 年发布)

Apple 在 WWDC 2025 发布的新一代设计语言,将 Vision Pro 的空间感带到所有平台

**核心特征**:
- **半透明材质**: 背景模糊透出,但不影响可读性
- **实时光线折射**: GPU 计算的高光和反射
- **动态适应**: 根据内容智能调整透明度
- **物理隐喻**: 像真实玻璃一样反射、折射、变形

**CSS 实现方案**:

```css
/* Liquid Glass 基础效果 */
.liquid-glass {
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.5);
}

/* 深色模式 */
@media (prefers-color-scheme: dark) {
  .liquid-glass {
    background: rgba(30, 30, 30, 0.65);
    border-color: rgba(255, 255, 255, 0.1);
    box-shadow: 
      0 8px 32px rgba(0, 0, 0, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }
}

/* 滚动边缘效果 */
.header-scrolled {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}
```

**性能优化**:
- 使用 GPU 加速的 `transform` 和 `opacity`
- 避免大面积同时使用 `backdrop-filter`
- 对移动设备降低模糊强度

### 2.2 Glassmorphism 2.0

从 2021 年的简单模糊进化到 2026 年的实时光线折射

**进化对比**:
| 特性 | 2021 Glassmorphism | 2026 Liquid Glass |
|------|-------------------|-------------------|
| 模糊 | 简单 backdrop-filter | 基于深度的动态模糊 |
| 透明度 | 固定透明度 | 智能自适应 |
| 光线 | 静态渐变 | 实时折射和色散 |
| 交互 | 无响应 | 跟随鼠标/滚动动态变化 |

**高级效果 - 背景置换**:
```css
/* SVG 置换滤镜实现玻璃折射 */
.glass-refraction {
  backdrop-filter: blur(16px);
  filter: url(#glass-displacement);
}
```

**使用场景建议**:
- ✅ 适合: 浮层、模态框、导航栏(需要保持背后内容可见)
- ❌ 不适合: 主要内容区域(优先保证可读性)

### 2.3 深度层次系统

**Apple Vision Pro 的三层深度模型**:

```css
:root {
  /* 深度层级 */
  --depth-base: 0;        /* 背景层 */
  --depth-content: 10px;  /* 内容层 */
  --depth-surface: 20px;  /* 表面层 */
  --depth-overlay: 30px;  /* 浮层 */
  --depth-modal: 40px;    /* 模态层 */
  
  /* 对应的阴影 */
  --shadow-depth-0: none;
  --shadow-depth-1: 0 2px 8px rgba(0, 0, 0, 0.04);
  --shadow-depth-2: 0 4px 16px rgba(0, 0, 0, 0.08);
  --shadow-depth-3: 0 8px 32px rgba(0, 0, 0, 0.12);
  --shadow-depth-4: 0 16px 48px rgba(0, 0, 0, 0.16);
}
```

**视差效果**:
```css
/* 微妙的视差滚动 */
.parallax-layer {
  transform: translateZ(0);
  will-change: transform;
}
.parallax-layer.far {
  transform: translateZ(-50px) scale(1.1);
}
.parallax-layer.near {
  transform: translateZ(50px) scale(0.95);
}
```

---

## 3. 微交互设计模式

### 3.1 Disney 12 动画原则在 UI 中的应用

| 原则 | UI 应用 | 优先级 |
|------|---------|--------|
| 缓动 (Slow in/out) | 所有过渡动画 | 必须 |
| 预期 (Anticipation) | 按钮按下、拖拽开始 | 高 |
| 跟随 (Follow-through) | 模态框、下拉菜单 | 高 |
| 次要动作 | 加载状态、通知 | 中 |
| 节奏 (Timing) | 基于距离/重要性的时长 | 必须 |
| 挤压拉伸 | 按钮、开关、趣味 UI | 中 |
| 舞台设置 | 聚焦注意力、减少干扰 | 高 |

### 3.2 按钮交互模式

```css
/* 完整的按钮交互状态 */
.button {
  position: relative;
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: white;
  font-family: inherit;
  cursor: pointer;
  transition: 
    transform 0.15s var(--ease-out),
    box-shadow 0.15s var(--ease-out),
    background 0.15s ease;
  overflow: hidden;
}

/* Hover: 轻微抬起 + 阴影增强 */
.button:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(var(--accent-rgb), 0.3);
}

/* Active: 按下反馈 */
.button:active {
  transform: scale(0.97) translateY(0);
  box-shadow: 0 2px 8px rgba(var(--accent-rgb), 0.2);
  transition-duration: 0.05s;
}

/* 光泽扫过效果 (可选) */
.button::after {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 50%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.2),
    transparent
  );
  transition: left 0.6s ease;
}
.button:hover::after {
  left: 150%;
}
```

### 3.3 开关 (Toggle) 微交互

```css
/* Apple 风格的开关 */
.toggle {
  width: 44px;
  height: 24px;
  border-radius: 12px;
  background: var(--overlay-medium);
  position: relative;
  cursor: pointer;
  transition: background 0.25s var(--ease-out);
}

.toggle::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.25s var(--ease-spring);
}

.toggle.on {
  background: var(--accent);
}

.toggle.on::after {
  transform: translateX(20px);
}

/* 按下时的弹性反馈 */
.toggle:active::after {
  width: 24px;
  transition-duration: 0.1s;
}
```

### 3.4 表单验证反馈

```css
/* 实时表单验证 */
.input-group {
  position: relative;
}

.input-group input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 15px;
  transition: 
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

/* Focus: 边框 + 光晕 */
.input-group input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.15);
}

/* 验证成功 */
.input-group input.valid {
  border-color: var(--success);
  box-shadow: 0 0 0 3px rgba(var(--success-rgb), 0.15);
}

/* 验证失败: 抖动动画 */
.input-group input.invalid {
  border-color: var(--error);
  animation: input-shake 0.4s ease;
}

@keyframes input-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-4px); }
  40% { transform: translateX(4px); }
  60% { transform: translateX(-2px); }
  80% { transform: translateX(2px); }
}
```

### 3.5 加载状态

```css
/* 骨架屏动画 */
.skeleton {
  background: linear-gradient(
    90deg,
    var(--overlay-light) 25%,
    var(--overlay-medium) 50%,
    var(--overlay-light) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s ease-in-out infinite;
}

@keyframes skeleton-loading {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* 旋转加载器 (优化版) */
.loader {
  width: 24px;
  height: 24px;
  border: 2px solid var(--overlay-light);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

---

## 4. 色彩/排版灵感

### 4.1 Notion 的设计系统

**核心特点**: 克制、功能性、以内容为中心

**色彩系统**:
```css
:root {
  /* Notion 风格的低饱和色彩 */
  --surface-base: #F6F6F6;
  --surface-raised: #E5E5E4;
  --surface-overlay: #DFEFFE;
  
  --text-primary: #37352F;
  --text-secondary: #9B9A97;
  --text-tertiary: #BDBDBA;
  
  --accent: #2EAADC;
  --accent-light: rgba(46, 170, 220, 0.1);
  
  --border: #E3E2E0;
  
  /* 功能性色彩 */
  --success: #4B9E73;
  --warning: #D9730D;
  --error: #DB5563;
}
```

**排版系统**:
```css
:root {
  /* 字体 */
  --font-sans: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
  --font-serif: 'EB Garamond', 'Noto Serif SC', serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
  
  /* 字号阶梯 (1.25 比例) */
  --text-xs: 0.75rem;    /* 12px */
  --text-sm: 0.875rem;   /* 14px */
  --text-base: 1rem;     /* 16px */
  --text-lg: 1.125rem;   /* 18px */
  --text-xl: 1.25rem;    /* 20px */
  --text-2xl: 1.5rem;    /* 24px */
  --text-3xl: 1.875rem;  /* 30px */
  
  /* 字重 */
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;
}
```

### 4.2 Apple 的排版哲学

**San Francisco 字体特征**:
- 为屏幕阅读优化
- 动态字重 (Dynamic Type)
- 优秀的数字和对齐特性

**实现建议**:
```css
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  font-size: 15px;
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

/* 数字使用等宽变体 */
.numeric {
  font-variant-numeric: tabular-nums;
}
```

### 4.3 Figma UI3 的设计演进

Figma 在 2024 年的 UI3  redesign 中:
- 从固定面板转向浮动面板
- 工具栏移至底部,释放更多创作空间
- 更克制的色彩使用,让内容成为主角

**关键学习**:
- **Speed is a feature**: 动画和过渡不能拖慢用户
- **内容优先**: UI 应该退后,让工作内容突出
- **浮动元素**: 创造深度感,但要保持可操作性

---

## 5. open-jarvis 具体实现建议

### 5.1 现状分析

基于对现有代码的分析,open-jarvis 已经具备:

**优势**:
- ✅ 完善的动画系统 (`animations.css` 中定义了 15+ 个 @keyframes)
- ✅ 三档动效时长系统 (`--duration-instant/fast/slow`)
- ✅ 自定义缓动曲线 (`--ease-out/in/standard`)
- ✅ 响应式侧边栏 (折叠动画带 opacity 过渡)
- ✅ Toast 通知系统 (带 slide + fade 动画)
- ✅ 浮动卡片和上下文菜单
- ✅ `prefers-reduced-motion` 支持
- ✅ 纸质纹理系统 (独特的品牌特征)

**改进空间**:
- ❌ 缺少弹簧物理动画
- ❌ 没有 glassmorphism/毛玻璃效果
- ❌ 微交互反馈不够丰富 (按钮、输入框等)
- ❌ 深度/阴影系统不够完整
- ❌ hover 状态较为基础

### 5.2 优先级建议

#### Phase 1: 快速胜利 (1-2 天)

**1. 增强按钮微交互**
```css
/* 添加到 styles.css */
.button, .ob-btn, .sv-btn {
  transition: 
    transform var(--duration-fast) var(--ease-out),
    box-shadow var(--duration-fast) var(--ease-out);
}

.button:hover, .ob-btn:hover, .sv-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.button:active, .ob-btn:active, .sv-btn:active {
  transform: scale(0.98);
  transition-duration: var(--duration-instant);
}
```

**2. 输入框 Focus 光晕**
```css
input:focus, textarea:focus, select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb, 83, 125, 150), 0.15);
  transition: 
    border-color var(--duration-fast) ease,
    box-shadow var(--duration-fast) ease;
}
```

**3. 侧边栏折叠增强**
```css
/* 改进现有的 sidebar transition */
.sidebar {
  transition: 
    width var(--duration-slow) var(--ease-out),
    border-color var(--duration-slow) var(--ease-out),
    box-shadow var(--duration-slow) var(--ease-out);
}

/* 添加展开时的微妙阴影 */
.sidebar:not(.collapsed) {
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.04);
}
```

#### Phase 2: 视觉提升 (3-5 天)

**1. Glassmorphism 浮层**
```css
/* 添加到 animations.css 或新文件 */
.glass-overlay {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

/* 应用到模态框 */
.hana-warning-box,
.sv-container,
.devtools-inner {
  composes: glass-overlay;
}
```

**2. 弹簧动画系统**
```css
:root {
  /* 弹簧缓动曲线 */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-spring-bounce: cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

/* Toast 入场使用弹簧 */
.hana-toast.show {
  animation: toast-spring-in 0.35s var(--ease-spring) forwards;
}

@keyframes toast-spring-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-20px) scale(0.95);
  }
  60% {
    transform: translateX(-50%) translateY(4px) scale(1.02);
  }
  100% {
    opacity: 1;
    transform: translateX(-50%) translateY(0) scale(1);
  }
}
```

**3. 深度阴影系统**
```css
:root {
  /* 完整的深度层级 */
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07), 0 2px 4px rgba(0, 0, 0, 0.05);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.08), 0 4px 6px rgba(0, 0, 0, 0.05);
  --shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.1), 0 10px 10px rgba(0, 0, 0, 0.04);
}

/* 应用到卡片 */
.jian-card, .bridge-card, .provider-card {
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--duration-fast) ease;
}

.jian-card:hover, .bridge-card:hover {
  box-shadow: var(--shadow-md);
}
```

#### Phase 3: 高级动画 (1-2 周)

**1. 列表项 Stagger 动画**
```css
/* 会话列表项依次入场 */
.session-item {
  opacity: 0;
  transform: translateX(-8px);
  animation: session-item-enter 0.3s var(--ease-out) forwards;
}

/* 使用 CSS 变量控制延迟 */
.session-item:nth-child(1) { animation-delay: 0ms; }
.session-item:nth-child(2) { animation-delay: 40ms; }
.session-item:nth-child(3) { animation-delay: 80ms; }
.session-item:nth-child(4) { animation-delay: 120ms; }
.session-item:nth-child(5) { animation-delay: 160ms; }

@keyframes session-item-enter {
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
```

**2. 页面过渡动画**
```css
/* 页面/视图切换 */
.page-transition-enter {
  animation: page-enter 0.4s var(--ease-out) forwards;
}

.page-transition-exit {
  animation: page-exit 0.3s var(--ease-in) forwards;
}

@keyframes page-enter {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes page-exit {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(-8px);
  }
}
```

**3. 滚动触发动画**
```javascript
// 使用 Intersection Observer 实现滚动触发
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.2 }
);

document.querySelectorAll('.animate-on-scroll').forEach((el) => {
  observer.observe(el);
});
```

### 5.3 性能优化指南

**必须遵循的规则**:

1. **只动画 transform 和 opacity**
   - ❌ 避免: `width`, `height`, `top`, `left`
   - ✅ 使用: `translateX/Y`, `scale`, `rotate`, `opacity`

2. **使用 will-change 提示浏览器**
   ```css
   .animated-element {
     will-change: transform, opacity;
   }
   ```

3. **避免动画 expensive 属性**
   - `backdrop-filter` (大面积时)
   - `box-shadow` (多个同时动画)
   - `filter` (复杂滤镜)

4. **尊重 prefers-reduced-motion**
   ```css
   @media (prefers-reduced-motion: reduce) {
     *, *::before, *::after {
       animation-duration: 0.01ms !important;
       transition-duration: 0.01ms !important;
     }
   }
   ```

### 5.4 设计 Token 建议

基于研究结果,建议添加以下 CSS 变量到 `:root`:

```css
:root {
  /* ═══ 动画时长系统 ═══ */
  --duration-instant: 100ms;   /* 瞬: hover、关闭 */
  --duration-fast: 150ms;      /* 快: 按钮、面板 */
  --duration-normal: 250ms;    /* 中: toast、浮层 */
  --duration-slow: 400ms;      /* 慢: 页面过渡 */
  --duration-slower: 600ms;    /* 更慢: 大型入场 */

  /* ═══ 缓动曲线 ═══ */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.7, 0, 0.84, 0);
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-spring-bounce: cubic-bezier(0.175, 0.885, 0.32, 1.275);

  /* ═══ 阴影系统 ═══ */
  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07), 0 2px 4px rgba(0, 0, 0, 0.05);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.08), 0 4px 6px rgba(0, 0, 0, 0.05);
  --shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.1), 0 10px 10px rgba(0, 0, 0, 0.04);
  --shadow-2xl: 0 25px 50px rgba(0, 0, 0, 0.15);

  /* ═══ 圆角系统 ═══ */
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-2xl: 24px;
  --radius-full: 9999px;

  /* ═══ 毛玻璃效果 ═══ */
  --glass-bg: rgba(255, 255, 255, 0.7);
  --glass-bg-dark: rgba(30, 30, 30, 0.7);
  --glass-blur: 16px;
  --glass-border: rgba(255, 255, 255, 0.3);
  --glass-border-dark: rgba(255, 255, 255, 0.1);
}
```

---

## 参考资源汇总

| 来源 | 链接 | 关键收获 |
|------|------|----------|
| Apple HIG - Motion | [链接](https://developers.apple.com/design/human-interface-guidelines/foundations/motion) | 动画目的性、真实感、简洁性 |
| Apple Liquid Glass | [链接](https://github.com/realsnoopso/design-research-physical-metaphor/blob/main/apple-liquid-glass.md) | 半透明材质、实时光线、动态适应 |
| Linear Animation | [链接](https://www.aura.build/skills/6bfd1a89-6f9a-403f-ab0d-5e81110ecea6/animation-systems-for-product-grade-web-motion) | 克制、编排、物理感 |
| Raycast Design | [链接](https://blakecrosley.com/ja/guides/design/raycast) | 50ms 规则、即时响应 |
| Notion UI | [链接](https://github.com/ihlamury/design-skills/blob/main/skills/notion/SKILL.md) | 低饱和色彩、内容优先 |
| Spring Animation CSS | [链接](https://ics.media/en/entry/260402/) | CSS `linear()` 弹簧效果 |
| Glassmorphism 2.0 | [链接](https://superfiles.in/ui-ux-design-trends-2026-spatial-glassmorphism.php) | 实时折射、深度模糊 |
| Arc Browser | [链接](https://arc.net/) | 空间组织、侧边栏设计 |
| Figma UI3 | [链接](https://www.figma.com/blog/figma-2024-we-shipped-it-you-shaped-it/) | 浮动面板、内容优先 |
| Disney 12 原则 | [链接](https://github.com/diegosouzapw/awesome-omni-skill/blob/main/skills/design/animation-principles/SKILL.md) | UI 动画基础原则 |

---

## 结语

这份研究文档为 open-jarvis 项目提供了从 Apple 设计语言到业界最佳实践的完整参考。建议按照 Phase 1 → Phase 2 → Phase 3 的顺序逐步实施,每个阶段完成后进行用户测试和性能评估。

核心原则始终记住:
1. **动画服务于功能**,不是装饰
2. **性能优先**,60fps 是底线
3. **尊重用户偏好**,支持 `prefers-reduced-motion`
4. **保持一致性**,建立设计系统而非零散效果
