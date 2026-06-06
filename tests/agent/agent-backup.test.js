import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import YAML from "js-yaml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractZip } from "../../lib/extract-zip.js";

let tempDir;
let agentsDir;
let agentDir;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-backup-test-"));
  agentsDir = path.join(tempDir, "agents");
  agentDir = path.join(agentsDir, "test-agent");
  fs.mkdirSync(agentDir, { recursive: true });
  fs.mkdirSync(path.join(agentDir, "memory"), { recursive: true });
  fs.mkdirSync(path.join(agentDir, "avatars"), { recursive: true });
  fs.mkdirSync(path.join(agentDir, "desk"), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function seedAgentFiles() {
  fs.writeFileSync(
    path.join(agentDir, "config.yaml"),
    'agent:\n  name: "Test Agent"\n  yuan: hanako\nmodels:\n  chat:\n    id: gpt-4\n    provider: openai\n',
    "utf-8"
  );
  fs.writeFileSync(path.join(agentDir, "identity.md"), "# Identity\nI am test.", "utf-8");
  fs.writeFileSync(path.join(agentDir, "ishiki.md"), "# Ishiki\n", "utf-8");
  fs.writeFileSync(path.join(agentDir, "pinned.md"), "Remember this.", "utf-8");
  fs.writeFileSync(path.join(agentDir, "avatars", "agent.png"), Buffer.alloc(100));
  fs.writeFileSync(
    path.join(agentDir, "memory", "compiled.json"),
    '{"facts":[],"version":1}',
    "utf-8"
  );
  fs.writeFileSync(
    path.join(agentDir, "desk", "activities.json"),
    '{"items":[]}',
    "utf-8"
  );
}

describe("exportAgent", () => {
  it("应将 agent 目录打包为合法 zip 文件", async () => {
    const { exportAgent } = await import("../lib/backup/agent-backup.js");
    seedAgentFiles();
    const outPath = path.join(tempDir, "backup.zip");
    const result = await exportAgent(agentDir, outPath);
    expect(fs.existsSync(outPath)).toBe(true);
    expect(result.manifest.agentId).toBe("test-agent");
    expect(result.manifest.format).toBe("hana-agent-backup");
    expect(result.manifest.formatVersion).toBe(1);
    expect(result.manifest.fileCount).toBeGreaterThan(0);
  });

  it("manifest 应包含正确的 agent 元数据", async () => {
    const { exportAgent } = await import("../lib/backup/agent-backup.js");
    seedAgentFiles();
    const outPath = path.join(tempDir, "backup.zip");
    const { manifest } = await exportAgent(agentDir, outPath);
    expect(manifest.agentName).toBe("Test Agent");
    expect(manifest.yuan).toBe("hanako");
    expect(manifest.createdAt).toBeTruthy();
    expect(manifest.checksum).toMatch(/^sha256:/);
    expect(manifest.appVersion).toBeTruthy();
  });

  it("应排除 sessions 目录和临时文件", async () => {
    const { exportAgent } = await import("../lib/backup/agent-backup.js");
    seedAgentFiles();
    fs.mkdirSync(path.join(agentDir, "sessions"), { recursive: true });
    fs.writeFileSync(path.join(agentDir, "sessions", "s1.jsonl"), "data");
    fs.writeFileSync(path.join(agentDir, "memory", "facts.db-journal"), "tmp");

    const outPath = path.join(tempDir, "backup.zip");
    await exportAgent(agentDir, outPath);

    const extractDir = path.join(tempDir, "extracted");
    fs.mkdirSync(extractDir, { recursive: true });
    await extractZip(outPath, extractDir);
    expect(fs.existsSync(path.join(extractDir, "sessions"))).toBe(false);
    expect(fs.existsSync(path.join(extractDir, "memory", "facts.db-journal"))).toBe(false);
  });

  it("应包含 memory 目录中的 compiled.json", async () => {
    const { exportAgent } = await import("../lib/backup/agent-backup.js");
    seedAgentFiles();
    const outPath = path.join(tempDir, "backup.zip");
    await exportAgent(agentDir, outPath);

    const extractDir = path.join(tempDir, "extracted");
    fs.mkdirSync(extractDir, { recursive: true });
    await extractZip(outPath, extractDir);
    expect(fs.existsSync(path.join(extractDir, "memory", "compiled.json"))).toBe(true);
  });

  it("应包含 avatars 目录", async () => {
    const { exportAgent } = await import("../lib/backup/agent-backup.js");
    seedAgentFiles();
    const outPath = path.join(tempDir, "backup.zip");
    await exportAgent(agentDir, outPath);

    const extractDir = path.join(tempDir, "extracted");
    fs.mkdirSync(extractDir, { recursive: true });
    await extractZip(outPath, extractDir);
    expect(fs.existsSync(path.join(extractDir, "avatars", "agent.png"))).toBe(true);
  });

  it("应包含 desk 目录", async () => {
    const { exportAgent } = await import("../lib/backup/agent-backup.js");
    seedAgentFiles();
    const outPath = path.join(tempDir, "backup.zip");
    await exportAgent(agentDir, outPath);

    const extractDir = path.join(tempDir, "extracted");
    fs.mkdirSync(extractDir, { recursive: true });
    await extractZip(outPath, extractDir);
    expect(fs.existsSync(path.join(extractDir, "desk", "activities.json"))).toBe(true);
  });

  it("checksum 应与实际 zip 文件内容一致", async () => {
    const { exportAgent } = await import("../lib/backup/agent-backup.js");
    seedAgentFiles();
    const outPath = path.join(tempDir, "backup.zip");
    const { manifest } = await exportAgent(agentDir, outPath);

    const data = fs.readFileSync(outPath);
    const expected = `sha256:${crypto.createHash("sha256").update(data).digest("hex")}`;
    expect(manifest.checksum).toBe(expected);
  });

  it("agent 目录不存在时应抛出错误", async () => {
    const { exportAgent } = await import("../lib/backup/agent-backup.js");
    const badDir = path.join(tempDir, "nonexistent");
    await expect(exportAgent(badDir, path.join(tempDir, "out.zip"))).rejects.toThrow(
      /不存在/
    );
  });

  it("config.yaml 不存在时应抛出错误", async () => {
    const { exportAgent } = await import("../lib/backup/agent-backup.js");
    const noConfigDir = path.join(tempDir, "no-config");
    fs.mkdirSync(noConfigDir, { recursive: true });
    await expect(exportAgent(noConfigDir, path.join(tempDir, "out.zip"))).rejects.toThrow(
      /config/
    );
  });
});

describe("importAgent", () => {
  it("应从备份 zip 恢复 agent 目录", async () => {
    const { exportAgent, importAgent } = await import("../lib/backup/agent-backup.js");
    seedAgentFiles();
    const backupPath = path.join(tempDir, "backup.zip");
    await exportAgent(agentDir, backupPath);

    const restoreDir = path.join(agentsDir, "restored-agent");
    const result = await importAgent(backupPath, restoreDir);
    expect(fs.existsSync(path.join(restoreDir, "config.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(restoreDir, "identity.md"))).toBe(true);
    expect(fs.existsSync(path.join(restoreDir, "pinned.md"))).toBe(true);
    expect(result.manifest.agentId).toBe("test-agent");
  });

  it("恢复的 config.yaml 应保留原始内容", async () => {
    const { exportAgent, importAgent } = await import("../lib/backup/agent-backup.js");
    seedAgentFiles();
    const backupPath = path.join(tempDir, "backup.zip");
    await exportAgent(agentDir, backupPath);

    const restoreDir = path.join(agentsDir, "restored-agent");
    await importAgent(backupPath, restoreDir);
    const cfg = YAML.load(fs.readFileSync(path.join(restoreDir, "config.yaml"), "utf-8"));
    expect(cfg.agent.name).toBe("Test Agent");
    expect(cfg.agent.yuan).toBe("hanako");
    expect(cfg.models.chat.id).toBe("gpt-4");
  });

  it("恢复后应包含 manifest 文件", async () => {
    const { exportAgent, importAgent } = await import("../lib/backup/agent-backup.js");
    seedAgentFiles();
    const backupPath = path.join(tempDir, "backup.zip");
    await exportAgent(agentDir, backupPath);

    const restoreDir = path.join(agentsDir, "restored-agent");
    await importAgent(backupPath, restoreDir);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(restoreDir, "backup-manifest.json"), "utf-8")
    );
    expect(manifest.format).toBe("hana-agent-backup");
  });

  it("恢复的 memory 目录应包含 compiled.json", async () => {
    const { exportAgent, importAgent } = await import("../lib/backup/agent-backup.js");
    seedAgentFiles();
    const backupPath = path.join(tempDir, "backup.zip");
    await exportAgent(agentDir, backupPath);

    const restoreDir = path.join(agentsDir, "restored-agent");
    await importAgent(backupPath, restoreDir);
    expect(fs.existsSync(path.join(restoreDir, "memory", "compiled.json"))).toBe(true);
  });

  it("目标目录已存在时应抛出错误", async () => {
    const { exportAgent, importAgent } = await import("../lib/backup/agent-backup.js");
    seedAgentFiles();
    const backupPath = path.join(tempDir, "backup.zip");
    await exportAgent(agentDir, backupPath);

    const restoreDir = path.join(agentsDir, "existing-agent");
    fs.mkdirSync(restoreDir, { recursive: true });
    await expect(importAgent(backupPath, restoreDir)).rejects.toThrow(/已存在/);
  });

  it("备份文件不存在时应抛出错误", async () => {
    const { importAgent } = await import("../lib/backup/agent-backup.js");
    await expect(
      importAgent(path.join(tempDir, "no-such.zip"), path.join(agentsDir, "x"))
    ).rejects.toThrow(/不存在/);
  });

  it("备份包缺少 manifest 时应抛出错误", async () => {
    const { importAgent } = await import("../lib/backup/agent-backup.js");
    const { writeZipFromDirectory } = await import("../lib/zip-writer.js");
    const badDir = path.join(tempDir, "bad");
    fs.mkdirSync(badDir);
    fs.writeFileSync(path.join(badDir, "config.yaml"), "{}", "utf-8");
    const badZip = path.join(tempDir, "bad.zip");
    await writeZipFromDirectory(badDir, badZip);

    await expect(importAgent(badZip, path.join(agentsDir, "x"))).rejects.toThrow(/manifest/);
  });

  it("校验和不匹配时应抛出错误", async () => {
    const { exportAgent, importAgent } = await import("../lib/backup/agent-backup.js");
    seedAgentFiles();
    const backupPath = path.join(tempDir, "backup.zip");
    await exportAgent(agentDir, backupPath);

    const raw = fs.readFileSync(backupPath);
    fs.writeFileSync(backupPath, Buffer.concat([raw, Buffer.from("tamper")]));

    const restoreDir = path.join(agentsDir, "tampered-restore");
    await expect(importAgent(backupPath, restoreDir)).rejects.toThrow();
  });

  it("导入失败时不应留下残余目录", async () => {
    const { exportAgent, importAgent } = await import("../lib/backup/agent-backup.js");
    seedAgentFiles();
    const backupPath = path.join(tempDir, "backup.zip");
    await exportAgent(agentDir, backupPath);

    const raw = fs.readFileSync(backupPath);
    fs.writeFileSync(backupPath, Buffer.concat([raw, Buffer.from("tamper")]));

    const restoreDir = path.join(agentsDir, "fail-restore");
    try {
      await importAgent(backupPath, restoreDir);
    } catch {}
    expect(fs.existsSync(restoreDir)).toBe(false);
    expect(fs.existsSync(`${restoreDir}.import-tmp`)).toBe(false);
  });
});
