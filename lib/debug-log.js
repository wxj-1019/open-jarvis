/**
 * debug-log.js — 持久化调试日志
 *
 * 每次 server 启动时创建一个日志文件（按时间戳命名），
 * 运行期间追加写入，关闭后下次启动写新的。
 *
 * 格式：[HH:MM:SS.mmm] [LEVEL] [MODULE] message
 * 路径：~/.hanako/logs/YYYY-MM-DD_HH-MM-SS.log
 */

import fs from "fs";
import path from "path";
import os from "os";
import { redactLogLabel, redactLogText } from "./log-redactor.js";

class DebugLog {
  /**
   * @param {string} logDir - 日志目录路径(如 ~/.hanako/logs)
   * @param {string} [prefix="jarvis"] - 日志文件名前缀(如 "jarvis" 或 "jarvis-dev")
   */
  constructor(logDir, prefix = "jarvis") {
    fs.mkdirSync(logDir, { recursive: true });

    const now = new Date();
    const ts = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-") + "_" + [
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join("-");

    this._filePath = path.join(logDir, `${prefix}-${ts}.log`);
    this._logDir = logDir;
    this._size = 0;
    this._redactOptions = { homeDir: os.homedir() };

    // 去重状态:记录上一条写入的内容
    this._dedup = { level: null, module: null, msg: null, count: 0 };
    
    // 去重超时定时器:防止相同日志延迟太久不写入
    this._dedupTimer = null;
    this._dedupTimeoutMs = 2000; // 2秒后强制写入重复日志摘要

    // 清理超过 7 天的旧日志
    this._cleanup(7);
  }

  get filePath() { return this._filePath; }

  /**
   * 写启动头部信息
   * @param {string} version - 应用版本号
   * @param {object} info - 启动信息
   */
  header(version, info = {}) {
    const lines = [
      "═".repeat(60),
      `Jarvis v${version} — started at ${new Date().toISOString()}`,
      "═".repeat(60),
    ];

    if (info.model) lines.push(`Model: ${info.model}`);
    if (info.agent) lines.push(`Agent: ${info.agent} (${info.agentId || "?"})`);
    if (info.utilityModel) lines.push(`Utility: ${info.utilityModel}`);
    if (info.channelsDir) lines.push("Channels: configured");

    lines.push("─".repeat(60), "");

    fs.appendFileSync(
      this._filePath,
      lines.map((line) => redactLogText(line, this._redactOptions)).join("\n") + "\n",
      "utf-8",
    );
  }

  /**
   * 写关闭标记
   */
  close() {
    this._clearDedupTimer();
    this._flushDedup();
    this._write("INFO", "system", "Server shutting down");
    fs.appendFileSync(this._filePath, "\n" + "═".repeat(60) + "\n", "utf-8");
  }

  /** INFO 级别日志 */
  log(module, msg) {
    this._write("INFO", module, msg);
  }

  /** ERROR 级别日志 */
  error(module, msg) {
    this._write("ERROR", module, msg);
  }

  /** WARN 级别日志 */
  warn(module, msg) {
    this._write("WARN", module, msg);
  }

  /**
   * 读取最近 N 行日志
   * @param {number} n - 行数
   * @returns {string[]}
   */
  tail(n = 100) {
    try {
      const content = fs.readFileSync(this._filePath, "utf-8");
      const lines = content.split("\n");
      return lines.slice(-n);
    } catch {
      return [];
    }
  }

  /** 对消息做隐私清洗后写入(含去重判断) */
  _write(level, module, msg) {
    const cleanModule = redactLogLabel(module || "unknown");
    const cleaned = redactLogText(String(msg), this._redactOptions);

    // 去重:与上一条完全相同则只计数
    const d = this._dedup;
    if (d.level === level && d.module === cleanModule && d.msg === cleaned) {
      d.count++;
      // 启动超时定时器:2秒后强制写入
      this._startDedupTimer();
      return;
    }

    // 有积压的重复条目,先补写一行摘要
    this._flushDedup();

    // 更新去重状态
    this._dedup = { level, module: cleanModule, msg: cleaned, count: 1 };

    this._append(level, cleanModule, cleaned);
  }

  /** 把积压的"重复 N 次"补写进文件 */
  _flushDedup() {
    this._clearDedupTimer();
    const d = this._dedup;
    if (d.count > 1) {
      this._append("INFO", "dedup", `⤷ 上条重复 ${d.count} 次`);
    }
    this._dedup = { level: null, module: null, msg: null, count: 0 };
  }

  /** 启动去重超时定时器 */
  _startDedupTimer() {
    if (this._dedupTimer) return; // 已有时钟,不重复创建
    this._dedupTimer = setTimeout(() => {
      this._flushDedup();
    }, this._dedupTimeoutMs);
  }

  /** 清除去重超时定时器 */
  _clearDedupTimer() {
    if (this._dedupTimer) {
      clearTimeout(this._dedupTimer);
      this._dedupTimer = null;
    }
  }

  /** 底层写入（单文件上限 5MB，超限后截断头部继续写入） */
  _append(level, module, msg) {
    const MAX = 5 * 1024 * 1024;
    const TRUNCATE_THRESHOLD = MAX;
    const KEEP_SIZE = 3 * 1024 * 1024; // 截断后保留尾部 3MB

    // 检查是否需要截断
    if (this._size >= TRUNCATE_THRESHOLD) {
      this._truncateLogFile(KEEP_SIZE);
    }

    const now = new Date();
    const time = [
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join(":") + "." + String(now.getMilliseconds()).padStart(3, "0");

    const line = `[${time}] [${level}] [${module}] ${msg}\n`;

    try {
      fs.appendFileSync(this._filePath, line, "utf-8");
      this._size += Buffer.byteLength(line, "utf-8");
    } catch {
      // 写日志失败不应阻塞业务
    }
  }

  /** 清理超过 maxDays 天的旧日志 */
  _cleanup(maxDays) {
    try {
      const cutoff = Date.now() - maxDays * 24 * 60 * 60 * 1000;
      const files = fs.readdirSync(this._logDir).filter(f => f.endsWith(".log"));

      for (const f of files) {
        const filePath = path.join(this._logDir, f);
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
        }
      }
    } catch {
      // 清理失败不影响运行
    }
  }

  /** 截断日志文件,保留尾部指定字节数 */
  _truncateLogFile(keepBytes) {
    try {
      const content = fs.readFileSync(this._filePath, "utf-8");
      const buffer = Buffer.from(content, "utf-8");
      
      if (buffer.length <= keepBytes) {
        this._size = buffer.length;
        return;
      }

      // 保留尾部内容
      const truncated = buffer.slice(buffer.length - keepBytes);
      let text = truncated.toString("utf-8");
      
      // 确保从完整行开始(找到第一个换行符后的内容)
      const firstNewline = text.indexOf("\n");
      if (firstNewline !== -1) {
        text = text.slice(firstNewline + 1);
      }

      // 写入截断标记和保留的内容
      const header = `[日志文件超过 5MB，已自动截断保留尾部内容]\n${"─".repeat(60)}\n`;
      fs.writeFileSync(this._filePath, header + text, "utf-8");
      
      this._size = Buffer.byteLength(header + text, "utf-8");
      
      this._write("INFO", "system", `日志文件已自动截断，保留尾部 ${Math.round(keepBytes / 1024)}KB`);
    } catch (err) {
      this._write("ERROR", "system", `日志截断失败: ${err.message}`);
    }
  }
}

// ── 全局单例 ──

let _instance = null;

/**
 * 初始化全局日志实例
 * @param {string} logDir - 日志目录路径
 * @param {string} [prefix="jarvis"] - 日志文件名前缀
 * @returns {DebugLog}
 */
export function initDebugLog(logDir, prefix = "jarvis") {
  _instance = new DebugLog(logDir, prefix);
  return _instance;
}

/**
 * 获取全局日志实例
 * @returns {DebugLog|null}
 */
export function debugLog() {
  return _instance;
}

/**
 * 创建模块专用日志器
 *
 * 同时写 console + 持久日志文件，统一替代散落的 console.error / debugLog()?.log()。
 *
 * @param {string} module - 模块标识（如 "engine", "bridge", "session"）
 * @returns {{ log: (msg: string) => void, warn: (msg: string) => void, error: (msg: string) => void }}
 *
 * @example
 * const log = createModuleLogger("bridge");
 * log.error("connection failed");
 * // console: [bridge] connection failed
 * // file:    [HH:MM:SS.mmm] [ERROR] [bridge] connection failed
 */
export function createModuleLogger(module) {
  return {
    log(msg) {
      console.log(`[${module}] ${msg}`);
      _instance?.log(module, msg);
    },
    warn(msg) {
      console.warn(`[${module}] ${msg}`);
      _instance?.warn(module, msg);
    },
    error(msg) {
      console.error(`[${module}] ${msg}`);
      _instance?.error(module, msg);
    },
  };
}
