import { createModuleLogger } from "../../../lib/debug-log.js";

const log = createModuleLogger("mcp-security");

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^169\.254\./,
  /^0\./,
  /^localhost$/i,
];

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export function isPrivateIp(ip) {
  if (!ip) return false;
  const normalizedIp = ip.toLowerCase().trim();
  return PRIVATE_IP_PATTERNS.some(pattern => pattern.test(normalizedIp));
}

export function validateUrl(url) {
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
