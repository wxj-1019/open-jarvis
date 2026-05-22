import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmbeddingModelManager } from "../lib/memory/embedding-model.js";

vi.mock("@xenova/transformers", () => ({
  pipeline: vi.fn(),
}));

describe("EmbeddingModelManager", () => {
  let manager;
  let mockPipeline;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPipeline = vi.fn().mockResolvedValue({
      data: new Float32Array(384).fill(0).map((_, i) => i * 0.01),
    });
  });

  afterEach(() => {
    manager?.close();
  });

  describe("constructor", () => {
    it("initializes with default options", () => {
      manager = new EmbeddingModelManager();
      expect(manager).toBeDefined();
      expect(manager.isAvailable).toBe(false);
    });

    it("accepts custom options", () => {
      manager = new EmbeddingModelManager({
        modelId: "custom-model",
        dimension: 512,
      });
      expect(manager).toBeDefined();
    });
  });

  describe("initialize", () => {
    it("loads local model successfully", async () => {
      const { pipeline } = await import("@xenova/transformers");
      pipeline.mockImplementation(mockPipeline);

      manager = new EmbeddingModelManager();
      await manager.initialize();

      expect(manager.isAvailable).toBe(true);
      expect(pipeline).toHaveBeenCalled();
    });

    it("handles local model loading failure gracefully", async () => {
      const { pipeline } = await import("@xenova/transformers");
      pipeline.mockRejectedValue(new Error("Model not found"));

      manager = new EmbeddingModelManager();
      await manager.initialize();

      expect(manager.isAvailable).toBe(false);
    });

    it("uses remote API when local model fails", async () => {
      const { pipeline } = await import("@xenova/transformers");
      pipeline.mockRejectedValue(new Error("Model not found"));

      manager = new EmbeddingModelManager({
        remoteApiUrl: "https://api.example.com/embed",
        remoteApiKey: "test-key",
      });
      await manager.initialize();

      expect(manager.isAvailable).toBe(true);
    });

    it("respects forceRemote option", async () => {
      manager = new EmbeddingModelManager({
        forceRemote: true,
        remoteApiUrl: "https://api.example.com/embed",
        remoteApiKey: "test-key",
      });
      await manager.initialize();

      expect(manager.isAvailable).toBe(true);
    });
  });

  describe("getEmbedding", () => {
    it("returns embedding for single text", async () => {
      const { pipeline } = await import("@xenova/transformers");
      pipeline.mockImplementation(mockPipeline);

      manager = new EmbeddingModelManager();
      await manager.initialize();

      const embedding = await manager.getEmbedding("test text");

      expect(embedding).toBeDefined();
      expect(embedding.length).toBe(384);
      expect(embedding).toBeInstanceOf(Float32Array);
    });

    it("returns null when model not available", async () => {
      manager = new EmbeddingModelManager();
      const embedding = await manager.getEmbedding("test text");

      expect(embedding).toBeNull();
    });

    it("handles empty text", async () => {
      const { pipeline } = await import("@xenova/transformers");
      pipeline.mockImplementation(mockPipeline);

      manager = new EmbeddingModelManager();
      await manager.initialize();

      const embedding = await manager.getEmbedding("");

      expect(embedding).toBeDefined();
      expect(embedding.length).toBe(384);
    });
  });

  describe("getEmbeddings (batch)", () => {
    it("returns embeddings for multiple texts", async () => {
      const { pipeline } = await import("@xenova/transformers");
      pipeline.mockImplementation(mockPipeline);

      manager = new EmbeddingModelManager();
      await manager.initialize();

      const embeddings = await manager.getEmbeddings([
        "text one",
        "text two",
        "text three",
      ]);

      expect(embeddings).toHaveLength(3);
      expect(embeddings[0]).toBeInstanceOf(Float32Array);
      expect(embeddings[0].length).toBe(384);
    });

    it("returns empty array for empty input", async () => {
      const { pipeline } = await import("@xenova/transformers");
      pipeline.mockImplementation(mockPipeline);

      manager = new EmbeddingModelManager();
      await manager.initialize();

      const embeddings = await manager.getEmbeddings([]);

      expect(embeddings).toEqual([]);
    });

    it("returns array of nulls when model not available", async () => {
      manager = new EmbeddingModelManager();
      const embeddings = await manager.getEmbeddings([
        "text one",
        "text two",
      ]);

      expect(embeddings).toEqual([null, null]);
    });
  });

  describe("close", () => {
    it("closes the pipeline", async () => {
      const { pipeline } = await import("@xenova/transformers");
      const mockDispose = vi.fn();
      pipeline.mockImplementation(() => Promise.resolve({
        data: new Float32Array(384),
        dispose: mockDispose,
      }));

      manager = new EmbeddingModelManager();
      await manager.initialize();
      manager.close();

      expect(mockDispose).toHaveBeenCalled();
    });

    it("handles close without initialization", () => {
      manager = new EmbeddingModelManager();
      expect(() => manager.close()).not.toThrow();
    });
  });

  describe("dimension", () => {
    it("returns correct dimension", () => {
      manager = new EmbeddingModelManager();
      expect(manager.dimension).toBe(384);
    });

    it("accepts custom dimension", () => {
      manager = new EmbeddingModelManager({ dimension: 512 });
      expect(manager.dimension).toBe(512);
    });
  });
});
