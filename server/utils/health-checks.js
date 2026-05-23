/**
 * health-checks.js — 系统健康检查项定义
 * 供 system.js 路由和测试使用
 */
import fs from "fs";
import path from "path";

const MIN_NODE_VERSION = 18;
const MIN_DISK_MB = 500;

const CHECKS = [
  {
    id: "better-sqlite3",
    name: "记忆数据库",
    fixAction: "rebuild-better-sqlite3",
    impact: "记忆系统不可用",
    test: async () => {
      try {
        const mod = await import("better-sqlite3");
        const Database = mod?.default || mod;
        const db = new Database(":memory:");
        db.exec("SELECT 1");
        db.close();
        return { status: "ok" };
      } catch (err) {
        return { status: "failed", error: err.message };
      }
    },
  },
  {
    id: "sharp",
    name: "图像处理",
    fixAction: "rebuild-sharp",
    impact: "图像处理功能受限",
    test: async () => {
      try {
        const mod = await import("sharp");
        const sharp = mod?.default || mod;
        await sharp({
          create: {
            width: 1,
            height: 1,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 1 },
          },
        })
          .png()
          .toBuffer();
        return { status: "ok" };
      } catch (err) {
        return { status: "failed", error: err.message };
      }
    },
  },
  {
    id: "node-version",
    name: "Node.js 版本",
    fixAction: null,
    impact: `部分功能需要 Node.js ≥ ${MIN_NODE_VERSION}`,
    test: async () => {
      const major = Number.parseInt(process.version.slice(1).split(".")[0], 10);
      if (major >= MIN_NODE_VERSION) {
        return { status: "ok" };
      }
      return {
        status: "failed",
        error: `当前版本 ${process.version}，需要 ≥ v${MIN_NODE_VERSION}`,
      };
    },
  },
  {
    id: "disk-space",
    name: "磁盘空间",
    fixAction: null,
    impact: `可用空间不足 ${MIN_DISK_MB}MB 可能导致运行异常`,
    test: async () => {
      try {
        // Use project root as the target directory
        const cwd = process.cwd();
        const stat = await fs.promises.statfs(cwd);
        const freeMB = Math.floor((stat.bfree * stat.bsize) / (1024 * 1024));
        if (freeMB >= MIN_DISK_MB) {
          return { status: "ok" };
        }
        return {
          status: "failed",
          error: `可用空间仅 ${freeMB}MB，建议 ≥ ${MIN_DISK_MB}MB`,
        };
      } catch (err) {
        return { status: "failed", error: err.message };
      }
    },
  },
  {
    id: "pnpm-lock",
    name: "依赖一致性",
    fixAction: "pnpm-install",
    impact: "依赖可能不一致，部分功能可能异常",
    test: async () => {
      try {
        const lockPath = path.join(process.cwd(), "pnpm-lock.yaml");
        await fs.promises.access(lockPath, fs.constants.R_OK);
        return { status: "ok" };
      } catch {
        return {
          status: "failed",
          error: "pnpm-lock.yaml 不存在或无读取权限",
        };
      }
    },
  },
];

const FIX_MAP = {
  "rebuild-better-sqlite3": {
    command: "pnpm rebuild better-sqlite3",
    name: "better-sqlite3",
  },
  "rebuild-sharp": {
    command: "pnpm rebuild sharp",
    name: "sharp",
  },
  "pnpm-install": {
    command: "pnpm install --frozen-lockfile",
    name: "依赖",
  },
  "rebuild-all": {
    command: "pnpm rebuild",
    name: "所有依赖",
  },
};

/**
 * 运行所有健康检查
 * @returns {{ status: 'healthy'|'degraded'|'critical', checks: Array }}
 */
export async function runHealthChecks() {
  const results = [];
  let hasFailed = false;
  let hasCritical = false;

  for (const check of CHECKS) {
    try {
      const result = await check.test();
      results.push({
        id: check.id,
        name: check.name,
        status: result.status,
        error: result.error || null,
        fixable: result.status === "failed" && check.fixAction !== null,
        fixAction: result.status === "failed" ? check.fixAction : null,
        impact: result.status === "failed" ? check.impact : null,
      });
      if (result.status === "failed") {
        hasFailed = true;
      }
    } catch (err) {
      results.push({
        id: check.id,
        name: check.name,
        status: "error",
        error: err.message,
        fixable: true,
        fixAction: check.fixAction,
        impact: check.impact,
      });
      hasCritical = true;
    }
  }

  const status = hasCritical ? "critical" : hasFailed ? "degraded" : "healthy";
  return { status, checks: results };
}

/**
 * 获取修复命令配置
 * @param {string} action
 * @returns {{ command: string, name: string } | null}
 */
export function getFixAction(action) {
  return FIX_MAP[action] || null;
}

export { CHECKS, FIX_MAP };
