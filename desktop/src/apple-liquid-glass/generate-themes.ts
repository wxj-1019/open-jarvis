/**
 * 主题 CSS 生成器
 * 运行此脚本自动生成所有主题的 CSS
 * 
 * 使用方法：
 *   npx tsx desktop/src/apple-liquid-glass/generate-themes.ts
 */

import { generateAllThemesCSS, themes } from './theme-config';
import { writeFileSync } from 'fs';
import { join } from 'path';

const outputDir = join(__dirname);
const outputFile = join(outputDir, 'themes-generated.css');

console.log('🎨 开始生成主题 CSS...');
console.log(`📊 共 ${themes.length} 个主题`);

const css = `/**
 * 自动生成的主题 CSS
 * ⚠️ 此文件由 generate-themes.ts 自动生成，不要手动编辑
 * 生成时间: ${new Date().toISOString()}
 * 
 * 如需修改主题，请编辑 theme-config.ts
 */

${generateAllThemesCSS()}
`;

writeFileSync(outputFile, css, 'utf-8');

console.log('✅ 主题 CSS 生成成功！');
console.log(`📁 输出文件: ${outputFile}`);
console.log(`📏 文件大小: ${(css.length / 1024).toFixed(2)} KB`);

// 生成主题列表 JSON
const themesJson = JSON.stringify(
  themes.map(({ name, label, labelZh, icon, accent }) => ({
    name,
    label,
    labelZh,
    icon,
    accent,
  })),
  null,
  2
);

const jsonFile = join(outputDir, 'themes-list.json');
writeFileSync(jsonFile, themesJson, 'utf-8');

console.log(`📋 主题列表: ${jsonFile}`);
