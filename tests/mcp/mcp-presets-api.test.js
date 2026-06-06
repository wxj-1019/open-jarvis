import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import registerMcpRoutes from "../../plugins/mcp/routes/api.js";

function createMockCtx() {
  return {
    _mcpRuntime: null,
    bus: {
      request: async () => ({ config: {} }),
    },
    log: {
      error: () => {},
    },
  };
}

function createApp(ctx) {
  const app = new Hono();
  registerMcpRoutes(app, ctx);
  return app;
}

describe("GET /presets", () => {
  it("returns 200 with presets array", async () => {
    const ctx = createMockCtx();
    const app = createApp(ctx);
    const res = await app.request("/presets");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("presets");
    expect(Array.isArray(body.presets)).toBe(true);
    expect(body.presets.length).toBeGreaterThan(0);
  });

  it("returns presets with correct fields", async () => {
    const ctx = createMockCtx();
    const app = createApp(ctx);
    const res = await app.request("/presets");
    const body = await res.json();
    const preset = body.presets[0];
    expect(preset).toHaveProperty("id");
    expect(preset).toHaveProperty("name");
    expect(preset).toHaveProperty("description");
    expect(preset).toHaveProperty("category");
    expect(preset).toHaveProperty("icon");
    expect(preset).toHaveProperty("transport");
    expect(preset).toHaveProperty("command");
    expect(preset).toHaveProperty("args");
    expect(preset).toHaveProperty("envSchema");
    expect(preset).toHaveProperty("authType");
  });

  it("excludes oauthScopes from response", async () => {
    const ctx = createMockCtx();
    const app = createApp(ctx);
    const res = await app.request("/presets");
    const body = await res.json();
    for (const preset of body.presets) {
      expect(preset).not.toHaveProperty("oauthScopes");
    }
  });

  it("includes Google Calendar preset", async () => {
    const ctx = createMockCtx();
    const app = createApp(ctx);
    const res = await app.request("/presets");
    const body = await res.json();
    const googleCalendar = body.presets.find((p) => p.id === "google-calendar");
    expect(googleCalendar).toBeDefined();
    expect(googleCalendar.name).toBe("Google Calendar");
    expect(googleCalendar.category).toBe("calendar");
    expect(googleCalendar.authType).toBe("oauth");
  });

  it("includes Gmail preset", async () => {
    const ctx = createMockCtx();
    const app = createApp(ctx);
    const res = await app.request("/presets");
    const body = await res.json();
    const gmail = body.presets.find((p) => p.id === "gmail");
    expect(gmail).toBeDefined();
    expect(gmail.name).toBe("Gmail");
    expect(gmail.category).toBe("email");
    expect(gmail.authType).toBe("oauth");
  });

  it("includes Outlook presets", async () => {
    const ctx = createMockCtx();
    const app = createApp(ctx);
    const res = await app.request("/presets");
    const body = await res.json();
    const outlookMail = body.presets.find((p) => p.id === "outlook-mail");
    const outlookCalendar = body.presets.find((p) => p.id === "outlook-calendar");
    expect(outlookMail).toBeDefined();
    expect(outlookMail.category).toBe("email");
    expect(outlookCalendar).toBeDefined();
    expect(outlookCalendar.category).toBe("calendar");
  });

  it("returns all 4 presets", async () => {
    const ctx = createMockCtx();
    const app = createApp(ctx);
    const res = await app.request("/presets");
    const body = await res.json();
    expect(body.presets.length).toBe(4);
  });
});
