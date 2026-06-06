import { describe, it, expect } from "vitest";
import { TokenBudgetController } from "../../lib/context/token-budget-controller.js";

describe("TokenBudgetController", () => {
  it("should truncate when exceeding budget", () => {
    const controller = new TokenBudgetController({ maxTokens: 10 }); // 40 chars

    const elements = Array.from({ length: 20 }, (_, i) => ({
      type: "text",
      text: `element ${i}`,
      role: "text",
    }));

    const result = controller.applyBudget(elements, null);

    expect(result.truncated).toBe(true);
    expect(result.elements.length).toBeLessThan(20);
  });

  it("should prioritize focused element", () => {
    const controller = new TokenBudgetController({ maxTokens: 1000 });

    const elements = [{ type: "text", text: "other", role: "text" }];
    const focused = { type: "text", text: "focused", role: "code" };

    const result = controller.applyBudget(elements, focused);

    expect(result.elements[0].text).toBe("focused");
    expect(result.focusedElement.text).toBe("focused");
  });

  it("should not truncate when within budget", () => {
    const controller = new TokenBudgetController({ maxTokens: 1000 });

    const elements = [
      { type: "text", text: "hello", role: "text" },
      { type: "button", text: "click", role: "button" },
    ];

    const result = controller.applyBudget(elements, null);

    expect(result.truncated).toBe(false);
    expect(result.elements.length).toBe(2);
  });

  it("should handle empty elements", () => {
    const controller = new TokenBudgetController();

    const result = controller.applyBudget([], null);

    expect(result.elements).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it("should prioritize buttons over text elements", () => {
    const controller = new TokenBudgetController({ maxTokens: 5 }); // 20 chars, very tight

    const elements = [
      { type: "text", text: "long text that takes space", role: "text" },
      { type: "button", text: "OK", role: "button" },
    ];

    const result = controller.applyBudget(elements, null);

    // Button should be included due to higher priority
    const hasButton = result.elements.some((el) => el.role === "button");
    expect(hasButton).toBe(true);
  });
});
