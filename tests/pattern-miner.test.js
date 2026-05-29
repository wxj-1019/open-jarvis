import { describe, it, expect } from "vitest";
import { PatternMiner } from "../lib/context/pattern-miner.js";

describe("PatternMiner", () => {
  const miner = new PatternMiner();

  it("should build transition matrix from events", () => {
    const events = [
      { app: "Code.exe", timestamp: Date.now() - 7200000 },
      { app: "chrome.exe", timestamp: Date.now() - 3600000 },
      { app: "Code.exe", timestamp: Date.now() - 1800000 },
      { app: "chrome.exe", timestamp: Date.now() - 900000 },
    ];

    const model = miner.buildMarkovModel(events);

    expect(model.states.length).toBeGreaterThan(0);
    expect(Object.keys(model.transitions).length).toBeGreaterThan(0);
  });

  it("should predict next state", () => {
    const base = new Date("2026-05-25T10:00:00").getTime();
    const events = [
      { app: "Code.exe", timestamp: base },
      { app: "chrome.exe", timestamp: base + 60000 },
      { app: "Code.exe", timestamp: base + 120000 },
      { app: "chrome.exe", timestamp: base + 180000 },
    ];

    const model = miner.buildMarkovModel(events);
    // All events are at 10:00-10:03 Monday → coding|morning|1 / browsing|morning|1
    const currentState = miner.encodeState(events[2]); // coding|morning|1
    const prediction = miner.predictNext(model, currentState);

    expect(prediction).not.toBeNull();
    expect(prediction.probability).toBeGreaterThan(0);
    // coding|morning|1 always transitions to browsing|morning|1
    expect(prediction.state).toContain("browsing");
  });

  it("should find frequent patterns", () => {
    const events = [
      { app: "Code.exe", timestamp: 0 },
      { app: "chrome.exe", timestamp: 1 },
      { app: "Code.exe", timestamp: 2 },
      { app: "chrome.exe", timestamp: 3 },
      { app: "Code.exe", timestamp: 4 },
      { app: "chrome.exe", timestamp: 5 },
    ];

    const patterns = miner.findFrequentPatterns(events, 2);

    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0].sequence.length).toBe(2);
    expect(patterns[0].support).toBeGreaterThanOrEqual(2);
  });

  it("should return empty for too few events", () => {
    const model = miner.buildMarkovModel([]);
    expect(model.states).toEqual([]);
    expect(model.transitions).toEqual({});

    const model2 = miner.buildMarkovModel([{ app: "A", timestamp: 1 }]);
    expect(model2.states).toEqual([]);
  });

  it("should find periodic patterns", () => {
    const events = [];
    // 3 days of 9am Code.exe
    for (let day = 0; day < 5; day++) {
      const d = new Date("2026-05-25T09:00:00");
      d.setDate(d.getDate() + day);
      events.push({ app: "Code.exe", timestamp: d.getTime() });
    }

    const patterns = miner.findPeriodicPatterns(events);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0].hour).toBe(9);
    expect(patterns[0].category).toBe("coding");
  });

  it("should return null prediction for unknown state", () => {
    const model = miner.buildMarkovModel([
      { app: "Code.exe", timestamp: 1 },
      { app: "chrome.exe", timestamp: 2 },
    ]);
    const prediction = miner.predictNext(model, "nonexistent|state|0");
    expect(prediction).toBeNull();
  });
});
