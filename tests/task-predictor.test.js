import { describe, it, expect } from "vitest";
import { TaskPredictor } from "../lib/context/task-predictor.js";

describe("TaskPredictor", () => {
  // All events on the same day to ensure consistent state encoding
  const base = new Date("2026-05-25T09:00:00").getTime();
  const events = [
    { app: "Code.exe", timestamp: base },
    { app: "chrome.exe", timestamp: base + 60000 },
    { app: "Code.exe", timestamp: base + 120000 },
    { app: "chrome.exe", timestamp: base + 180000 },
  ];

  it("should train and predict", () => {
    const predictor = new TaskPredictor();
    predictor.train(events);

    const prediction = predictor.predict({
      app: "Code.exe",
      timestamp: base + 240000,
    });

    expect(prediction).not.toBeNull();
    expect(prediction.probability).toBeGreaterThan(0);
    expect(prediction.interpretation).toBeDefined();
  });

  it("should predict multi-step sequence", () => {
    const predictor = new TaskPredictor();
    predictor.train(events);

    const sequence = predictor.predictSequence({
      app: "Code.exe",
      timestamp: base + 240000,
    }, 2);

    expect(sequence.length).toBeGreaterThan(0);
  });

  it("should return null before training", () => {
    const predictor = new TaskPredictor();
    expect(predictor.predict({ app: "Code.exe", timestamp: Date.now() })).toBeNull();
  });

  it("should return model stats", () => {
    const predictor = new TaskPredictor();
    expect(predictor.getModelStats()).toBeNull();

    predictor.train(events);
    const stats = predictor.getModelStats();
    expect(stats.stateCount).toBeGreaterThan(0);
    expect(stats.transitionCount).toBeGreaterThan(0);
  });
});
