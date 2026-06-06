import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("sign-windows.cjs", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-sign-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("应导出正确的脚本内容", () => {
    const scriptPath = path.resolve(import.meta.dirname, "..", "scripts", "sign-windows.cjs");
    expect(fs.existsSync(scriptPath)).toBe(true);
    const content = fs.readFileSync(scriptPath, "utf-8");
    expect(content).toContain("WIN_CSC_LINK");
    expect(content).toContain("WIN_CSC_KEY_PASSWORD");
    expect(content).toContain("signtool");
    expect(content).toContain("timestamp.digicert.com");
  });

  it("应包含用法说明", () => {
    const scriptPath = path.resolve(import.meta.dirname, "..", "scripts", "sign-windows.cjs");
    const content = fs.readFileSync(scriptPath, "utf-8");
    expect(content).toContain("用法:");
    expect(content).toContain("node scripts/sign-windows.cjs");
  });

  it("应包含环境变量缺失时的错误提示", () => {
    const scriptPath = path.resolve(import.meta.dirname, "..", "scripts", "sign-windows.cjs");
    const content = fs.readFileSync(scriptPath, "utf-8");
    expect(content).toContain("未设置 WIN_CSC_LINK");
  });
});
