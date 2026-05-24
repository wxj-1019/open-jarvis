import { createModuleLogger } from "../../../lib/debug-log.js";
import dns from "dns";
import { promisify } from "util";

const log = createModuleLogger("mcp-security");
const resolve4 = promisify(dns.resolve4);
const resolve6 = promisify(dns.resolve6);

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^169\.254\./,
  /^0\./,
  /^localhost$/i,
  // IPv6 私有地址
  /^::1$/,
  /^fc00:/i,
  /^fd00:/i,
  /^fe80:/i,
];

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export function isPrivateIp(ip) {
  if (!ip) return false;
  const normalizedIp = ip.toLowerCase().trim();
  return PRIVATE_IP_PATTERNS.some(pattern => pattern.test(normalizedIp));
}

export async function validateUrl(url) {
  if (!url || typeof url !== "string") {
    throw new Error("URL is required");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (!ALLOWED_PROTOCOLS.has(parsedUrl.protocol)) {
    throw new Error(`Protocol not allowed: ${parsedUrl.protocol}. Only http and https are allowed`);
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  
  if (hostname === "localhost" || hostname === "0.0.0.0") {
    throw new Error(`Localhost not allowed: ${hostname}`);
  }

  if (isPrivateIp(hostname)) {
    throw new Error(`Private IP address not allowed: ${hostname}`);
  }

  // DNS Rebinding 防护：解析域名并验证实际 IP
  if (!isPrivateIp(hostname) && hostname !== "0.0.0.0") {
    try {
      const [ipv4Results, ipv6Results] = await Promise.allSettled([
        resolve4(hostname),
        resolve6(hostname),
      ]);

      const allIps = [];
      if (ipv4Results.status === "fulfilled") {
        allIps.push(...ipv4Results.value);
      }
      if (ipv6Results.status === "fulfilled") {
        allIps.push(...ipv6Results.value);
      }

      // 检查是否有任何解析结果指向私有 IP
      for (const ip of allIps) {
        if (isPrivateIp(ip)) {
          throw new Error(`DNS resolution points to private IP: ${ip} (DNS Rebinding blocked)`);
        }
      }
    } catch (err) {
      if (err.message.includes("DNS Rebinding")) {
        throw err;
      }
      // DNS 解析失败时记录警告但不阻止（可能是内部域名）
      log?.warn?.(`DNS resolution failed for ${hostname}: ${err.message}`);
    }
  }

  return parsedUrl;
}

export function sanitizeConnectorConfig(config) {
  const sanitized = { ...config };
  
  if (sanitized.url) {
    validateUrl(sanitized.url);
  }

  if (sanitized.command) {
    const allowedCommands = new Set([
      "npx", "node", "python", "python3", 
      "uvx", "uv", "pipx", "docker", "deno", "bun"
    ]);
    const baseCommand = sanitized.command.split(/[\\\/]/).pop().split(/\s/)[0];
    if (!allowedCommands.has(baseCommand.toLowerCase())) {
      throw new Error(`Command not allowed: ${sanitized.command}`);
    }
  }

  return sanitized;
}
