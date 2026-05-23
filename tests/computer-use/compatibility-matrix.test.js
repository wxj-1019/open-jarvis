import { describe, it, assert, beforeEach } from "vitest";
import { CompatibilityMatrix } from "../../core/computer-use/compatibility-matrix.js";

describe("CompatibilityMatrix", () => {
  let matrix;

  beforeEach(() => {
    matrix = new CompatibilityMatrix();
  });

  it("should return true for unknown provider", () => {
    assert.equal(matrix.supportsAction("unknown:provider", "chrome", "click_element"), true);
  });

  it("should return true for unknown app", () => {
    assert.equal(matrix.supportsAction("windows:uia", "unknown-app", "click_element"), true);
  });

  it("should check action support for Chrome", () => {
    assert.equal(matrix.supportsAction("windows:uia", "chrome", "click_element"), true);
    assert.equal(matrix.supportsAction("windows:uia", "chrome", "click_point"), true);
    assert.equal(matrix.supportsAction("windows:uia", "chrome", "drag"), false);
    assert.equal(matrix.supportsAction("windows:uia", "chrome", "press_key"), false);
  });

  it("should check action support for Explorer", () => {
    assert.equal(matrix.supportsAction("windows:uia", "explorer", "click_element"), true);
    assert.equal(matrix.supportsAction("windows:uia", "explorer", "drag"), true);
    assert.equal(matrix.supportsAction("windows:uia", "explorer", "double_click"), true);
  });

  it("should get supported actions list", () => {
    const actions = matrix.getSupportedActions("windows:uia", "chrome");
    assert.deepEqual(actions, [
      "click_element",
      "type_text",
      "scroll",
      "click_point",
      "double_click",
    ]);
  });

  it("should get app info", () => {
    const info = matrix.getAppInfo("windows:uia", "chrome");
    assert.equal(info.processName, "chrome.exe");
    assert.ok(info.notes.includes("UIA 树稳定"));
  });

  it("should register new app dynamically", () => {
    matrix.registerApp("windows:uia", "firefox", {
      processName: "firefox.exe",
      supportedActions: ["click_element", "type_text"],
      unsupportedActions: ["drag"],
      notes: "Firefox UIA 支持测试中",
    });

    assert.equal(matrix.supportsAction("windows:uia", "firefox", "click_element"), true);
    assert.equal(matrix.supportsAction("windows:uia", "firefox", "drag"), false);
    
    const info = matrix.getAppInfo("windows:uia", "firefox");
    assert.equal(info.processName, "firefox.exe");
  });

  it("should export matrix", () => {
    const exported = matrix.export();
    assert.ok(exported["windows:uia"]);
    assert.ok(exported["windows:uia"]["chrome"]);
  });
});
