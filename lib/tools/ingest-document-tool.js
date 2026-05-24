/**
 * ingest-document-tool.js — ingest_document Agent 工具
 *
 * 让 Agent 能主动摄入文档到 RAG 知识库：
 *   读文件 → 分块 → 嵌入 → 存入 DocStore
 *   返回摄入统计信息。
 */

import { Type } from "../pi-sdk/index.js";
import { ingestFile } from "../rag/document-ingestor.js";

/**
 * @param {object} deps
 * @param {import('../rag/doc-store.js').DocStore} deps.docStore
 * @param {import('../memory/embedding-model.js').EmbeddingModelManager} deps.embeddingModel
 */
export function createIngestDocumentTool(deps) {
  return {
    name: "ingest_document",
    label: "Ingest Document",
    description:
      "Ingest a document file into the RAG knowledge base for later semantic search. " +
      "Reads the file, splits it into chunks, generates embeddings, and stores them. " +
      "Supported formats: .txt, .md, .js/.ts, .json, .py, .html, .css, .yaml, .xml, .sh, and other text files. " +
      "Use this when the user asks you to remember, learn, or index a document, or when you need to " +
      "make project files searchable for future reference.",
    parameters: Type.Object({
      filePath: Type.String({
        description:
          "Absolute path to the file to ingest. " +
          "Must be a text file under 2MB. Supported extensions include .txt, .md, .js, .ts, .json, .py, .html, .css, .yaml, .xml, .sh, etc.",
      }),
      overwrite: Type.Boolean({
        description:
          "Whether to overwrite previously ingested chunks for the same file. " +
          "Set to true to re-ingest an updated file (default: false).",
        default: false,
      }),
    }),

    execute: async (_toolCallId, params) => {
      const filePath = String(params.filePath || "").trim();
      if (!filePath) {
        return {
          content: [{ type: "text", text: "Error: filePath is required." }],
        };
      }

      try {
        const result = await ingestFile(filePath, deps.docStore, deps.embeddingModel, {
          overwrite: params.overwrite === true,
        });
        return {
          content: [{
            type: "text",
            text: `Document ingested successfully.\n` +
                  `- File: ${result.docName}\n` +
                  `- Path: ${result.docPath}\n` +
                  `- Chunks: ${result.chunks}\n` +
                  `- The document is now searchable via search_documents.`,
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: "text",
            text: `Failed to ingest document: ${err.message}`,
          }],
        };
      }
    },
  };
}
