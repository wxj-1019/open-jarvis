import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Agent } from "../../core/agent.js";

let tmpDir, agentsDir, productDir, userDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-init-"));
  agentsDir = path.join(tmpDir, "agents");
  productDir = path.join(tmpDir, "product");
  userDir = path.join(tmpDir, "user");
  fs.mkdirSync(path.join(productDir, "yuan"), { recursive: true });
  fs.mkdirSync(userDir, { recursive: true });
  fs.writeFileSync(path.join(productDir, "yuan", "hanako.md"), "valid yuan\n", "utf-8");
  const agentDir = path.join(agentsDir, "test-agent");
  fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(path.join(agentDir, "config.yaml"), "yuan: hanako\n", "utf-8");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeAgent() {
  return new Agent({
    id: "test-agent",
    agentsDir,
    productDir,
    userDir,
  });
}

describe("Agent.initialize()", () => {
  it("accepts empty options object", () => {
    const agent = makeAgent();
    agent.initialize({});
    expect(agent._cb).toBeNull();
  });

  it("accepts no arguments", () => {
    const agent = makeAgent();
    agent.initialize();
    expect(agent._cb).toBeNull();
  });

  it("accepts null argument", () => {
    const agent = makeAgent();
    agent.initialize(null);
    expect(agent._cb).toBeNull();
  });

  it("sets all provided properties", () => {
    const agent = makeAgent();
    const cb = { onMessage: () => {} };
    const fn = () => {};
    agent.initialize({
      callbacks: cb,
      getOwnerIds: fn,
      onInstallCallback: fn,
      notifyHandler: fn,
      descriptionRefreshHandler: fn,
      dmSentHandler: fn,
      channelPostHandler: fn,
    });
    expect(agent._cb).toBe(cb);
    expect(agent._getOwnerIds).toBe(fn);
    expect(agent._onInstallCallback).toBe(fn);
    expect(agent._notifyHandler).toBe(fn);
    expect(agent._descriptionRefreshHandler).toBe(fn);
    expect(agent._dmSentHandler).toBe(fn);
    expect(agent._channelPostHandler).toBe(fn);
  });

  it("sets utilityModel to null when explicitly provided", () => {
    const agent = makeAgent();
    agent.initialize({ utilityModel: null });
    expect(agent._utilityModel).toBeNull();
  });

  it("does not set utilityModel when omitted", () => {
    const agent = makeAgent();
    agent._utilityModel = "existing";
    agent.initialize({});
    expect(agent._utilityModel).toBe("existing");
  });

  it("does not set memoryModel when undefined is provided", () => {
    const agent = makeAgent();
    agent._memoryModel = "existing";
    agent.initialize({ memoryModel: undefined });
    expect(agent._memoryModel).toBe("existing");
  });

  it("sets memoryModel to null when explicitly provided", () => {
    const agent = makeAgent();
    agent.initialize({ memoryModel: null });
    expect(agent._memoryModel).toBeNull();
  });

  it("sets only the provided properties, leaves others untouched", () => {
    const agent = makeAgent();
    const fn = () => {};
    agent._cb = "old-cb";
    agent.initialize({ getOwnerIds: fn });
    expect(agent._getOwnerIds).toBe(fn);
    expect(agent._cb).toBe("old-cb");
  });
});

describe("set* deprecation warnings", () => {
  it("setCallbacks emits deprecation warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const agent = makeAgent();
    const cb = { onMessage: () => {} };
    agent.setCallbacks(cb);
    expect(warn).toHaveBeenCalledWith(
      "Agent.setCallbacks() is deprecated. Use Agent.initialize({ callbacks }) instead."
    );
    expect(agent._cb).toBe(cb);
    warn.mockRestore();
  });

  it("setGetOwnerIds emits deprecation warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const agent = makeAgent();
    const fn = () => {};
    agent.setGetOwnerIds(fn);
    expect(warn).toHaveBeenCalledWith(
      "Agent.setGetOwnerIds() is deprecated. Use Agent.initialize({ getOwnerIds }) instead."
    );
    expect(agent._getOwnerIds).toBe(fn);
    warn.mockRestore();
  });

  it("setOnInstallCallback emits deprecation warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const agent = makeAgent();
    const fn = () => {};
    agent.setOnInstallCallback(fn);
    expect(warn).toHaveBeenCalledWith(
      "Agent.setOnInstallCallback() is deprecated. Use Agent.initialize({ onInstallCallback }) instead."
    );
    expect(agent._onInstallCallback).toBe(fn);
    warn.mockRestore();
  });

  it("setNotifyHandler emits deprecation warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const agent = makeAgent();
    const fn = () => {};
    agent.setNotifyHandler(fn);
    expect(warn).toHaveBeenCalledWith(
      "Agent.setNotifyHandler() is deprecated. Use Agent.initialize({ notifyHandler }) instead."
    );
    expect(agent._notifyHandler).toBe(fn);
    warn.mockRestore();
  });

  it("setDescriptionRefreshHandler emits deprecation warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const agent = makeAgent();
    const fn = () => {};
    agent.setDescriptionRefreshHandler(fn);
    expect(warn).toHaveBeenCalledWith(
      "Agent.setDescriptionRefreshHandler() is deprecated. Use Agent.initialize({ descriptionRefreshHandler }) instead."
    );
    expect(agent._descriptionRefreshHandler).toBe(fn);
    warn.mockRestore();
  });

  it("setDmSentHandler emits deprecation warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const agent = makeAgent();
    const fn = () => {};
    agent.setDmSentHandler(fn);
    expect(warn).toHaveBeenCalledWith(
      "Agent.setDmSentHandler() is deprecated. Use Agent.initialize({ dmSentHandler }) instead."
    );
    expect(agent._dmSentHandler).toBe(fn);
    warn.mockRestore();
  });

  it("setChannelPostHandler emits deprecation warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const agent = makeAgent();
    const fn = () => {};
    agent.setChannelPostHandler(fn);
    expect(warn).toHaveBeenCalledWith(
      "Agent.setChannelPostHandler() is deprecated. Use Agent.initialize({ channelPostHandler }) instead."
    );
    expect(agent._channelPostHandler).toBe(fn);
    warn.mockRestore();
  });

  it("setUtilityModel emits deprecation warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const agent = makeAgent();
    agent.setUtilityModel("model-x");
    expect(warn).toHaveBeenCalledWith(
      "Agent.setUtilityModel() is deprecated. Use Agent.initialize({ utilityModel }) instead."
    );
    expect(agent._utilityModel).toBe("model-x");
    warn.mockRestore();
  });

  it("setMemoryModel emits deprecation warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const agent = makeAgent();
    agent.setMemoryModel("model-y");
    expect(warn).toHaveBeenCalledWith(
      "Agent.setMemoryModel() is deprecated. Use Agent.initialize({ memoryModel }) instead."
    );
    expect(agent._memoryModel).toBe("model-y");
    warn.mockRestore();
  });
});
