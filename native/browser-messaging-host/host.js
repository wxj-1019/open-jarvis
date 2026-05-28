#!/usr/bin/env node
/**
 * Native Messaging Host
 * 浏览器扩展与 OpenJarvis 之间的桥梁
 * 通过 stdin/stdout 与浏览器通信（Native Messaging 协议）
 */

const fs = require("fs");
const path = require("path");

// 读取消息（Native Messaging 协议：4 字节长度前缀 + JSON 负载）
function readMessage() {
  const lengthBuffer = Buffer.alloc(4);
  const bytesRead = fs.readSync(0, lengthBuffer, 0, 4, null);
  if (bytesRead < 4) return null;

  const length = lengthBuffer.readUInt32LE(0);
  if (length === 0) return null;

  const messageBuffer = Buffer.alloc(length);
  const msgBytesRead = fs.readSync(0, messageBuffer, 0, length, null);
  if (msgBytesRead < length) return null;

  return JSON.parse(messageBuffer.toString("utf8"));
}

// 发送消息（Native Messaging 协议）
function sendMessage(message) {
  const buffer = Buffer.from(JSON.stringify(message), "utf8");
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32LE(buffer.length, 0);

  fs.writeSync(1, lengthBuffer);
  fs.writeSync(1, buffer);
}

// 主循环
async function main() {
  console.error("[OpenJarvis Host] Started");

  // 连接到 OpenJarvis（通过文件套接字或 HTTP）
  const openjarvisSocket = process.env.OPENJARVIS_SOCKET;

  while (true) {
    try {
      const message = readMessage();
      if (!message) break;

      console.error("[OpenJarvis Host] Received:", message.action);

      // 转发到 OpenJarvis
      if (openjarvisSocket) {
        // 通过 socket 转发
        await forwardToOpenJarvis(message, openjarvisSocket);
      } else {
        // 写入文件供 OpenJarvis 轮询（降级方案）
        await writeToFallbackFile(message);
      }

      // 发送确认
      sendMessage({ status: "ok", received: message.action });
    } catch (err) {
      console.error("[OpenJarvis Host] Error:", err.message);
      sendMessage({ status: "error", message: err.message });
    }
  }
}

async function forwardToOpenJarvis(message, socketPath) {
  // TODO: 实现 Unix Domain Socket / Named Pipe 通信
  // 当前：写入 JSONL 文件
  await writeToFallbackFile(message);
}

async function writeToFallbackFile(message) {
  const fallbackDir = path.join(
    process.env.HOME || process.env.USERPROFILE,
    ".openjarvis",
    "browser-bridge",
  );
  fs.mkdirSync(fallbackDir, { recursive: true });

  const fallbackFile = path.join(fallbackDir, "messages.jsonl");
  const line = JSON.stringify({ ...message, _receivedAt: Date.now() }) + "\n";

  fs.appendFileSync(fallbackFile, line);
}

main().catch((err) => {
  console.error("[OpenJarvis Host] Fatal:", err);
  process.exit(1);
});
