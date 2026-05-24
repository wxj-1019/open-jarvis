/**
 * document-ingestor.js — RAG 文档摄入器
 *
 * 读取文件 → 分块 → 生成嵌入 → 存入 DocStore。
 * 纯函数模块，不持有状态。
 */

import fs from "fs";
import path from "path";
import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("document-ingestor");

// 支持的文件扩展名
const SUPPORTED_EXTENSIONS = new Set([
  ".txt", ".md", ".markdown",
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx",
  ".json", ".jsonc",
  ".py", ".pyw",
  ".html", ".htm", ".css", ".scss", ".less",
  ".yaml", ".yml",
  ".xml", ".svg",
  ".sh", ".bash", ".zsh", ".fish",
  ".env", ".gitignore", ".editorconfig",
  ".ini", ".cfg", ".conf", ".toml",
  ".rs", ".go", ".java", ".c", ".cpp", ".h", ".hpp",
  ".rb", ".php", ".swift", ".kt",
  ".sql", ".graphql",
  ".vue", ".svelte",
  ".dockerfile", "dockerfile",
]);

// 默认分块参数
const DEFAULT_CHUNK_SIZE = 512;
const DEFAULT_CHUNK_OVERLAP = 64;

// 最大文件大小 (2MB)
const MAX_FILE_SIZE = 2 * 1024 * 1024;

/**
 * 检查文件是否支持摄入
 * @param {string} filePath
 * @returns {{ supported: boolean, reason?: string }}
 */
function checkFileSupport(filePath) {
  if (!fs.existsSync(filePath)) {
    return { supported: false, reason: `File not found: ${filePath}` };
  }

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    return { supported: false, reason: `Not a file: ${filePath}` };
  }

  if (stat.size > MAX_FILE_SIZE) {
    return { supported: false, reason: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB): ${filePath}` };
  }

  if (stat.size === 0) {
    return { supported: false, reason: `File is empty: ${filePath}` };
  }

  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath).toLowerCase();

  if (!SUPPORTED_EXTENSIONS.has(ext) && !SUPPORTED_EXTENSIONS.has(base)) {
    return { supported: false, reason: `Unsupported file type: ${ext || base}` };
  }

  return { supported: true };
}

/**
 * 递归字符分割器
 * 优先按段落 (\\n\\n) 分割，再按句子 (。.!?) 分割，最后按字符硬截断。
 * @param {string} text - 原始文本
 * @param {number} [maxSize=512] - 最大分块大小（字符数）
 * @param {number} [overlap=64] - 块间重叠大小（字符数）
 * @returns {string[]} 文本分块数组
 */
export function chunkText(text, maxSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_CHUNK_OVERLAP) {
  if (!text || text.trim().length === 0) return [];

  const effectiveSize = Math.max(128, maxSize);
  const effectiveOverlap = Math.min(overlap, Math.floor(effectiveSize * 0.3));

  // Step 1: 按段落分割
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  // Step 2: 合并段落直到超过 maxSize
  const chunks = [];
  let current = "";

  for (const para of paragraphs) {
    const trimmed = para.trim();

    if (current.length + trimmed.length + 1 > effectiveSize && current.length > 0) {
      chunks.push(current.trim());
      // 重叠：保留 current 尾部 overlap 字符
      const tail = current.length > effectiveOverlap
        ? current.slice(-effectiveOverlap)
        : current;
      current = tail + "\n\n" + trimmed;
    } else {
      current = current ? current + "\n\n" + trimmed : trimmed;
    }
  }

  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }

  // Step 3: 如果仍有超过 maxSize 的块，按句子再分
  const finalChunks = [];
  for (const chunk of chunks) {
    if (chunk.length <= effectiveSize) {
      finalChunks.push(chunk);
      continue;
    }
    // 按句子边界分割
    const sentences = chunk.split(/(?<=[。.!?！？])\s*/);
    let sentChunk = "";
    for (const sent of sentences) {
      if (sentChunk.length + sent.length > effectiveSize && sentChunk.length > 0) {
        finalChunks.push(sentChunk.trim());
        sentChunk = sent;
      } else {
        sentChunk += sent;
      }
    }
    if (sentChunk.trim().length > 0) {
      // 如果最后一块仍超长，硬截断
      while (sentChunk.length > effectiveSize) {
        finalChunks.push(sentChunk.slice(0, effectiveSize));
        sentChunk = sentChunk.slice(effectiveSize - effectiveOverlap);
      }
      if (sentChunk.trim().length > 0) {
        finalChunks.push(sentChunk.trim());
      }
    }
  }

  return finalChunks;
}

/**
 * 摄入单个文件：读取→分块→嵌入→存储
 * @param {string} filePath - 文件绝对路径
 * @param {import('./doc-store.js').DocStore} docStore
 * @param {import('../memory/embedding-model.js').EmbeddingModelManager} embeddingModel
 * @param {object} [opts]
 * @param {number} [opts.chunkSize]
 * @param {number} [opts.chunkOverlap]
 * @param {boolean} [opts.overwrite] - 是否覆盖已存在的同名文档（默认 false）
 * @returns {Promise<{ docPath: string, docName: string, chunks: number }>}
 */
export async function ingestFile(filePath, docStore, embeddingModel, opts = {}) {
  const check = checkFileSupport(filePath);
  if (!check.supported) {
    throw new Error(check.reason);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  if (!content || content.trim().length === 0) {
    throw new Error(`File is empty: ${filePath}`);
  }

  // 如果指定 overwrite，先检查是否存在旧数据，暂不删除
  let oldChunkCount = 0;
  if (opts.overwrite) {
    oldChunkCount = docStore.getDocChunksCount(filePath) || 0;
  }

  const docName = path.basename(filePath);
  const chunkSize = opts.chunkSize || DEFAULT_CHUNK_SIZE;
  const chunkOverlap = opts.chunkOverlap || DEFAULT_CHUNK_OVERLAP;

  // 分块
  const texts = chunkText(content, chunkSize, chunkOverlap);
  if (texts.length === 0) {
    throw new Error(`No chunkable content in: ${filePath}`);
  }

  // 写入块元数据
  const chunks = texts.map((text, i) => ({
    docName,
    docPath: filePath,
    chunkIndex: i,
    chunkText: text,
    chunkSize: text.length,
  }));
  const chunkIds = docStore.addChunks(chunks);
  log?.log?.(`${docName}: ${chunkIds.length} chunks stored`);

  // 新数据写入成功后，删除旧数据（确保不丢失）
  if (opts.overwrite && oldChunkCount > 0) {
    docStore.deleteDoc(filePath);
    log?.log?.(`${docName}: ${oldChunkCount} old chunks replaced`);
  }

  // 生成嵌入并存储
  if (embeddingModel?.isAvailable) {
    const embeddings = await embeddingModel.getEmbeddings(texts);
    const validItems = [];
    for (let i = 0; i < chunkIds.length; i++) {
      if (embeddings[i]) {
        validItems.push({ chunkId: chunkIds[i], embedding: embeddings[i] });
      }
    }
    if (validItems.length > 0) {
      docStore.storeEmbeddings(validItems);
      log?.log?.(`${docName}: ${validItems.length}/${chunkIds.length} embeddings stored`);
    }
  } else {
    log?.warn?.(`${docName}: embedding model unavailable, skipping vector index`);
  }

  return { docPath: filePath, docName, chunks: chunkIds.length };
}

/**
 * 摄入目录下所有支持的文件
 * @param {string} dirPath - 目录路径
 * @param {import('./doc-store.js').DocStore} docStore
 * @param {import('../memory/embedding-model.js').EmbeddingModelManager} embeddingModel
 * @param {object} [opts]
 * @returns {Promise<{ totalChunks: number, files: Array<{ docPath: string, docName: string, chunks: number }>, errors: Array<{ file: string, error: string }> }>}
 */
export async function ingestDirectory(dirPath, docStore, embeddingModel, opts = {}) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    throw new Error(`Not a directory: ${dirPath}`);
  }

  const files = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // 跳过 node_modules, .git, dist 等
        if (["node_modules", ".git", "dist", ".cache", "__pycache__"].includes(entry.name)) continue;
        walk(full);
      } else if (entry.isFile()) {
        const check = checkFileSupport(full);
        if (check.supported) files.push(full);
      }
    }
  }
  walk(dirPath);

  const results = { totalChunks: 0, files: [], errors: [] };
  const concurrency = opts.concurrency || 4; // 默认 4 个并发

  // 分批并发处理文件
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(file => ingestFile(file, docStore, embeddingModel, opts))
    );
    
    batchResults.forEach((result, idx) => {
      if (result.status === "fulfilled") {
        results.files.push(result.value);
        results.totalChunks += result.value.chunks;
      } else {
        results.errors.push({ file: batch[idx], error: result.reason.message });
      }
    });
  }

  return results;
}
