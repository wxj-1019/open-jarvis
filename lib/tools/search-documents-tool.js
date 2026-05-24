/**
 * search-documents-tool.js — search_documents Agent 工具
 *
 * 让 Agent 能搜索已摄入的 RAG 文档知识库：
 *   FTS5 关键词 + 向量语义 → RRF 融合检索。
 */

import { Type } from "../pi-sdk/index.js";
import { search, searchFtsOnly } from "../rag/rag-retriever.js";

/**
 * @param {object} deps
 * @param {import('../rag/doc-store.js').DocStore} deps.docStore
 * @param {import('../memory/embedding-model.js').EmbeddingModelManager} deps.embeddingModel
 */
export function createSearchDocumentsTool(deps) {
  return {
    name: "search_documents",
    label: "Search Documents",
    description:
      "Search previously ingested documents in the RAG knowledge base. " +
      "Uses hybrid search (keyword + semantic) when embeddings are available, " +
      "falling back to full-text search otherwise. " +
      "Use this to find relevant information from project documentation, " +
      "code files, notes, or any documents that have been ingested.",
    parameters: Type.Object({
      query: Type.String({
        description:
          "Search query. Use natural language or keywords. " +
          "Example: 'authentication flow' or 'how is the database connected'",
      }),
      limit: Type.Number({
        description: "Maximum number of results to return (default 5, max 20).",
        default: 5,
      }),
    }),

    execute: async (_toolCallId, params) => {
      const query = String(params.query || "").trim();
      if (!query) {
        return {
          content: [{ type: "text", text: "Error: query is required." }],
        };
      }

      const limit = Math.min(Math.max(1, Number(params.limit) || 5), 20);

      try {
        let results;
        try {
          results = await search(query, deps.docStore, deps.embeddingModel, { limit });
        } catch {
          results = searchFtsOnly(query, deps.docStore, limit);
        }

        if (!results || results.length === 0) {
          return {
            content: [{
              type: "text",
              text: `No documents found matching: "${query}". Try different keywords or ingest relevant documents first using ingest_document.`,
            }],
          };
        }

        const lines = results.map((r, idx) =>
          `${idx + 1}. [${r.docName}#${r.chunkIndex}] (score: ${r.score})\n` +
          `   ${r.chunkText.slice(0, 300)}${r.chunkText.length > 300 ? "..." : ""}`
        );

        return {
          content: [{
            type: "text",
            text: `Found ${results.length} result(s) for "${query}":\n\n${lines.join("\n\n")}`,
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: "text",
            text: `Search failed: ${err.message}`,
          }],
        };
      }
    },
  };
}
