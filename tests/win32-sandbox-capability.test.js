import { describe, expect, it } from "vitest";
import { deriveSandboxPolicy, GUI_WHITELIST } from "../lib/sandbox/policy.js";
import path from "path";
import fs from "fs";
import os from "os";

describe("Windows sandbox tool invocation capability", () => {
  describe("GUI whitelist verification", () => {
    it("includes common Windows GUI tools", () => {
      expect(GUI_WHITELIST).toContain("notepad.exe");
      expect(GUI_WHITELIST).toContain("calc.exe");
      expect(GUI_WHITELIST).toContain("msg.exe");
      expect(GUI_WHITELIST).toContain("powershell.exe");
      expect(GUI_WHITELIST).toContain("cmd.exe");
    });

    it("GUI whitelist has at least 5 entries", () => {
      expect(GUI_WHITELIST.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe("Policy derivation for Windows tools", () => {
    function makeTree() {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hana-win32-policy-"));
      const hanakoHome = path.join(tempRoot, "hana-home");
      const agentDir = path.join(hanakoHome, "agents", "hana");
      const workspace = path.join(tempRoot, "workspace");

      for (const dir of [
        hanakoHome,
        agentDir,
        workspace,
        path.join(agentDir, "memory"),
        path.join(agentDir, "sessions"),
        path.join(hanakoHome, "user"),
        path.join(hanakoHome, "logs"),
      ]) {
        fs.mkdirSync(dir, { recursive: true });
      }

      return { tempRoot, hanakoHome, agentDir, workspace };
    }

    it("derives policy with guiWhitelist for Windows tools", () => {
      const { hanakoHome, agentDir, workspace } = makeTree();
      const policy = deriveSandboxPolicy({
        agentDir,
        workspace,
        workspaceFolders: [],
        hanakoHome,
        mode: "standard",
      });

      expect(policy.guiWhitelist).toBeDefined();
      expect(policy.guiWhitelist).toEqual(GUI_WHITELIST);
      expect(policy.mode).toBe("standard");
    });

    it("derives policy with writablePaths for Windows tool output", () => {
      const { hanakoHome, agentDir, workspace } = makeTree();
      const policy = deriveSandboxPolicy({
        agentDir,
        workspace,
        workspaceFolders: [],
        hanakoHome,
        mode: "standard",
      });

      expect(policy.writablePaths).toContain(workspace);
      expect(policy.writablePaths).toContain(path.join(agentDir, "memory"));
      expect(policy.writablePaths).toContain(path.join(hanakoHome, "logs"));
    });
  });

  describe("Windows system tools accessibility", () => {
    it("ipconfig is accessible via where.exe", () => {
      const { spawnSync } = require("child_process");
      const result = spawnSync("where.exe", ["ipconfig"], {
        encoding: "utf-8",
        windowsHide: true,
        timeout: 3000,
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("ipconfig.exe");
    });

    it("systeminfo is accessible via where.exe", () => {
      const { spawnSync } = require("child_process");
      const result = spawnSync("where.exe", ["systeminfo"], {
        encoding: "utf-8",
        windowsHide: true,
        timeout: 5000,
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("systeminfo.exe");
    });

    it("tasklist is accessible via where.exe", () => {
      const { spawnSync } = require("child_process");
      const result = spawnSync("where.exe", ["tasklist"], {
        encoding: "utf-8",
        windowsHide: true,
        timeout: 3000,
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("tasklist.exe");
    });
  });

  describe("Sandbox preflight does not block Windows tools", () => {
    it("ipconfig is not blocked by preflight", () => {
      const PREFLIGHT_WIN32 = [
        [/\bdel\s+\/s/i, "noDelRecursive"],
        [/\breg\s+(delete|add)\b/i, "noRegEdit"],
        [/\btakeown\b/i, "noTakeown"],
        [/\bformat\s+[a-z]:/i, "noFormat"],
        [/\bbcdedit\b/i, "noBcdedit"],
      ];

      const command = "ipconfig /all";
      const blocked = PREFLIGHT_WIN32.find(([pattern]) => pattern.test(command));
      expect(blocked).toBeUndefined();
    });

    it("systeminfo is not blocked by preflight", () => {
      const PREFLIGHT_WIN32 = [
        [/\bdel\s+\/s/i, "noDelRecursive"],
        [/\breg\s+(delete|add)\b/i, "noRegEdit"],
        [/\btakeown\b/i, "noTakeown"],
        [/\bformat\s+[a-z]:/i, "noFormat"],
        [/\bbcdedit\b/i, "noBcdedit"],
      ];

      const command = "systeminfo";
      const blocked = PREFLIGHT_WIN32.find(([pattern]) => pattern.test(command));
      expect(blocked).toBeUndefined();
    });

    it("netstat is not blocked by preflight", () => {
      const PREFLIGHT_WIN32 = [
        [/\bdel\s+\/s/i, "noDelRecursive"],
        [/\breg\s+(delete|add)\b/i, "noRegEdit"],
        [/\btakeown\b/i, "noTakeown"],
        [/\bformat\s+[a-z]:/i, "noFormat"],
        [/\bbcdedit\b/i, "noBcdedit"],
      ];

      const command = "netstat -an";
      const blocked = PREFLIGHT_WIN32.find(([pattern]) => pattern.test(command));
      expect(blocked).toBeUndefined();
    });
  });
});
