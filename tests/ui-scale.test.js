import { describe, expect, it } from "vitest";
import {
  computeViewportUiScaleFactor,
  normalizeUiScale,
  resolveEffectiveUiScale,
  stepUiScale,
  UI_SCALE_BASE_VIEWPORT,
} from "../shared/ui-scale.js";

describe("ui-scale", () => {
  it("clamps user scale to supported range", () => {
    expect(normalizeUiScale(2)).toBe(1.5);
    expect(normalizeUiScale(0.2)).toBe(0.75);
    expect(normalizeUiScale("bad", 1)).toBe(1);
  });

  it("shrinks on viewports smaller than the design baseline", () => {
    const factor = computeViewportUiScaleFactor({
      width: UI_SCALE_BASE_VIEWPORT.width / 2,
      height: UI_SCALE_BASE_VIEWPORT.height,
    });
    expect(factor).toBeLessThan(1);
    expect(factor).toBeGreaterThanOrEqual(0.8);
  });

  it("does not upscale beyond 1 on large viewports", () => {
    expect(computeViewportUiScaleFactor({
      width: UI_SCALE_BASE_VIEWPORT.width * 2,
      height: UI_SCALE_BASE_VIEWPORT.height * 2,
    })).toBe(1);
  });

  it("combines user scale with viewport adaptation", () => {
    const effective = resolveEffectiveUiScale(1.2, {
      width: UI_SCALE_BASE_VIEWPORT.width / 2,
      height: UI_SCALE_BASE_VIEWPORT.height,
    });
    expect(effective).toBeLessThan(1.2);
    expect(effective).toBeGreaterThan(0.75);
  });

  it("steps in fixed increments", () => {
    expect(stepUiScale(1, 1)).toBe(1.05);
    expect(stepUiScale(1, -1)).toBe(0.95);
  });
});
