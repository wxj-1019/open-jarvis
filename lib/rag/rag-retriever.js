/**
 * rag-retriever.js — RAG 混合检索器
 *
 * FTS5 关键词检索 + 向量语义检索 → RRF (Reciprocal Rank Fusion) 融合。
 * 纯函数模块，不持有状态。
 */

import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("rag-retriever");

// RRF 常数 k（文献标准值 60）
const RRF_K = 60;

/**
 * RRF 融合：将多个排序列表合并为单一排名
 * score = sum( 1 / (k + rank_i) ) for each ranker i
 * @param {Array<Array<{ id: number, score: number, rank: number }>>} rankedLists
 * @returns {Map<number, number>} id → rrfScore
 */
function rrfFusion(rankedLists) {
  const scores = new Map();

  for (const list of rankedLists) {
    for (const item of list) {
      const rrfScore = 1 / (RRF_K + item.rank);
      const current = scores.get(item.id) || 0;
      scores.set(item.id, current + rrfScore);
    }
  }

  return scores;
}

/**
 * FTS5 + 向量语义 → RRF 融合检索
 * @param {string} query - 搜索查询
 * @param {import('./doc-store.js').DocStore} docStore
 * @param {import('../memory/embedding-model.js').EmbeddingModelManager} embeddingModel
 * @param {object} [opts]
 * @param {number} [opts.limit=5] - 返回的最大结果数
 * @param {number} [opts.ftsLimit=30] - FTS 候选池大小
 * @param {number} [opts.vectorLimit=30] - 向量候选池大小
 * @returns {Promise<Array<{ id: number, chunkText: string, docName: string, docPath: string, chunkIndex: number, score: number }>>}
 */
export async function search(query, docStore, embeddingModel, opts = {}) {
  const limit = opts.limit || 5;
  const ftsLimit = opts.ftsLimit || 30;
  const vectorLimit = opts.vectorLimit || 30;

  const rankedLists = [];

  // 1. FTS5 关键词搜索
  const ftsResults = docStore.searchFts(query, ftsLimit);
  if (ftsResults.length > 0) {
    rankedLists.push(
      ftsResults.map((r, idx) => ({
        id: r.id,
        // 使用原始 BM25 分数（如果有），否则使用位置归一化
        score: r.rank || (1 - (idx / ftsResults.length)),
        rank: idx + 1,
      })),
    );
  }

  // 2. 向量语义搜索（仅在嵌入模型可用时）
  const vectorAvailable = embeddingModel?.isAvailable === true;
  if (vectorAvailable) {
    try {
      const queryEmbedding = await embeddingModel.getEmbedding(query);
      if (queryEmbedding) {
        const vectorResults = docStore.searchVector(queryEmbedding, vectorLimit);
        if (vectorResults.length > 0) {
          rankedLists.push(
            vectorResults.map((r, idx) => ({
              id: r.chunkId,
              score: r.vectorScore,
              rank: idx + 1,
            })),
          );
        }
      }
    } catch (err) {
      log?.warn?.(`Vector search failed: ${err.message}`);
    }
  }

  // 3. RRF 融合
  if (rankedLists.length === 0) return [];

  const rrfScores = rrfFusion(rankedLists);

  // 按 RRF 分数降序排列
  const sorted = Array.from(rrfScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  // 4. 获取完整块内容
  const ids = sorted.map(([id]) => id);
  const chunks = docStore.getChunksByIds(ids);
  const chunkMap = new Map(chunks.map((c) => [c.id, c]));

  return sorted.map(([id, score]) => {
    const chunk = chunkMap.get(id);
    return chunk ? { ...chunk, score: Math.round(score * 1e6) / 1e6 } : null;
  }).filter(Boolean);
}

/**
 * 仅 FTS5 关键词检索（回退模式，不依赖嵌入模型）
 * @param {string} query
 * @param {import('./doc-store.js').DocStore} docStore
 * @param {number} [limit=5]
 * @returns {Array<object>}
 */
export function searchFtsOnly(query, docStore, limit = 5) {
  const results = docStore.searchFts(query, limit);
  if (results.length === 0) return [];

  return results.map((r, idx) => ({
    ...r,
    score: Math.round((1 - idx / results.length) * 1e6) / 1e6,
  }));
}
