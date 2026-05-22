import fs from "fs";
import os from "os";
import path from "path";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/i18n.js", () => ({
  t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
}));

vi.mock("../lib/debug-log.js", () => ({
  createModuleLogger: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

let tempDir;
let agentsDir;
let agentDir;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-backup-route-"));
  agentsDir = path.join(tempDir, "agents");
  agentDir = path.join(agentsDir, "test-agent");
  fs.mkdirSync(agentDir, { recursive: true });
  fs.mkdirSync(path.join(agentDir, "memory"), { recursive: true });
  fs.writeFileSync(
    path.join(agentDir, "config.yaml"),
    'agent:\n  name: "Test Agent"\n  yuan: hanako\n',
    "utf-8"
  );
  fs.writeFileSync(path.join(agentDir, "identity.md"), "# Identity", "utf-8");
  fs.writeFileSync(path.join(agentDir, "pinned.md"), "", "utf-8");
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function createTestApp(agentManagerOverrides = {}) {
  const defaultManager = {
    exportAgent: vi.fn(async (id, outPath) => {
      const { exportAgent } = await import("../lib/backup/agent-backup.js");
      return exportAgent(path.join(agentsDir, id), outPath);
    }),
    importAgent: vi.fn(async (zipPath, agentId) => {
      const { importAgent } = await import("../lib/backup/agent-backup.js");
      const result = await importAgent(zipPath, path.join(agentsDir, agentId));
      return { id: agentId, manifest: result.manifest };
    }),
    ...agentManagerOverrides,
  };
  const app = new Hono();
  const backupDir = path.join(tempDir, "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const engine = { agentsDir, backupDir };
  return { app, engine, agentManager: defaultManager };
}

describe("POST /api/agents/:id/backup", () => {
  it("应返回 200 和 manifest", async () => {
    const { createAgentsRoute } = await import("../server/routes/agents.js");
    const { app, engine } = createTestApp();
    const route = createAgentsRoute(engine);
    app.route("/api", route);

    const res = await app.request("/api/agents/test-agent/backup", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.manifest).toBeTruthy();
    expect(body.manifest.format).toBe("hana-agent-backup");
  });

  it("agent 不存在时应返回错误", async () => {
    const { createAgentsRoute } = await import("../server/routes/agents.js");
    const { app, engine } = createTestApp();
    const route = createAgentsRoute(engine);
    app.route("/api", route);

    const res = await app.request("/api/agents/nonexistent/backup", { method: "POST" });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
