import { searchRegistryServers, getRegistryServerDetail, getRegistryCategories } from "../lib/mcp-registry.js";

export default function registerMcpRoutes(app, ctx) {
  const runtime = () => ctx._mcpRuntime;

  async function agentConfig(agentId) {
    if (!agentId) return {};
    const result = await ctx.bus.request("agent:config", { agentId });
    if (result?.error) throw new Error(result.error);
    return result?.config || {};
  }

  async function currentState(c) {
    const rt = runtime();
    if (!rt) return c.json({ error: "not initialized" }, 503);
    const agentId = c.req.query("agentId") || c.get("agentId") || null;
    const config = await agentConfig(agentId);
    return c.json(rt.getState(config));
  }

  function redirectUriForRequest(c) {
    const url = new URL(c.req.url);
    return new URL("/api/plugins/mcp/oauth/callback", url.origin).href;
  }

  function htmlPage(title, body) {
    return `<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)}</title><body style="font-family:system-ui,-apple-system,sans-serif;padding:32px;line-height:1.5;color:#333;background:#faf8f2"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></body>`;
  }

  app.get("/state", currentState);

  async function setGlobalEnabled(c) {
    const rt = runtime();
    if (!rt) return c.json({ error: "not initialized" }, 503);
    const { enabled } = await c.req.json();
    try {
      await rt.setEnabled(enabled === true);
      return currentState(c);
    } catch (err) {
      ctx.log.error(`set global enabled failed: ${err.message}`);
      return c.json({ error: err.message }, 400);
    }
  }

  app.put("/settings/enabled", setGlobalEnabled);
  app.put("/enabled", setGlobalEnabled);

  async function addConnector(c) {
    const rt = runtime();
    if (!rt) return c.json({ error: "not initialized" }, 503);
    try {
      const connector = rt.addConnector(await c.req.json());
      const state = rt.getState();
      const publicConnector = state.connectors.find((item) => item.id === connector.id) || connector;
      return c.json({ connector: publicConnector, server: publicConnector, state });
    } catch (err) {
      return c.json({ error: err.message }, 400);
    }
  }

  async function updateConnector(c) {
    const rt = runtime();
    if (!rt) return c.json({ error: "not initialized" }, 503);
    try {
      const connector = await rt.updateConnector(c.req.param("id"), await c.req.json());
      const state = rt.getState();
      const publicConnector = state.connectors.find((item) => item.id === connector.id) || connector;
      return c.json({ connector: publicConnector, server: publicConnector, state });
    } catch (err) {
      return c.json({ error: err.message }, 400);
    }
  }

  async function removeConnector(c) {
    const rt = runtime();
    if (!rt) return c.json({ error: "not initialized" }, 503);
    try {
      await rt.removeConnector(c.req.param("id"));
      return c.json(rt.getState());
    } catch (err) {
      return c.json({ error: err.message }, 400);
    }
  }

  async function connectorAction(c, action) {
    const rt = runtime();
    if (!rt) return c.json({ error: "not initialized" }, 503);
    try {
      const id = c.req.param("id");
      if (action === "start") await rt.startConnector(id);
      else if (action === "stop") await rt.stopConnector(id);
      else if (action === "refresh-tools") {
        const tools = await rt.refreshTools(id);
        return c.json({ tools, state: rt.getState() });
      }
      return c.json(rt.getState());
    } catch (err) {
      return c.json({ error: err.message }, 400);
    }
  }

  async function updateAgentConnector(c) {
    const rt = runtime();
    if (!rt) return c.json({ error: "not initialized" }, 503);
    try {
      const config = await rt.updateAgentMcpConnector(
        c.req.param("agentId"),
        c.req.param("id"),
        await c.req.json(),
      );
      return c.json({ config });
    } catch (err) {
      return c.json({ error: err.message }, 400);
    }
  }

  app.post("/connectors", addConnector);
  app.post("/servers", addConnector);
  app.put("/connectors/:id", updateConnector);
  app.put("/servers/:id", updateConnector);
  app.delete("/connectors/:id", removeConnector);
  app.delete("/servers/:id", removeConnector);

  app.post("/connectors/:id/start", (c) => connectorAction(c, "start"));
  app.post("/servers/:id/start", (c) => connectorAction(c, "start"));
  app.post("/connectors/:id/stop", (c) => connectorAction(c, "stop"));
  app.post("/servers/:id/stop", (c) => connectorAction(c, "stop"));
  app.post("/connectors/:id/refresh-tools", (c) => connectorAction(c, "refresh-tools"));
  app.post("/servers/:id/refresh-tools", (c) => connectorAction(c, "refresh-tools"));

  app.put("/agents/:agentId/connectors/:id", updateAgentConnector);
  app.put("/agents/:agentId/servers/:id", updateAgentConnector);

  async function startOAuth(c) {
    const rt = runtime();
    if (!rt) return c.json({ error: "not initialized" }, 503);
    try {
      return c.json(await rt.startOAuth(c.req.param("id"), redirectUriForRequest(c)));
    } catch (err) {
      return c.json({ error: err.message }, 400);
    }
  }

  async function logoutOAuth(c) {
    const rt = runtime();
    if (!rt) return c.json({ error: "not initialized" }, 503);
    try {
      const connector = await rt.logoutOAuth(c.req.param("id"));
      const state = rt.getState();
      const publicConnector = state.connectors.find((item) => item.id === connector.id) || connector;
      return c.json({ connector: publicConnector, state });
    } catch (err) {
      return c.json({ error: err.message }, 400);
    }
  }

  app.post("/connectors/:id/oauth/start", startOAuth);
  app.post("/servers/:id/oauth/start", startOAuth);
  app.post("/connectors/:id/oauth/logout", logoutOAuth);
  app.post("/servers/:id/oauth/logout", logoutOAuth);

  app.get("/oauth/callback", async (c) => {
    const rt = runtime();
    if (!rt) return c.html(htmlPage("MCP Connector OAuth", "MCP runtime is not initialized."), 503);
    const url = new URL(c.req.url);
    try {
      await rt.completeOAuth({
        state: url.searchParams.get("state") || "",
        code: url.searchParams.get("code") || "",
        error: url.searchParams.get("error") || "",
      });
      return c.html(htmlPage("Connector connected", "You can close this window and return to Jarvis."));
    } catch (err) {
      return c.html(htmlPage("Connector OAuth failed", err.message), 400);
    }
  });

  app.get("/oauth/poll/:sessionId", (c) => {
    const rt = runtime();
    if (!rt) return c.json({ error: "not initialized" }, 503);
    return c.json(rt.getOAuthStatus(c.req.param("sessionId")));
  });

  // ─── New routes: ping, resources, prompts ───

  async function pingConnector(c) {
    const rt = runtime();
    if (!rt) return c.json({ error: "not initialized" }, 503);
    try {
      const client = rt.clients.get(c.req.param("id"));
      if (!client?.running) return c.json({ error: "connector is not running" }, 400);
      await client.ping();
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err.message }, 400);
    }
  }

  async function listResources(c) {
    const rt = runtime();
    if (!rt) return c.json({ error: "not initialized" }, 503);
    try {
      const resources = await rt.listConnectorResources(c.req.param("id"));
      return c.json({ resources });
    } catch (err) {
      return c.json({ error: err.message }, 400);
    }
  }

  async function readResource(c) {
    const rt = runtime();
    if (!rt) return c.json({ error: "not initialized" }, 503);
    try {
      const { uri } = await c.req.json();
      const result = await rt.readConnectorResource(c.req.param("id"), uri);
      return c.json(result);
    } catch (err) {
      return c.json({ error: err.message }, 400);
    }
  }

  async function listPrompts(c) {
    const rt = runtime();
    if (!rt) return c.json({ error: "not initialized" }, 503);
    try {
      const prompts = await rt.listConnectorPrompts(c.req.param("id"));
      return c.json({ prompts });
    } catch (err) {
      return c.json({ error: err.message }, 400);
    }
  }

  async function getPrompt(c) {
    const rt = runtime();
    if (!rt) return c.json({ error: "not initialized" }, 503);
    try {
      const { arguments: args } = await c.req.json();
      const result = await rt.getConnectorPrompt(c.req.param("id"), c.req.param("name"), args);
      return c.json(result);
    } catch (err) {
      return c.json({ error: err.message }, 400);
    }
  }

  async function listResourceTemplates(c) {
    const rt = runtime();
    if (!rt) return c.json({ error: "not initialized" }, 503);
    try {
      const templates = await rt.listConnectorResourceTemplates(c.req.param("id"));
      return c.json(templates);
    } catch (err) {
      return c.json({ error: err.message }, 400);
    }
  }

  async function contextResources(c) {
    const rt = runtime();
    if (!rt) return c.json({ error: "not initialized" }, 503);
    try {
      const resources = await rt.getAgentContextResources();
      return c.json({ resources });
    } catch (err) {
      return c.json({ error: err.message }, 400);
    }
  }

  app.post("/connectors/:id/ping", pingConnector);
  app.post("/servers/:id/ping", pingConnector);

  app.get("/connectors/:id/resources", listResources);
  app.get("/servers/:id/resources", listResources);
  app.post("/connectors/:id/resources/read", readResource);
  app.post("/servers/:id/resources/read", readResource);
  app.get("/connectors/:id/resources/templates", listResourceTemplates);
  app.get("/servers/:id/resources/templates", listResourceTemplates);

  app.get("/connectors/:id/prompts", listPrompts);
  app.get("/servers/:id/prompts", listPrompts);
  app.post("/connectors/:id/prompts/:name", getPrompt);
  app.post("/servers/:id/prompts/:name", getPrompt);

  app.get("/context-resources", contextResources);

  // ─── Registry routes ───

  app.get("/registry/search", async (c) => {
    try {
      const q = c.req.query("q") || "";
      const servers = await searchRegistryServers(q);
      return c.json({ servers });
    } catch (err) {
      return c.json({ error: err.message }, 400);
    }
  });

  app.get("/registry/categories", (c) => {
    return c.json({ categories: getRegistryCategories() });
  });

  app.get("/registry/servers/:id", async (c) => {
    try {
      const server = await getRegistryServerDetail(c.req.param("id"));
      if (!server) return c.json({ error: "Server not found" }, 404);
      return c.json({ server });
    } catch (err) {
      return c.json({ error: err.message }, 400);
    }
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
