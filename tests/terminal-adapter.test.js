import { describe, it, expect } from "vitest";
import { TerminalContentAdapter } from "../lib/context/adapters/terminal-adapter.js";

describe("TerminalContentAdapter", () => {
  describe("supports", () => {
    it("识别 WindowsTerminal", () => {
      expect(TerminalContentAdapter.supports("WindowsTerminal.exe", "")).toBe(true);
    });

    it("识别 PowerShell", () => {
      expect(TerminalContentAdapter.supports("powershell.exe", "")).toBe(true);
    });

    it("识别 Git Bash", () => {
      expect(TerminalContentAdapter.supports("Git Bash", "")).toBe(true);
    });

    it("不识别非终端", () => {
      expect(TerminalContentAdapter.supports("Code.exe", "")).toBe(false);
      expect(TerminalContentAdapter.supports("chrome.exe", "")).toBe(false);
    });
  });

  describe("_parseTitle", () => {
    it("解析 Windows 路径", () => {
      const result = TerminalContentAdapter._parseTitle("C:\\Users\\test\\project");
      expect(result.workingDir).toBe("C:\\Users\\test\\project");
    });

    it("解析 Windows 路径带 cmd 后缀", () => {
      const result = TerminalContentAdapter._parseTitle("C:\\Users\\test - cmd");
      expect(result.workingDir).toBe("C:\\Users\\test");
      expect(result.shellType).toBe("cmd");
    });

    it("解析 PowerShell 标题", () => {
      const result = TerminalContentAdapter._parseTitle("Windows PowerShell");
      expect(result.rawTitle).toBe("Windows PowerShell");
    });

    it("解析 Git Bash MSYS 路径", () => {
      const result = TerminalContentAdapter._parseTitle("MINGW64:/c/Users/test/project");
      expect(result.workingDir).toBe("C:\\Users\\test\\project");
      expect(result.shellType).toBe("git-bash");
    });

    it("解析 Unix 路径", () => {
      const result = TerminalContentAdapter._parseTitle("user@host:~/projects/app");
      expect(result.workingDir).toBe("~/projects/app");
    });

    it("检测 SSH 会话", () => {
      const result = TerminalContentAdapter._parseTitle("ssh user@server.com");
      expect(result.isSsh).toBe(true);
    });

    it("非 SSH 标题不误判", () => {
      const result = TerminalContentAdapter._parseTitle("C:\\Users\\test\\project");
      expect(result.isSsh).toBe(false);
    });

    it("空标题返回 null 工作目录", () => {
      const result = TerminalContentAdapter._parseTitle(null);
      expect(result.workingDir).toBeNull();
    });
  });

  describe("_msysToWindows", () => {
    it("转换 MSYS 路径为 Windows 路径", () => {
      expect(TerminalContentAdapter._msysToWindows("/c/Users/test")).toBe("C:\\Users\\test");
    });

    it("转换 D 盘路径", () => {
      expect(TerminalContentAdapter._msysToWindows("/d/Projects/app")).toBe("D:\\Projects\\app");
    });
  });

  describe("extract", () => {
    it("返回正确的结构", async () => {
      const result = await TerminalContentAdapter.extract("WindowsTerminal.exe", "C:\\Users\\test\\project");
      expect(result.type).toBe("terminal");
      expect(result.metadata.workingDir).toBe("C:\\Users\\test\\project");
    });

    it("包含 shellType", async () => {
      const result = await TerminalContentAdapter.extract("powershell.exe", "C:\\Users\\test - PowerShell");
      expect(result.metadata.shellType).toBe("powershell");
    });
  });
});
