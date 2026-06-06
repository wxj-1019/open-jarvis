import { describe, expect, it } from "vitest";
import { PriorityMessageQueue, getDelayByPriority, isValidPriority } from "../../lib/bridge/priority-queue.js";

describe("PriorityMessageQueue", () => {
  it("starts empty", () => {
    const queue = new PriorityMessageQueue();
    expect(queue.size).toBe(0);
    expect(queue.isEmpty).toBe(true);
  });

  it("pushes items and reports correct size", () => {
    const queue = new PriorityMessageQueue();
    queue.push({ text: "msg1" });
    queue.push({ text: "msg2" });
    expect(queue.size).toBe(2);
    expect(queue.isEmpty).toBe(false);
  });

  it("clear returns all items in FIFO order", () => {
    const queue = new PriorityMessageQueue();
    queue.push({ text: "first" });
    queue.push({ text: "second" });
    queue.push({ text: "third" });

    const items = queue.clear();
    expect(items).toHaveLength(3);
    expect(items[0].text).toBe("first");
    expect(items[1].text).toBe("second");
    expect(items[2].text).toBe("third");
    expect(queue.size).toBe(0);
    expect(queue.isEmpty).toBe(true);
  });

  it("enforces maxSize by dropping oldest items", () => {
    const queue = new PriorityMessageQueue({ maxSize: 3 });
    queue.push({ text: "1" });
    queue.push({ text: "2" });
    queue.push({ text: "3" });
    queue.push({ text: "4" });

    expect(queue.size).toBe(3);
    const items = queue.clear();
    expect(items).toHaveLength(3);
    expect(items[0].text).toBe("2");
    expect(items[1].text).toBe("3");
    expect(items[2].text).toBe("4");
  });

  it("clear returns empty array when queue is empty", () => {
    const queue = new PriorityMessageQueue();
    const items = queue.clear();
    expect(items).toEqual([]);
  });

  it("handles maxSize=1 correctly", () => {
    const queue = new PriorityMessageQueue({ maxSize: 1 });
    queue.push({ text: "only" });
    queue.push({ text: "replaced" });
    expect(queue.size).toBe(1);
    const items = queue.clear();
    expect(items[0].text).toBe("replaced");
  });

  it("silently ignores null/undefined items", () => {
    const queue = new PriorityMessageQueue();
    queue.push(null);
    queue.push(undefined);
    queue.push({ text: "valid" });
    expect(queue.size).toBe(1);
    const items = queue.clear();
    expect(items[0].text).toBe("valid");
  });

  it("silently ignores primitive items", () => {
    const queue = new PriorityMessageQueue();
    queue.push("string");
    queue.push(42);
    queue.push({ text: "valid" });
    expect(queue.size).toBe(1);
  });
});

describe("getDelayByPriority", () => {
  it("returns 0 for urgent", () => {
    expect(getDelayByPriority("urgent")).toBe(0);
  });

  it("returns 0 for info", () => {
    expect(getDelayByPriority("info")).toBe(0);
  });

  it("returns 1000-3000 for normal", () => {
    for (let i = 0; i < 20; i++) {
      const delay = getDelayByPriority("normal");
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThanOrEqual(3000);
    }
  });

  it("returns random values for normal (not always the same)", () => {
    const delays = new Set();
    for (let i = 0; i < 50; i++) {
      delays.add(getDelayByPriority("normal"));
    }
    expect(delays.size).toBeGreaterThan(5);
  });
});

describe("isValidPriority", () => {
  it("accepts valid priorities", () => {
    expect(isValidPriority("urgent")).toBe(true);
    expect(isValidPriority("normal")).toBe(true);
    expect(isValidPriority("info")).toBe(true);
  });

  it("rejects invalid priorities", () => {
    expect(isValidPriority("high")).toBe(false);
    expect(isValidPriority("low")).toBe(false);
    expect(isValidPriority("")).toBe(false);
    expect(isValidPriority(undefined)).toBe(false);
    expect(isValidPriority(null)).toBe(false);
  });
});
