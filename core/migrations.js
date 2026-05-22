/**
 * 数据迁移 runner
 *
 * 所有用户数据格式变更拆分为独立文件 core/migrations/001-*.js ~ 029-*.js。
 * preferences.json._dataVersion 记录已执行到的版本号（整数），
 * 启动时只跑 > _dataVersion 的条目。
 *
 * 本文件为向后兼容的 barrel re-export。
 * 添加新迁移：在 core/migrations/runner.js 的 migrations 表中添加新条目。
 */

export { runMigrations } from "./migrations/runner.js";
