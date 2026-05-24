# Apple Liquid Glass UI/UX 模块

## 概述

本模块实现了 Apple Liquid Glass 设计语言的 CSS 样式，包括弹簧动画、毛玻璃效果、多层阴影、边框高光、交互反馈、主题切换等。

**模块版本**：Phase 6（代码质量打磨）
**总文件数**：10
**总代码行数**：~1250+
**代码质量**：✅ 无 !important 滥用、✅ 完整暗色主题适配、✅ CSS 变量驱动、✅ GPU 加速优化

## 文件结构

```
apple-liquid-glass/
├── index.css               # 入口文件（import 所有子模块）
├── design-tokens.css       # 设计 Token（变量定义）
├── animations-enhanced.css # 新增动画（@keyframes）
├── components-enhanced.css # 组件动画增强
├── spatial-layers.css      # 空间层次（毛玻璃+阴影）
├── transitions.css         # 过渡与模态
├── fine-tuning.css         # 精细调优（性能、无障碍、主题）
├── interactions.css        # 交互体验增强（拖拽、加载、错误/成功、滚动）
├── performance-utils.css   # 性能工具类
├── theme-transitions.css   # 主题切换动画与多主题支持
└── README.md               # 本文档
```

## 使用示例

### 1. 毛玻璃效果

```css
.my-card {
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  border: 1px solid var(--glass-border);
  box-shadow: var(--shadow-lg);
}
```

### 2. 弹簧动画

```css
.my-modal {
  animation: hana-spring-in 0.3s var(--ease-spring) both;
}
```

### 3. 按钮微交互

```css
.my-button:active {
  transform: scale(0.94);
  transition: transform var(--duration-instant) var(--ease-spring-settle);
}
```

### 4. 交错动画

```jsx
<div className="hana-stagger-child">
  {items.map(item => <div key={item.id}>{item.name}</div>)}
</div>
```

## CSS 变量文档

### 弹簧缓动曲线

| 变量 | 值 | 用途 |
|------|-----|------|
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | 模态、toast 进场（轻柔回弹） |
| `--ease-spring-bounce` | `cubic-bezier(0.175, 0.885, 0.32, 1.275)` | popover、dropdown（明显回弹） |
| `--ease-spring-gentle` | `cubic-bezier(0.22, 1, 0.36, 1)` | 按钮 hover、卡片微交互（微回弹） |
| `--ease-spring-settle` | `cubic-bezier(0.33, 1, 0.68, 1)` | 侧边栏、toggle 状态切换（快速稳定） |

### 阴影系统

| 变量 | 用途 |
|------|------|
| `--shadow-xs` | 微阴影（卡片内元素分隔） |
| `--shadow-sm` | 小阴影（输入框、按钮默认状态） |
| `--shadow-md` | 中阴影（卡片默认状态） |
| `--shadow-lg` | 大阴影（浮动卡片、下拉菜单） |
| `--shadow-xl` | 超大阴影（模态框、popover） |
| `--shadow-2xl` | 巨大阴影（警告框、全屏遮罩） |

## 性能最佳实践

### will-change 生命周期

**错误用法**（持续占用 GPU 内存）：
```css
.float-card {
  will-change: transform, opacity; /* ❌ 始终占用 */
}
```

**正确用法**（JS 动态控制）：
```jsx
<div className={`float-card ${isAnimating ? 'hana-animating' : ''}`}>
  {/* 内容 */}
</div>
```

### backdrop-filter 降级

所有毛玻璃组件已自动降级：
- 支持 `backdrop-filter` 的设备：使用模糊 + 饱和度增强
- 不支持的设备：使用半透明背景（85% 不透明度）

### Grid 展开动画

**旧方案**（触发 layout 重排）：
```css
@keyframes expand {
  from { max-height: 0; }
  to { max-height: 2000px; }
}
```

**新方案**（仅触发 composite）：
```html
<div class="hana-accordion">
  <div class="hana-accordion-content">...</div>
</div>
```

```js
accordion.classList.toggle('hana-accordion-open');
```

### Shimmer 动画优化

已优化为 `transform` 动画（GPU 加速），避免 `background-position` 导致的重绘。

### 移动端性能

在移动设备（<768px）上，持续动画频率自动降低：
- shimmer: 2.5s → 4s
- beta-badge: 3s → 5s
- status-dot pulse: 2s → 3s

### 性能工具类

| 类名 | 用途 |
|------|------|
| `.hana-animating` | 动态启用 GPU 加速（JS 控制） |
| `.hana-respect-motion` | 防止动画堆积（点击时触发） |
| `.hana-no-child-animation` | 禁用所有子元素动画 |
| `.hana-high-performance` | 高性能模式（禁用非必需动画） |

## 无障碍指南

1. **尊重 `prefers-reduced-motion`**：所有弹簧动画降级为淡入淡出
2. **高对比度模式**：增强边框可见性（2px 实线边框）
3. **焦点状态增强**：使用 `.hana-focus-enhanced` 类添加光晕

## 主题适配

本模块支持浅色和暗色主题：
- 浅色主题：使用 `--glass-bg`（白色 72% 不透明度）
- 暗色主题：使用 `--glass-bg-dark`（深灰色 72% 不透明度）
- 暗色主题阴影自动加深

## 设计参考

- [Apple Liquid Glass (WWDC 2025)](https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/)
- [Web Animation Best Practices](https://gist.github.com/uxderrick/07b81ca63932865ef1a7dc94fbe07838)
- [CSS Spring Animation Guide](https://digitalthriveai.com/en-us/resources/web-development/making-css-animations-feel-natural/)

## 交互状态文档

### 1. 拖拽反馈

当用户拖拽文件到应用区域时，使用 `.drag-over` 类添加弹性放大效果：

```jsx
<div className={`drop-overlay ${isDragging ? 'drag-over' : ''}`}>
  拖放文件到此处
</div>
```

侧边栏拖拽调整宽度时，添加 `.dragging` 类增强阴影：

```jsx
<div className={`sidebar ${isResizing ? 'dragging' : ''}`}>
  侧边栏内容
</div>
```

### 2. 加载状态

**旋转加载指示器**（Apple 风格）：

```jsx
<div className="hana-spinner" />
```

**骨架屏 shimmer 效果**：

```jsx
<div className="hana-skeleton" style={{ width: '100%', height: '16px' }} />
```

**发送按钮加载状态**（JS 动态添加）：

```jsx
<button className={`send-btn ${isSending ? 'sending' : ''}`} onClick={handleSend}>
  发送
</button>
```

**Toggle 加载状态**（禁用交互 + 脉冲动画）：

```jsx
<div className={`hana-toggle ${isLoading ? 'loading' : ''}`} />
```

### 3. 错误提示

**表单验证错误**（晃动动画）：

```jsx
<div className="form-error">请输入有效的邮箱地址</div>
```

**输入框错误状态**（红色边框 + 持续脉冲）：

```jsx
<input className={`input-field ${hasError ? 'input-error' : ''}`} />
```

**网络错误提示**（弹性出现 + 红色背景）：

```jsx
<div className="error-toast">网络连接失败，请重试</div>
```

**连接断开状态**（红色脉冲点）：

```jsx
<div className="connection-status disconnected">
  <span className="status-dot" />
  已断开连接
</div>
```

### 4. 成功反馈

**操作成功庆祝动画**（果冻弹跳）：

```jsx
<div className="success-feedback">保存成功！</div>
```

**保存成功微光扫过**（shimmer 效果）：

```jsx
<div className={`card ${isSaved ? 'save-success' : ''}`}>
  表单内容
</div>
```

**成功状态点**（弹性弹出）：

```jsx
<div className="success-dot" />
```

### 5. 滚动交互

**导航栏滚动毛玻璃效果**（Apple Scroll Edge Effect）：

```jsx
<nav className={`navbar ${hasScrolled ? 'scrolled' : ''}`}>
  导航内容
</nav>
```

**列表项滚动进入视口**（交错淡入动画）：

```jsx
{items.map((item, index) => (
  <div
    key={item.id}
    className="list-item in-view"
    style={{ animationDelay: `${index * 0.05}s` }}
  >
    {item.name}
  </div>
))}
```

**滚动加载指示器**（脉冲动画）：

```jsx
<div className="scroll-loader">加载中...</div>
```

### 交互状态类名汇总

| 类名 | 用途 | 触发动画 |
|------|------|----------|
| `.drag-over` | 文件拖入区域 | `hana-elastic-bounce` |
| `.dragging` | 侧边栏/频道拖拽 | 阴影增强 |
| `.hana-spinner` | 旋转加载 | `hana-spin` |
| `.hana-skeleton` | 骨架屏 | `hana-skeleton-shimmer` |
| `.hana-toggle.loading` | Toggle 加载中 | `hana-continuous-pulse` |
| `.form-error` | 表单验证错误 | `hana-wiggle` |
| `.input-error` | 输入框错误 | `hana-error-pulse` |
| `.error-toast` | 错误提示 | `hana-spring-in` |
| `.connection-status.disconnected` | 连接断开 | `hana-error-pulse-dot` |
| `.send-btn.sending` | 发送按钮加载 | `hana-send-bounce` |
| `.save-success` | 保存成功 | `hana-success-shimmer` |
| `.success-feedback` | 操作成功 | `hana-jelly-bounce` |
| `.success-dot` | 成功状态点 | `hana-success-pop` |
| `.navbar.scrolled` | 导航栏滚动 | `hana-scroll-edge-blur` |
| `.list-item.in-view` | 列表项进入视口 | `hana-fade-up` |
| `.scroll-loader` | 滚动加载 | `hana-continuous-pulse` |

## 主题系统文档

### 1. 可用主题

本模块内置支持以下主题：

| 主题名称 | data-theme 值 | 强调色 | 适用场景 |
|---------|--------------|--------|----------|
| 默认浅蓝 | （默认） | `#537d96` | 日常使用 |
| 午夜暗色 | `midnight` | `#537d96` | 夜间模式 |
| 午夜高对比 | `midnight-contrast` | `#537d96` | 高对比度需求 |
| 海洋蓝 | `ocean-blue` | `#3b82f6` | 清新风格 |
| 樱花粉 | `sakura-pink` | `#ec4899` | 可爱风格 |
| 薰衣草紫 | `lavender` | `#a855f7` | 优雅风格 |
| 薄荷绿 | `mint-green` | `#10b981` | 自然风格 |

### 2. 切换主题

**方法一：HTML 属性**

```html
<html data-theme="ocean-blue">
  <!-- 应用内容 -->
</html>
```

**方法二：JavaScript 动态切换**

```js
// 切换主题
function setTheme(themeName) {
  document.documentElement.setAttribute('data-theme', themeName);
  localStorage.setItem('preferred-theme', themeName);
}

// 示例：点击按钮切换
document.getElementById('theme-switcher').addEventListener('click', () => {
  setTheme('sakura-pink');
});
```

**方法三：React 组件**

```jsx
function ThemeSwitcher() {
  const [theme, setTheme] = useState(localStorage.getItem('preferred-theme') || 'default');
  
  const handleThemeChange = (newTheme) => {
    document.documentElement.setAttribute('data-theme', newTheme);
    setTheme(newTheme);
    localStorage.setItem('preferred-theme', newTheme);
  };
  
  return (
    <select value={theme} onChange={(e) => handleThemeChange(e.target.value)}>
      <option value="default">默认浅蓝</option>
      <option value="midnight">午夜暗色</option>
      <option value="ocean-blue">海洋蓝</option>
      <option value="sakura-pink">樱花粉</option>
      <option value="lavender">薰衣草紫</option>
      <option value="mint-green">薄荷绿</option>
    </select>
  );
}
```

### 3. 主题切换动画

主题切换时会自动应用平滑过渡效果（0.3s），包括：
- 背景颜色过渡
- 边框颜色过渡
- 文本颜色过渡
- 阴影过渡

**禁用主题切换动画**（用于需要立即切换的场景）：

```js
// 添加类禁用动画
document.documentElement.classList.add('hana-theme-switching');

// 执行主题切换
document.documentElement.setAttribute('data-theme', 'midnight');

// 移除类恢复动画
setTimeout(() => {
  document.documentElement.classList.remove('hana-theme-switching');
}, 50);
```

### 4. 自定义主题

**创建自定义主题**：

```css
/* 在项目的 CSS 文件中添加 */
html[data-theme="my-custom-theme"] {
  --accent: #ff6b6b;
  --accent-rgb: 255 107 107;
  --glass-bg: rgba(255, 250, 250, 0.75);
  --glass-bg-dark: rgba(30, 15, 15, 0.75);
  --shadow-accent: 0 4px 14px rgba(255, 107, 107, 0.18);
  --shadow-glow: 0 0 20px rgba(255, 107, 107, 0.12);
}
```

**自定义主题兼容性保障**：

```jsx
// 添加 .hana-custom-theme 类标记自定义主题
<div className="hana-custom-theme" data-theme="my-custom-theme">
  {/* 内容 */}
</div>
```

### 5. 暗色主题优化

暗色主题（`midnight`、`midnight-contrast`）自动应用以下优化：

- **毛玻璃增强**：透明度从 0.72 提升到 0.78，增强对比度
- **阴影加深**：多层阴影 + 微弱边框（`rgba(255, 255, 255, 0.04~0.1)`）
- **渐变边框高光**：从 `rgba(255, 255, 255, 0.3)` 调整为 `rgba(255, 255, 255, 0.15)`
- **文本对比度**：自动增强（`--text-primary: rgba(255, 255, 255, 0.95)`）
- **输入框边框**：从 `rgba(255, 255, 255, 0.1)` 提升到 `rgba(255, 255, 255, 0.15)`
- **Shimmer 强度降低**：从 `rgba(255, 255, 255, 0.3)` 降低到 `rgba(255, 255, 255, 0.15)`
- **成功/错误状态调整**：避免过于刺眼的颜色

### 6. 主题变量完整列表

| 变量名 | 用途 | 默认值 |
|--------|------|--------|
| `--accent` | 强调色 | `#537d96` |
| `--accent-rgb` | 强调色 RGB（用于动态阴影） | `83 125 150` |
| `--glass-bg` | 浅色毛玻璃背景 | `rgba(255, 255, 255, 0.72)` |
| `--glass-bg-dark` | 暗色毛玻璃背景 | `rgba(30, 30, 30, 0.72)` |
| `--shadow-accent` | 强调色阴影 | `0 4px 14px rgba(...)` |
| `--shadow-glow` | 光晕阴影 | `0 0 20px rgba(...)` |
| `--success-rgb` | 成功色 RGB | `34 197 94` |
| `--error-rgb` | 错误色 RGB | `239 68 68` |
| `--warning-rgb` | 警告色 RGB | `245 158 11` |
| `--text-primary` | 主文本颜色（暗色主题） | `rgba(255, 255, 255, 0.95)` |
| `--text-secondary` | 次要文本颜色（暗色主题） | `rgba(255, 255, 255, 0.7)` |
| `--text-tertiary` | 三级文本颜色（暗色主题） | `rgba(255, 255, 255, 0.5)` |
| `--text-quaternary` | 四级文本颜色（暗色主题） | `rgba(255, 255, 255, 0.35)` |

### 7. 主题最佳实践

1. **持久化用户偏好**：使用 `localStorage` 保存用户选择的主题
2. **系统主题同步**：监听 `prefers-color-scheme` 媒体查询
3. **避免主题闪烁**：在 SSR/SSG 中使用 `hana-theme-switching` 类
4. **自定义主题降级**：提供默认值确保兼容性
5. **测试多主题**：在所有支持的主题下测试 UI 组件

```js
// 系统主题同步示例
const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
mediaQuery.addEventListener('change', (e) => {
  if (localStorage.getItem('preferred-theme') === 'auto') {
    setTheme(e.matches ? 'midnight' : 'default');
  }
});
```
