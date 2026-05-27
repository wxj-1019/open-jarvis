import fs from "fs";
import path from "path";
import { ContentAdapter } from "./base-adapter.js";

/**
 * IDE 内容适配器
 * 从窗口标题解析文件路径，读取文件内容
 */
export class IDEContentAdapter extends ContentAdapter {
  static IDE_PATTERNS = [
    /Code|VSCodium|Cursor|WebStorm|IntelliJ|idea|PyCharm|GoLand|CLion|Android Studio|Xcode/i,
  ];

  static supports(app, _title) {
    return this.IDE_PATTERNS.some((re) => re.test(app));
  }

  static async extract(_app, title) {
    const filePath = this._parseFilePath(title);
    if (!filePath) {
      return { type: "ide", content: null, metadata: {} };
    }

    const content = await this._readFileContent(filePath);
    return {
      type: "ide",
      content,
      metadata: {
        filePath,
        language: this._detectLanguage(filePath),
      },
    };
  }

  /**
   * 从窗口标题解析文件名
   * VS Code: "filename.ext - workspaceName - Visual Studio Code"
   * Cursor: "filename.ext - Cursor"
   * IntelliJ: "filename.ext [projectName] - IntelliJ IDEA"
   */
  static _parseFilePath(title) {
    if (!title) return null;
    // IDE 窗口标题分隔符是 " - "（空格-空格），按此分割取第一段
    const firstSegment = title.split(" - ")[0].trim();
    // IntelliJ 方括号格式: "filename [project] - IntelliJ IDEA"
    const bracketIdx = firstSegment.indexOf("[");
    const candidate = (bracketIdx > 0 ? firstSegment.substring(0, bracketIdx).trim() : firstSegment);
    // 验证看起来像文件路径/名（含扩展名且长度>=3）
    if (!candidate.includes(".") || candidate.length < 3) return null;
    return candidate;
  }

  static async _readFileContent(filePath, maxLines = 50) {
    try {
      await fs.promises.access(filePath);
      const full = await fs.promises.readFile(filePath, "utf-8");
      const lines = full.split("\n");
      return lines.slice(0, maxLines).join("\n");
    } catch {
      return null;
    }
  }

  static _detectLanguage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const map = {
      ".js": "javascript", ".ts": "typescript", ".jsx": "jsx", ".tsx": "tsx",
      ".py": "python", ".java": "java", ".go": "go", ".rs": "rust",
      ".c": "c", ".cpp": "cpp", ".h": "c", ".hpp": "cpp",
      ".html": "html", ".css": "css", ".scss": "scss", ".less": "less",
      ".json": "json", ".md": "markdown", ".yaml": "yaml", ".yml": "yaml",
      ".sh": "bash", ".bash": "bash", ".zsh": "zsh",
      ".rb": "ruby", ".php": "php", ".swift": "swift", ".kt": "kotlin",
    };
    return map[ext] || "unknown";
  }
}
