import { describe, expect, it } from "vitest";
import { classifyWin32Command } from "../../lib/sandbox/win32-command-router.js";

describe("Windows sandbox can call Windows tools", () => {
  describe("Windows system executables", () => {
    it("recognizes ipconfig as Windows system executable", () => {
      const result = classifyWin32Command("ipconfig");
      expect(result.runner).toBe("cmd");
      expect(result.reason).toBe("windows-system-executable");
    });

    it("recognizes systeminfo as Windows system executable", () => {
      const result = classifyWin32Command("systeminfo");
      expect(result.runner).toBe("cmd");
      expect(result.reason).toBe("windows-system-executable");
    });

    it("recognizes tasklist as Windows system executable", () => {
      const result = classifyWin32Command("tasklist");
      expect(result.runner).toBe("cmd");
      expect(result.reason).toBe("windows-system-executable");
    });

    it("recognizes netstat as Windows system executable", () => {
      const result = classifyWin32Command("netstat -an");
      expect(result.runner).toBe("cmd");
      expect(result.reason).toBe("windows-system-executable");
    });

    it("recognizes ping as Windows system executable", () => {
      const result = classifyWin32Command("ping 127.0.0.1");
      expect(result.runner).toBe("cmd");
      expect(result.reason).toBe("windows-system-executable");
    });
  });

  describe("Windows GUI applications in whitelist", () => {
    it("recognizes notepad.exe as GUI whitelisted", () => {
      const result = classifyWin32Command("notepad.exe");
      expect(result.runner).toBe("cmd");
    });

    it("recognizes calc.exe as GUI whitelisted", () => {
      const result = classifyWin32Command("calc.exe");
      expect(result.runner).toBe("cmd");
    });

    it("recognizes cmd.exe as explicit windows shell", () => {
      const result = classifyWin32Command("cmd.exe /c echo hello");
      expect(result.runner).toBe("cmd");
      expect(result.reason).toBe("explicit-windows-shell");
    });

    it("recognizes powershell.exe as explicit windows shell", () => {
      const result = classifyWin32Command("powershell.exe -Command 'Get-Process'");
      expect(result.runner).toBe("cmd");
      expect(result.reason).toBe("explicit-windows-shell");
    });
  });

  describe("Windows cmd builtins", () => {
    it("recognizes dir as cmd builtin", () => {
      const result = classifyWin32Command("dir");
      expect(result.runner).toBe("cmd");
      expect(result.reason).toBe("cmd-builtin");
    });

    it("recognizes copy as cmd builtin", () => {
      const result = classifyWin32Command("copy a.txt b.txt");
      expect(result.runner).toBe("cmd");
      expect(result.reason).toBe("cmd-builtin");
    });

    it("recognizes del as cmd builtin", () => {
      const result = classifyWin32Command("del temp.txt");
      expect(result.runner).toBe("cmd");
      expect(result.reason).toBe("cmd-builtin");
    });

    it("recognizes echo as cmd builtin", () => {
      const result = classifyWin32Command("echo hello world");
      expect(result.runner).toBe("cmd");
      expect(result.reason).toBe("cmd-builtin");
    });
  });

  describe("Python and Node commands", () => {
    it("recognizes python as python command", () => {
      const result = classifyWin32Command("python --version");
      expect(result.runner).toBe("python");
      expect(result.reason).toBe("python-command");
    });

    it("recognizes node as node command", () => {
      const result = classifyWin32Command("node -v");
      expect(result.runner).toBe("node");
      expect(result.reason).toBe("node-command");
    });
  });

  describe("Complex shell syntax falls back to bash", () => {
    it("pipes use bash runner", () => {
      const result = classifyWin32Command("dir | findstr txt");
      expect(result.runner).toBe("bash");
      expect(result.reason).toBe("complex-shell");
    });

    it("semicolon chain uses bash runner", () => {
      const result = classifyWin32Command("echo a; echo b");
      expect(result.runner).toBe("bash");
      expect(result.reason).toBe("complex-shell");
    });
  });
});
