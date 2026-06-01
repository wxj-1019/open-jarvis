/**
 * 主题配置系统
 * 只需定义颜色，其他变量自动生成
 */

export interface ThemeConfig {
  name: string;
  label: string;
  labelZh: string;
  icon: string;
  // 强调色
  accent: string;
  accentRgb: [number, number, number];
  // 浅色主题背景
  glassBg: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textQuaternary: string;
  // 深色主题背景
  glassBgDark: string;
  // 边框和高光（可选，默认使用 accent）
  glassBorder?: string;
  glassHighlight?: string;
  // 阴影透明度（可选，默认 0.18/0.12）
  shadowAccentOpacity?: number;
  shadowGlowOpacity?: number;
}

export const themes: ThemeConfig[] = [
  {
    name: 'default',
    label: 'Default',
    labelZh: '默认',
    icon: '🎨',
    accent: '#537D96',
    accentRgb: [83, 125, 150],
    glassBg: 'rgba(255, 255, 255, 0.88)',
    glassBgDark: 'rgba(30, 30, 30, 0.82)',
    textPrimary: 'rgba(0, 0, 0, 0.95)',
    textSecondary: 'rgba(0, 0, 0, 0.7)',
    textTertiary: 'rgba(0, 0, 0, 0.5)',
    textQuaternary: 'rgba(0, 0, 0, 0.35)',
  },
  {
    name: 'midnight',
    label: 'Midnight',
    labelZh: '午夜',
    icon: '🌙',
    accent: '#7BAFD4',
    accentRgb: [123, 175, 212],
    glassBg: 'rgba(255, 255, 255, 0.88)',
    glassBgDark: 'rgba(30, 30, 30, 0.82)',
    textPrimary: 'rgba(255, 255, 255, 0.95)',
    textSecondary: 'rgba(255, 255, 255, 0.7)',
    textTertiary: 'rgba(255, 255, 255, 0.5)',
    textQuaternary: 'rgba(255, 255, 255, 0.35)',
  },
  {
    name: 'midnight-contrast',
    label: 'Midnight Contrast',
    labelZh: '午夜高对比',
    icon: '🌚',
    accent: '#9BC3E6',
    accentRgb: [155, 195, 230],
    glassBg: 'rgba(255, 255, 255, 0.9)',
    glassBgDark: 'rgba(20, 20, 20, 0.85)',
    textPrimary: 'rgba(255, 255, 255, 0.98)',
    textSecondary: 'rgba(255, 255, 255, 0.75)',
    textTertiary: 'rgba(255, 255, 255, 0.55)',
    textQuaternary: 'rgba(255, 255, 255, 0.4)',
  },
  {
    name: 'ocean-blue',
    label: 'Ocean Blue',
    labelZh: '海洋蓝',
    icon: '🌊',
    accent: '#3b82f6',
    accentRgb: [59, 130, 246],
    glassBg: 'rgba(240, 249, 255, 0.88)',
    glassBgDark: 'rgba(15, 23, 42, 0.82)',
    textPrimary: 'rgba(15, 23, 42, 0.95)',
    textSecondary: 'rgba(15, 23, 42, 0.7)',
    textTertiary: 'rgba(15, 23, 42, 0.5)',
    textQuaternary: 'rgba(15, 23, 42, 0.35)',
  },
  {
    name: 'sakura-pink',
    label: 'Sakura Pink',
    labelZh: '樱花粉',
    icon: '🌸',
    accent: '#ec4899',
    accentRgb: [236, 72, 153],
    glassBg: 'rgba(255, 245, 247, 0.88)',
    glassBgDark: 'rgba(30, 10, 18, 0.82)',
    textPrimary: 'rgba(30, 10, 18, 0.95)',
    textSecondary: 'rgba(30, 10, 18, 0.7)',
    textTertiary: 'rgba(30, 10, 18, 0.5)',
    textQuaternary: 'rgba(30, 10, 18, 0.35)',
  },
  {
    name: 'lavender',
    label: 'Lavender',
    labelZh: '薰衣草紫',
    icon: '💜',
    accent: '#a855f7',
    accentRgb: [168, 85, 247],
    glassBg: 'rgba(250, 245, 255, 0.88)',
    glassBgDark: 'rgba(20, 10, 30, 0.82)',
    textPrimary: 'rgba(20, 10, 30, 0.95)',
    textSecondary: 'rgba(20, 10, 30, 0.7)',
    textTertiary: 'rgba(20, 10, 30, 0.5)',
    textQuaternary: 'rgba(20, 10, 30, 0.35)',
  },
  {
    name: 'mint-green',
    label: 'Mint Green',
    labelZh: '薄荷绿',
    icon: '🌿',
    accent: '#10b981',
    accentRgb: [16, 185, 129],
    glassBg: 'rgba(240, 253, 250, 0.88)',
    glassBgDark: 'rgba(10, 25, 20, 0.82)',
    textPrimary: 'rgba(10, 25, 20, 0.95)',
    textSecondary: 'rgba(10, 25, 20, 0.7)',
    textTertiary: 'rgba(10, 25, 20, 0.5)',
    textQuaternary: 'rgba(10, 25, 20, 0.35)',
  },
  {
    name: 'marshmallow-pink',
    label: 'Marshmallow Pink',
    labelZh: '棉花糖粉',
    icon: '☁️',
    accent: '#f4a4b4',
    accentRgb: [244, 164, 180],
    glassBg: 'rgba(255, 252, 253, 0.9)',
    glassBgDark: 'rgba(35, 20, 25, 0.82)',
    textPrimary: 'rgba(35, 20, 25, 0.95)',
    textSecondary: 'rgba(35, 20, 25, 0.7)',
    textTertiary: 'rgba(35, 20, 25, 0.5)',
    textQuaternary: 'rgba(35, 20, 25, 0.35)',
    glassBorder: 'rgba(244, 164, 180, 0.18)',
    glassHighlight: 'rgba(244, 164, 180, 0.1)',
    shadowAccentOpacity: 0.22,
    shadowGlowOpacity: 0.15,
  },
];

/**
 * 根据主题配置生成 CSS 变量
 */
export function generateThemeCSS(theme: ThemeConfig): string {
  const {
    name,
    accent,
    accentRgb,
    glassBg,
    glassBgDark,
    textPrimary,
    textSecondary,
    textTertiary,
    textQuaternary,
    glassBorder,
    glassHighlight,
    shadowAccentOpacity = 0.18,
    shadowGlowOpacity = 0.12,
  } = theme;

  const rgbStr = accentRgb.join(' ');
  const border = glassBorder || `rgba(${rgbStr}, 0.15)`;
  const highlight = glassHighlight || `rgba(${rgbStr}, 0.08)`;

  return `
html[data-theme="${name}"] {
  --accent: ${accent};
  --accent-rgb: ${rgbStr};
  --glass-bg: ${glassBg};
  --glass-bg-dark: ${glassBgDark};
  --glass-border: ${border};
  --glass-highlight: ${highlight};
  --shadow-accent: 0 4px 14px rgba(${rgbStr}, ${shadowAccentOpacity});
  --shadow-glow: 0 0 20px rgba(${rgbStr}, ${shadowGlowOpacity});
  --text-primary: ${textPrimary};
  --text-secondary: ${textSecondary};
  --text-tertiary: ${textTertiary};
  --text-quaternary: ${textQuaternary};
  --spinner-track-rgb: ${name.includes('midnight') ? '255 255 255' : '0 0 0'};
  --skeleton-base-rgb: ${name.includes('midnight') ? '255 255 255' : '0 0 0'};
}

html[data-theme="${name}"] .hana-glass,
html[data-theme="${name}"] .float-card,
html[data-theme="${name}"] .context-menu {
  border-color: var(--glass-border);
}`;
}

/**
 * 生成所有主题的 CSS
 */
export function generateAllThemesCSS(): string {
  return themes.map(generateThemeCSS).join('\n');
}
