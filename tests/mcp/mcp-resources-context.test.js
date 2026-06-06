/**
 * mcp-resources-context.test.js — MCP Resources 上下文注入 + 工具命名测试
 */

import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Agent } from "../../core/agent.js";
import { toMcpToolId } from "../../plugins/mcp/lib/mcp-runtime.js";

// ============================================================================
// 1. 工具命名优化
// ============================================================================

describe("MCP 工具命名 (toMcpToolId)", () => {
  it("普通工具名不添加 prompt_ 前缀", () => {
    // prompt.name 原样作为 toolName 传入 toMcpToolId
    expect(toMcpToolId("git", "get_log")).toBe("git_get_log");
    expect(toMcpToolId("filesystem", "read_file")).toBe("filesystem_read_file");
  });

  it("工具名中的特殊字符被清理", () => {
    expect(toMcpToolId("github.com", "search/repos")).toBe("github_com_search_repos");
    // 连字符 "-" 合法保留，不被 sanitize 替换
    expect(toMcpToolId("my-server", "list-users")).toBe("my-server_list-users");
  });

  it("不再出现 prompt_ 双前缀（回归防护）", () => {
    // 旧格式: mcp_git_prompt_get_log
    // 新格式: mcp_git_get_log
    const result = toMcpToolId("git", "get_log");
    expect(result).not.toContain("prompt_");
    expect(result).toBe("git_get_log");
  });
});

// ============================================================================
// 2. Agent._mcpResourcesText 字段 + updateMcpResourcesText
// ============================================================================

describe("Agent MCP Resources 字段", () => {
  let tmpDir;
  let agentsDir;
  let productDir;
  let userDir;
  let agent;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-mcp-res-"));
    agentsDir = path.join(tmpDir, "agents");
    productDir = path.join(tmpDir, "product");
    userDir = path.join(tmpDir, "user");
    fs.mkdirSync(path.join(productDir, "yuan"), { recursive: true });
    fs.mkdirSync(userDir, { recursive: true });
    fs.writeFileSync(path.join(productDir, "yuan", "hanako.md"), "valid yuan\n", "utf-8");

    const agentDir = path.join(agentsDir, "test-agent");
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentDir, "config.yaml"),
      [
        "agent:",
        "  name: MCP Test",
        "  yuan: hanako",
        "user:",
        "  name: Tester",
        "locale: zh-CN",
      ].join("\n"),
      "utf-8",
    );

    agent = new Agent({
      id: "test-agent",
      agentsDir,
      productDir,
      userDir,
    });
    agent.loadConfigOnly();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("初始 _mcpResourcesText 为空字符串", () => {
    expect(agent._mcpResourcesText).toBe("");
  });

  it("updateMcpResourcesText 设置新值", () => {
    agent.updateMcpResourcesText("[git:README] — Project readme\ncontent here");
    expect(agent._mcpResourcesText).toBe("[git:README] — Project readme\ncontent here");
  });

  it("updateMcpResourcesText 传空值清空", () => {
    agent.updateMcpResourcesText("some text");
    agent.updateMcpResourcesText("");
    expect(agent._mcpResourcesText).toBe("");
  });

  it("updateMcpResourcesText 传 null/undefined 清空", () => {
    agent.updateMcpResourcesText("some text");
    agent.updateMcpResourcesText(null);
    expect(agent._mcpResourcesText).toBe("");
    agent.updateMcpResourcesText("some text");
    agent.updateMcpResourcesText(undefined);
    expect(agent._mcpResourcesText).toBe("");
  });

  describe("buildSystemPrompt 包含 MCP Resources", () => {
    it("无资源文本时不注入 MCP Resources section", () => {
      const prompt = agent.buildSystemPrompt();
      expect(prompt).not.toContain("# MCP 连接器资源");
      expect(prompt).not.toContain("# MCP Connector Resources");
    });

    it("有资源文本时注入 # MCP 连接器资源 section", () => {
      agent.updateMcpResourcesText("[git:README] — docs\nProject documentation");
      const prompt = agent.buildSystemPrompt();
      expect(prompt).toContain("# MCP 连接器资源");
      expect(prompt).toContain("[git:README]");
      expect(prompt).toContain("Project documentation");
    });

    it("英文环境注入 # MCP Connector Resources section", () => {
      const agentDirEN = path.join(agentsDir, "test-agent-en");
      fs.mkdirSync(agentDirEN, { recursive: true });
      fs.writeFileSync(
        path.join(agentDirEN, "config.yaml"),
        [
          "agent:",
          "  name: MCP Test EN",
          "  yuan: hanako",
          "user:",
          "  name: Tester",
          "locale: en-US",
        ].join("\n"),
        "utf-8",
      );

      const agentEN = new Agent({
        id: "test-agent-en",
        agentsDir,
        productDir,
        userDir,
      });
      agentEN.loadConfigOnly();
      agentEN.updateMcpResourcesText("[git:README] — docs\nContent");

      const prompt = agentEN.buildSystemPrompt();
      expect(prompt).toContain("# MCP Connector Resources");
      expect(prompt).toContain("Content");
    });

    it("通过 _cb.getMcpResourcesText 回调获取资源文本（降级路径）", () => {
      agent.initialize({
        callbacks: {
          getMcpResourcesText: () => "[hub:route] MCP routing info",
        },
      });
      const prompt = agent.buildSystemPrompt();
      expect(prompt).toContain("# MCP 连接器资源");
      expect(prompt).toContain("[hub:route] MCP routing info");
    });

    it("_cb.getMcpResourcesText 返回空时降级到 _mcpResourcesText", () => {
      agent.updateMcpResourcesText("[local] Local cache");
      agent.initialize({
        callbacks: {
          getMcpResourcesText: () => "",
        },
      });
      const prompt = agent.buildSystemPrompt();
      // _cb returns empty, falls back to _mcpResourcesText
      expect(prompt).toContain("[local] Local cache");
    });

    it("_mcpResourcesText 优先于 _cb.getMcpResourcesText", () => {
      agent.updateMcpResourcesText("[local] Local cache");
      agent.initialize({
        callbacks: {
          getMcpResourcesText: () => "[hub] Hub callback",
        },
      });
      const prompt = agent.buildSystemPrompt();
      // _mcpResourcesText should appear first (|| short-circuit)
      expect(prompt).toContain("[local] Local cache");
    });
  });
});
