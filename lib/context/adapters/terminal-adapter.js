import { ContentAdapter } from "./base-adapter.js";

/**
 * 终端内容适配器
 * 从终端窗口标题提取当前工作目录和运行命令信息
 *
 * 常见终端标题格式：
 * - Windows Terminal: "C:\Users\xxx\project" 或 "命令提示符"
 * - PowerShell: "Windows PowerShell" 或 "C:\Users\xxx"
 * - cmd: "C:\Users\xxx\project - cmd"
 * - Git Bash: "MINGW64:/c/Users/xxx/project"
 * - iTerm2 (macOS): "user@host — project" 或 "ssh user@host"
 * - Terminal.app: "user — project — ttys001"
 */
export class TerminalContentAdapter extends ContentAdapter {
  static TERMINAL_PATTERNS = [
    /WindowsTerminal/i,
    /PowerShell/i,
    /cmd\.exe/i,
    /Command Prompt/i,
    /Git Bash/i,
    /MINGW/i,
    /iTerm/i,
    /Terminal/i,
    /Alacritty/i,
    /Kitty/i,
    /WezTerm/i,
    /Hyper/i,
    /Tabby/i,
    /ConEmu/i,
    /Cmder/i,
    /mintty/i,
  ];

  static supports(app, _title) {
    return this.TERMINAL_PATTERNS.some((re) => re.test(app));
  }

  static async extract(_app, title) {
    const parsed = this._parseTitle(title);

    return {
      type: "terminal",
      content: parsed.workingDir || parsed.rawTitle,
      metadata: {
        workingDir: parsed.workingDir,
        shellType: parsed.shellType,
        isSsh: parsed.isSsh,
        rawTitle: parsed.rawTitle,
      },
    };
  }

  /**
   * 解析终端窗口标题
   * @param {string} title
   * @returns {{ workingDir: string|null, shellType: string|null, isSsh: boolean, rawTitle: string }}
   */
  static _parseTitle(title) {
    const rawTitle = title || "";
    const result = { workingDir: null, shellType: null, isSsh: false, rawTitle };

    if (!title) return result;

    // 检测 SSH 会话
    if (/^ssh\s/i.test(title) || /@.*—.*ssh/i.test(title)) {
      result.isSsh = true;
    }

    // Windows 路径格式: "C:\Users\xxx\project" 或 "C:\Users\xxx\project - cmd"
    const windowsPath = title.match(/^([A-Za-z]:\\[^\s-]+)/);
    if (windowsPath) {
      result.workingDir = windowsPath[1].trim();
      result.shellType = this._detectWindowsShell(title);
      return result;
    }

    // Git Bash / MSYS2 格式: "MINGW64:/c/Users/xxx/project"
    const msysPath = title.match(/MINGW(?:\d+):(.+)/);
    if (msysPath) {
      // 转换 /c/Users/xxx 为 C:\Users\xxx
      result.workingDir = this._msysToWindows(msysPath[1].trim());
      result.shellType = "git-bash";
      return result;
    }

    // Unix 路径格式: "user@host:~/project" 或 "/home/user/project"
    const unixPath = title.match(/^(?:[\w.-]+@[\w.-]+:)?([\/~][^\s—]*)/);
    if (unixPath) {
      result.workingDir = unixPath[1].trim();
      result.shellType = this._detectUnixShell(title);
      return result;
    }

    // iTerm2 / macOS Terminal: "user — project"
    const macMatch = title.match(/^([\w.-]+)\s*[—-]\s*(.+?)(?:\s*[—-]\s*.+)?$/);
    if (macMatch) {
      result.workingDir = macMatch[2].trim();
      result.shellType = "unix";
      return result;
    }

    return result;
  }

  /**
   * 检测 Windows shell 类型
   */
  static _detectWindowsShell(title) {
    if (/PowerShell/i.test(title)) return "powershell";
    if (/cmd/i.test(title)) return "cmd";
    if (/bash/i.test(title)) return "bash";
    if (/WindowsTerminal/i.test(title)) return "windows-terminal";
    return "windows";
  }

  /**
   * 检测 Unix shell 类型
   */
  static _detectUnixShell(title) {
    if (/zsh/i.test(title)) return "zsh";
    if (/bash/i.test(title)) return "bash";
    if (/fish/i.test(title)) return "fish";
    return "unix";
  }

  /**
   * 将 MSYS 路径转为 Windows 路径
   * /c/Users/xxx → C:\Users\xxx
   */
  static _msysToWindows(msysPath) {
    return msysPath
      .replace(/^\/([a-zA-Z])\//, (_, letter) => `${letter.toUpperCase()}:\\`)
      .replace(/\//g, "\\");
  }
}
