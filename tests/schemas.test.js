import { describe, expect, it } from "vitest";
import { Value } from "typebox/value";
import {
  LogBody,
  PlanModeBody,
  SessionNewBody,
  SessionRenameBody,
  SessionPinBody,
  SessionSwitchBody,
  AgentCreateBody,
  AgentSwitchBody,
  AgentOrderBody,
  AgentPrimaryBody,
  ConfirmBody,
  ContentBody,
  PinsBody,
  AvatarUploadBody,
  SkillBundleBody,
  SkillBundleOrderBody,
  SkillEnabledBody,
  SkillToggleBody,
  SkillPathsBody,
  SkillTranslateBody,
} from "../server/utils/schemas.js";

describe("schemas", () => {
  describe("LogBody", () => {
    it("accepts valid log payload", () => {
      expect(Value.Check(LogBody, { message: "test" })).toBe(true);
      expect(Value.Check(LogBody, { message: "test", level: "error", module: "core" })).toBe(true);
    });
    it("rejects missing message", () => {
      expect(Value.Check(LogBody, {})).toBe(false);
    });
  });

  describe("PlanModeBody", () => {
    it("accepts enabled or mode", () => {
      expect(Value.Check(PlanModeBody, { enabled: true })).toBe(true);
      expect(Value.Check(PlanModeBody, { mode: "plan" })).toBe(true);
      expect(Value.Check(PlanModeBody, {})).toBe(true);
    });
    it("rejects wrong types", () => {
      expect(Value.Check(PlanModeBody, { enabled: "yes" })).toBe(false);
    });
  });

  describe("SessionNewBody", () => {
    it("accepts all optional fields", () => {
      expect(Value.Check(SessionNewBody, {})).toBe(true);
      expect(Value.Check(SessionNewBody, {
        cwd: "/tmp",
        memoryEnabled: true,
        agentId: "agent-1",
        workspaceFolders: ["/a", "/b"],
      })).toBe(true);
    });
    it("rejects invalid workspaceFolders type", () => {
      expect(Value.Check(SessionNewBody, { workspaceFolders: "not-array" })).toBe(false);
    });
  });

  describe("SessionRenameBody", () => {
    it("requires path and title", () => {
      expect(Value.Check(SessionRenameBody, { path: "/s", title: "New" })).toBe(true);
      expect(Value.Check(SessionRenameBody, { path: "/s" })).toBe(false);
      expect(Value.Check(SessionRenameBody, { title: "New" })).toBe(false);
    });
  });

  describe("SessionPinBody", () => {
    it("requires path and pinned", () => {
      expect(Value.Check(SessionPinBody, { path: "/s", pinned: true })).toBe(true);
      expect(Value.Check(SessionPinBody, { path: "/s", pinned: false })).toBe(true);
      expect(Value.Check(SessionPinBody, { path: "/s" })).toBe(false);
    });
  });

  describe("SessionSwitchBody", () => {
    it("requires path", () => {
      expect(Value.Check(SessionSwitchBody, { path: "/s" })).toBe(true);
      expect(Value.Check(SessionSwitchBody, {})).toBe(false);
    });
  });

  describe("AgentCreateBody", () => {
    it("requires name", () => {
      expect(Value.Check(AgentCreateBody, { name: "Test" })).toBe(true);
      expect(Value.Check(AgentCreateBody, { name: "Test", id: "t1", yuan: "default" })).toBe(true);
      expect(Value.Check(AgentCreateBody, {})).toBe(false);
    });
  });

  describe("AgentSwitchBody", () => {
    it("requires id", () => {
      expect(Value.Check(AgentSwitchBody, { id: "a1" })).toBe(true);
      expect(Value.Check(AgentSwitchBody, {})).toBe(false);
    });
  });

  describe("AgentOrderBody", () => {
    it("requires order array of strings", () => {
      expect(Value.Check(AgentOrderBody, { order: ["a", "b"] })).toBe(true);
      expect(Value.Check(AgentOrderBody, { order: [] })).toBe(true);
      expect(Value.Check(AgentOrderBody, { order: [1, 2] })).toBe(false);
      expect(Value.Check(AgentOrderBody, {})).toBe(false);
    });
  });

  describe("AgentPrimaryBody", () => {
    it("requires id", () => {
      expect(Value.Check(AgentPrimaryBody, { id: "a1" })).toBe(true);
      expect(Value.Check(AgentPrimaryBody, {})).toBe(false);
    });
  });

  describe("ConfirmBody", () => {
    it("accepts confirmed or rejected", () => {
      expect(Value.Check(ConfirmBody, { action: "confirmed" })).toBe(true);
      expect(Value.Check(ConfirmBody, { action: "rejected", value: "yes" })).toBe(true);
    });
    it("rejects invalid action", () => {
      expect(Value.Check(ConfirmBody, { action: "maybe" })).toBe(false);
      expect(Value.Check(ConfirmBody, {})).toBe(false);
    });
  });

  describe("ContentBody", () => {
    it("requires content string", () => {
      expect(Value.Check(ContentBody, { content: "hello" })).toBe(true);
      expect(Value.Check(ContentBody, {})).toBe(false);
      expect(Value.Check(ContentBody, { content: 123 })).toBe(false);
    });
  });

  describe("PinsBody", () => {
    it("requires pins array of strings", () => {
      expect(Value.Check(PinsBody, { pins: ["a", "b"] })).toBe(true);
      expect(Value.Check(PinsBody, { pins: [] })).toBe(true);
      expect(Value.Check(PinsBody, { pins: [1] })).toBe(false);
    });
  });

  describe("AvatarUploadBody", () => {
    it("requires data string", () => {
      expect(Value.Check(AvatarUploadBody, { data: "base64..." })).toBe(true);
      expect(Value.Check(AvatarUploadBody, {})).toBe(false);
    });
  });

  describe("SkillBundleBody", () => {
    it("requires name and skillNames", () => {
      expect(Value.Check(SkillBundleBody, { name: "MyBundle", skillNames: ["s1", "s2"] })).toBe(true);
      expect(Value.Check(SkillBundleBody, { name: "B" })).toBe(false);
      expect(Value.Check(SkillBundleBody, { skillNames: [] })).toBe(false);
    });
  });

  describe("SkillBundleOrderBody", () => {
    it("requires bundleIds array of strings", () => {
      expect(Value.Check(SkillBundleOrderBody, { bundleIds: ["b1", "b2"] })).toBe(true);
      expect(Value.Check(SkillBundleOrderBody, {})).toBe(false);
    });
  });

  describe("SkillEnabledBody", () => {
    it("requires enabled array of strings", () => {
      expect(Value.Check(SkillEnabledBody, { enabled: ["s1", "s2"] })).toBe(true);
      expect(Value.Check(SkillEnabledBody, { enabled: [] })).toBe(true);
      expect(Value.Check(SkillEnabledBody, {})).toBe(false);
      expect(Value.Check(SkillEnabledBody, { enabled: "s1" })).toBe(false);
    });
  });

  describe("SkillToggleBody", () => {
    it("requires enabled boolean", () => {
      expect(Value.Check(SkillToggleBody, { enabled: true })).toBe(true);
      expect(Value.Check(SkillToggleBody, { enabled: false })).toBe(true);
      expect(Value.Check(SkillToggleBody, {})).toBe(false);
      expect(Value.Check(SkillToggleBody, { enabled: "yes" })).toBe(false);
    });
  });

  describe("SkillPathsBody", () => {
    it("requires paths array of strings", () => {
      expect(Value.Check(SkillPathsBody, { paths: ["/a", "/b"] })).toBe(true);
      expect(Value.Check(SkillPathsBody, { paths: [] })).toBe(true);
      expect(Value.Check(SkillPathsBody, {})).toBe(false);
    });
  });

  describe("SkillTranslateBody", () => {
    it("requires names, lang, agentId", () => {
      expect(Value.Check(SkillTranslateBody, { names: ["s1"], lang: "zh", agentId: "a1" })).toBe(true);
      expect(Value.Check(SkillTranslateBody, { names: ["s1"], lang: "zh" })).toBe(false);
      expect(Value.Check(SkillTranslateBody, { names: ["s1"], agentId: "a1" })).toBe(false);
    });
  });
});
