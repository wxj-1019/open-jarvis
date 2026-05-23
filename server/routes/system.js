import { Hono } from "hono";
import { exec } from "child_process";
import { promisify } from "util";
import { createModuleLogger } from "../../lib/debug-log.js";
import { runHealthChecks, getFixAction } from "../utils/health-checks.js";

const execAsync = promisify(exec);
const log = createModuleLogger("system-health");

export function createSystemRoute() {
  const app = new Hono();

  app.get("/system/health", async (c) => {
    try {
      const health = await runHealthChecks();
      return c.json(health);
    } catch (err) {
      log.error("Health check failed:", err.message);
      return c.json(
        { status: "error", error: "Health check failed", checks: [] },
        500
      );
    }
  });

  app.post("/system/fix/:action", async (c) => {
    const action = c.req.param("action");
    const fix = getFixAction(action);
    if (!fix) {
      return c.json(
        { success: false, error: `Unknown fix action: ${action}` },
        400
      );
    }

    try {
      log.info(`Starting fix: ${action}`);
      const { stdout, stderr } = await execAsync(fix.command, {
        cwd: process.cwd(),
        timeout: 300000,
      });

      log.info(`Fix completed: ${action}`, stdout);
      if (stderr) log.warn(`Fix stderr: ${action}`, stderr);

      return c.json({
        success: true,
        message: `${fix.name} 重建成功`,
        requiresRestart: true,
      });
    } catch (err) {
      log.error(`Fix failed: ${action}`, err.message, err.stderr);
      return c.json(
        {
          success: false,
          error: `修复失败: ${err.message}`,
        },
        500
      );
    }
  });

  return app;
}
