/**
 * embedding-model.js — Embedding model manager
 *
 * Manages loading and inference of embedding models for semantic search.
 * Supports local model via @xenova/transformers with remote API fallback.
 */

import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("embedding-model");

const DEFAULT_MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const DEFAULT_DIMENSION = 384;

export class EmbeddingModelManager {
  /**
   * @param {object} [opts]
   * @param {string} [opts.modelId] - Model identifier for local loading
   * @param {number} [opts.dimension] - Embedding dimension (default: 384)
   * @param {boolean} [opts.forceRemote] - Force remote API even if local works
   * @param {string} [opts.remoteApiUrl] - Remote embedding API URL
   * @param {string} [opts.remoteApiKey] - Remote API key
   */
  constructor(opts = {}) {
    this._modelId = opts.modelId || DEFAULT_MODEL_ID;
    this._dimension = opts.dimension || DEFAULT_DIMENSION;
    this._forceRemote = opts.forceRemote || false;
    this._remoteApiUrl = opts.remoteApiUrl;
    this._remoteApiKey = opts.remoteApiKey;
    this._pipeline = null;
    this._initialized = false;
    this._useRemote = false;
  }

  /**
   * Whether the embedding model is available
   * @returns {boolean}
   */
  get isAvailable() {
    return this._initialized;
  }

  /**
   * Embedding dimension
   * @returns {number}
   */
  get dimension() {
    return this._dimension;
  }

  /**
   * Initialize the embedding model
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this._initialized) return;

    if (!this._forceRemote) {
      try {
        await this._loadLocalModel();
        this._initialized = true;
        log?.info?.("Local embedding model loaded");
        return;
      } catch (err) {
        log?.warn?.(`Local model failed to load: ${err.message}`);
      }
    }

    if (this._remoteApiUrl) {
      this._useRemote = true;
      this._initialized = true;
      log?.info?.("Using remote embedding API");
      return;
    }

    log?.warn?.("No embedding model available");
  }

  /**
   * Get embedding for a single text
   * @param {string} text
   * @returns {Promise<Float32Array|null>}
   */
  async getEmbedding(text) {
    if (!this._initialized) return null;

    try {
      if (this._useRemote) {
        return await this._getRemoteEmbedding(text);
      }
      return await this._getLocalEmbedding(text);
    } catch (err) {
      log?.warn?.(`Embedding failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Get embeddings for multiple texts (batch)
   * @param {string[]} texts
   * @returns {Promise<Array<Float32Array|null>>}
   */
  async getEmbeddings(texts) {
    if (!this._initialized) {
      return texts.map(() => null);
    }

    if (texts.length === 0) return [];

    try {
      if (this._useRemote) {
        return await this._getRemoteEmbeddings(texts);
      }
      return await this._getLocalEmbeddings(texts);
    } catch (err) {
      log?.warn?.(`Batch embedding failed: ${err.message}`);
      return texts.map(() => null);
    }
  }

  /**
   * Close the pipeline
   */
  close() {
    if (this._pipeline?.dispose) {
      this._pipeline.dispose();
      this._pipeline = null;
    }
    this._initialized = false;
  }

  /** Load local model via @xenova/transformers */
  async _loadLocalModel() {
    const { pipeline } = await import("@xenova/transformers");
    this._pipeline = await pipeline("feature-extraction", this._modelId);
  }

  /** Get embedding from local model */
  async _getLocalEmbedding(text) {
    const output = await this._pipeline(text, {
      pooling: "mean",
      normalize: true,
    });

    const data = output.data;
    const embedding = new Float32Array(this._dimension);
    for (let i = 0; i < this._dimension; i++) {
      embedding[i] = data[i];
    }
    return embedding;
  }

  /** Get embeddings from local model (batch) */
  async _getLocalEmbeddings(texts) {
    const results = [];
    for (const text of texts) {
      results.push(await this._getLocalEmbedding(text));
    }
    return results;
  }

  /** Get embedding from remote API */
  async _getRemoteEmbedding(text) {
    const response = await fetch(this._remoteApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this._remoteApiKey}`,
      },
      body: JSON.stringify({ input: text }),
    });

    if (!response.ok) {
      throw new Error(`Remote API error: ${response.status}`);
    }

    const data = await response.json();
    const embedding = new Float32Array(this._dimension);
    const values = data.embedding || data.data?.[0]?.embedding || [];
    for (let i = 0; i < this._dimension; i++) {
      embedding[i] = values[i] || 0;
    }
    return embedding;
  }

  /** Get embeddings from remote API (batch) */
  async _getRemoteEmbeddings(texts) {
    const response = await fetch(this._remoteApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this._remoteApiKey}`,
      },
      body: JSON.stringify({ input: texts }),
    });

    if (!response.ok) {
      throw new Error(`Remote API error: ${response.status}`);
    }

    const data = await response.json();
    const embeddings = [];

    const items = data.data || [];
    for (const item of items) {
      const embedding = new Float32Array(this._dimension);
      const values = item.embedding || [];
      for (let i = 0; i < this._dimension; i++) {
        embedding[i] = values[i] || 0;
      }
      embeddings.push(embedding);
    }

    return embeddings;
  }
}
