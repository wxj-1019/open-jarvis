/**
 * 主题 CSS 生成器（CommonJS 版本）
 * 运行：node desktop/src/apple-liquid-glass/generate-themes.cjs
 */

const fs = require('fs');
const path = require('path');

const themes = [
  {
    name: 'default',
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

function generateThemeCSS(theme) {
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
  const isMidnight = name.includes('midnight');

  return `
/* ── ${name} 主题 ── */
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
  --spinner-track-rgb: ${isMidnight ? '255 255 255' : '0 0 0'};
  --skeleton-base-rgb: ${isMidnight ? '255 255 255' : '0 0 0'};
}

html[data-theme="${name}"] .hana-glass,
html[data-theme="${name}"] .float-card,
html[data-theme="${name}"] .context-menu {
  border-color: var(--glass-border);
}`;
}

console.log('🎨 开始生成主题 CSS...');
console.log(`📊 共 ${themes.length} 个主题`);

const css = themes.map(generateThemeCSS).join('\n');

const outputDir = __dirname;
const outputFile = path.join(outputDir, 'themes-generated.css');

fs.writeFileSync(outputFile, css, 'utf-8');

console.log('✅ 主题 CSS 生成成功！');
console.log(`📁 输出文件: ${outputFile}`);
console.log(`📏 文件大小: ${(css.length / 1024).toFixed(2)} KB`);

// 生成主题列表 JSON
const themesJson = JSON.stringify(
  themes.map(({ name, accent, accentRgb }) => ({
    name,
    accent,
    accentRgb,
  })),
  null,
  2
);

const jsonFile = path.join(outputDir, 'themes-list.json');
fs.writeFileSync(jsonFile, themesJson, 'utf-8');

console.log(`📋 主题列表: ${jsonFile}`);
