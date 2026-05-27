import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { PreferencesManager } from "../core/preferences-manager.js";

describe("preferences ui_scale", () => {
  /** @type {string} */
  let tmpDir;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("round-trips ui_scale through preferences.json", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-ui-scale-"));
    const prefs = new PreferencesManager({ userDir: tmpDir, agentsDir: path.join(tmpDir, "agents") });

    expect(prefs.getUiScale()).toBe(1);

    prefs.setUiScale(1.25);
    expect(prefs.getUiScale()).toBe(1.25);

    const reloaded = new PreferencesManager({ userDir: tmpDir, agentsDir: path.join(tmpDir, "agents") });
    expect(reloaded.getUiScale()).toBe(1.25);
  });
});
