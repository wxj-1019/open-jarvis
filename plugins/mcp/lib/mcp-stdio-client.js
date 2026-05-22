import { spawn } from "node:child_process";
import { requestTimeoutMs } from "./mcp-utils.js";

export const MCP_PROTOCOL_VERSION = "2025-11-25";

export class McpStdioClient {
  constructor(server, { log = console, onNotification, onRequest } = {}) {
    this.server = server;
    this.log = log;
    this.process = null;
    this._nextId = 1;
    this._pending = new Map();
    this._stdoutBuffer = "";
    this._closed = false;
    this._notificationHandler = onNotification || null;
    this._requestHandler = onRequest || null;
    this.serverCapabilities = null;
    this.serverInfo = null;
  }

  get running() {
    return !!this.process && !this._closed && this.process.exitCode == null;
  }

  async start() {
    if (this.running) return;
    if (!this.server?.command) throw new Error("MCP server command is required");

    this._closed = false;
    this.process = spawn(this.server.command, this.server.args || [], {
      cwd: this.server.cwd || undefined,
      env: { ...process.env, ...registryEnv(this.server), ...(this.server.env || {}) },
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
    });

    this.process.stdout.setEncoding("utf-8");
    this.process.stdout.on("data", (chunk) => this._onStdout(chunk));
    this.process.stderr.setEncoding("utf-8");
    this.process.stderr.on("data", (chunk) => {
      const text = String(chunk).trim();
      if (text) this.log.debug?.(`[mcp:${this.server.id}] ${text}`);
    });
    this.process.on("exit", (code, signal) => {
      this._closed = true;
      const reason = signal || (code ?? "unknown");
      const err = new Error(`MCP server exited (${reason})`);
      for (const pending of this._pending.values()) pending.reject(err);
      this._pending.clear();
    });
    this.process.on("error", (err) => {
      this._closed = true;
      for (const pending of this._pending.values()) pending.reject(err);
      this._pending.clear();
    });

    await this.initialize();
  }

  async initialize() {
    const result = await this.request("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        sampling: {},
        roots: { listChanged: true },
        elicitation: {},
      },
      clientInfo: {
        name: "jarvis",
        title: "Jarvis",
        version: "0.222.29",
      },
    }, { timeout: requestTimeoutMs(this.server) });
    this.serverCapabilities = result?.capabilities || null;
    this.serverInfo = result?.serverInfo || null;
    if (typeof result?.protocolVersion === "string") {
      this._negotiatedProtocolVersion = result.protocolVersion;
    }
    this.notify("notifications/initialized", {});
    return result;
  }

  async listTools() {
    const result = await this.request("tools/list", {}, { timeout: requestTimeoutMs(this.server) });
    return Array.isArray(result?.tools) ? result.tools : [];
  }

  async callTool(name, args) {
    return this.request("tools/call", {
      name,
      arguments: args || {},
    }, { timeout: requestTimeoutMs(this.server) });
  }

  async ping() {
    return this.request("ping", {}, { timeout: requestTimeoutMs(this.server) });
  }

  async listResources(cursor) {
    const params = cursor ? { cursor } : {};
    const result = await this.request("resources/list", params, { timeout: requestTimeoutMs(this.server) });
    return result || { resources: [] };
  }

  async listResourceTemplates(cursor) {
    const params = cursor ? { cursor } : {};
    const result = await this.request("resources/templates/list", params, { timeout: requestTimeoutMs(this.server) });
    return result || { resourceTemplates: [] };
  }

  async readResource(uri) {
    return this.request("resources/read", { uri }, { timeout: requestTimeoutMs(this.server) });
  }

  async subscribeResource(uri) {
    return this.request("resources/subscribe", { uri }, { timeout: requestTimeoutMs(this.server) });
  }

  async unsubscribeResource(uri) {
    return this.request("resources/unsubscribe", { uri }, { timeout: requestTimeoutMs(this.server) });
  }

  async listPrompts(cursor) {
    const params = cursor ? { cursor } : {};
    const result = await this.request("prompts/list", params, { timeout: requestTimeoutMs(this.server) });
    return result || { prompts: [] };
  }

  async getPrompt(name, arguments_) {
    return this.request("prompts/get", { name, arguments: arguments_ }, { timeout: requestTimeoutMs(this.server) });
  }

  async complete(ref, argument) {
    return this.request("completions/complete", { ref, argument }, { timeout: requestTimeoutMs(this.server) });
  }

  async setLogLevel(level) {
    return this.request("logging/setLevel", { level }, { timeout: requestTimeoutMs(this.server) });
  }

  rejectPending(requestId, error) {
    const pending = this._pending.get(requestId);
    if (pending) {
      this._pending.delete(requestId);
      pending.reject(error);
    }
  }

  request(method, params = {}, { timeout = 30_000 } = {}) {
    if (!this.running) throw new Error("MCP server is not running");
    const id = this._nextId++;
    const payload = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`MCP request "${method}" timed out`));
      }, timeout);
      this._pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      this._send(payload);
    });
  }

  notify(method, params = {}) {
    if (!this.running) return;
    this._send({ jsonrpc: "2.0", method, params });
  }

  async stop() {
    if (!this.process) return;
    const proc = this.process;
    this.process = null;
    this._closed = true;
    try { proc.stdin.end(); } catch { /* already closed */ }
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        try { proc.kill("SIGTERM"); } catch { /* process already exited */ }
        resolve();
      }, 2_000);
      proc.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    // Reject any remaining pending requests after process exit
    for (const pending of this._pending.values()) {
      pending.reject(new Error("MCP client stopped"));
    }
    this._pending.clear();
  }

  _send(payload) {
    if (!this.process?.stdin) return;
    const line = JSON.stringify(payload);
    try {
      this.process.stdin.write(line + "\n", "utf-8");
    } catch {
      // stdin already closed, ignore
    }
  }

  _onStdout(chunk) {
    this._stdoutBuffer += chunk;
    while (true) {
      const idx = this._stdoutBuffer.indexOf("\n");
      if (idx === -1) return;
      const line = this._stdoutBuffer.slice(0, idx).trim();
      this._stdoutBuffer = this._stdoutBuffer.slice(idx + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch (err) {
        this.log.warn?.(`[mcp:${this.server.id}] ignored non-JSON stdout: ${err.message}`);
        continue;
      }
      this._handleMessage(message);
    }
  }

  _handleMessage(message) {
    // Response: has id, no method → match pending request
    if (message?.id != null && !message.method) {
      const pending = this._pending.get(message.id);
      if (!pending) return;
      this._pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message || "MCP request failed"));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    // Server request: has both id and method → needs response
    if (message?.id != null && message.method) {
      this._onServerRequest(message.id, message.method, message.params);
      return;
    }

    // Notification: has method, no id → fire and forget
    if (message?.method) {
      if (this._notificationHandler) {
        this._notificationHandler(message.method, message.params);
      }
    }
  }

  async _onServerRequest(id, method, params) {
    if (this._requestHandler) {
      try {
        const result = await this._requestHandler(method, params);
        this._send({ jsonrpc: "2.0", id, result });
      } catch (err) {
        this._send({ jsonrpc: "2.0", id, error: { code: -32603, message: err.message } });
      }
    } else {
      this._send({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
    }
  }
}

function registryEnv(server) {
  const registryUrl = typeof server?.registryUrl === "string" ? server.registryUrl.trim() : "";
  if (!registryUrl) return {};
  const command = commandName(server.command);
  if (command === "npx" || command === "bun" || command === "bunx") {
    return { NPM_CONFIG_REGISTRY: registryUrl };
  }
  if (command === "uv" || command === "uvx") {
    return {
      UV_DEFAULT_INDEX: registryUrl,
      PIP_INDEX_URL: registryUrl,
    };
  }
  return {};
}

function commandName(command) {
  const raw = typeof command === "string" ? command.trim() : "";
  const name = raw.split(/[\\/]/).pop() || raw;
  return name.replace(/\.exe$/i, "").toLowerCase();
}
