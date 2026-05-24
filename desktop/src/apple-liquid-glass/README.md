# Apple Liquid Glass UI/UX 模块

## 概述

本模块实现了 Apple Liquid Glass 设计语言的 CSS 样式，包括弹簧动画、毛玻璃效果、多层阴影、边框高光等。

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
