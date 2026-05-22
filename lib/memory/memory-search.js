/**
 * memory-search.js — search_memory 工具（v2 标签检索）
 *
 * 替代 v1 的 embedding KNN + 混合排序 + 链接展开。
 * v2 用标签匹配 + 日期过滤 + FTS5 全文搜索兜底。
 *
 * 标签由 LLM 在元事实拆分时生成，也由 LLM 在搜索时生成查询标签，
 * 两边的"语言习惯"天然接近，一致性有保障。
 */

import { Type } from "../pi-sdk/index.js";
import { t } from "../../server/i18n.js";
import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("memory-search");

/**
 * 创建 search_memory 工具定义
 * @param {import('./fact-store.js').FactStore} factStore
 * @param {object} [opts]
 * @param {function} [opts.getMemoryMasterEnabled] - 返回 agent 级别记忆总开关状态
 * @returns {import('../pi-sdk/index.js').ToolDefinition}
 */
export function createMemorySearchTool(factStore, opts = {}) {
  return {
    name: "search_memory",
    label: t("error.memorySearchLabel"),
    description: t("error.memorySearchDesc"),
    parameters: Type.Object({
      query: Type.String({ description: t("error.memorySearchQueryDesc") }),
      tags: Type.Optional(
        Type.Array(Type.String(), {
          description: t("error.memorySearchTagsDesc"),
        }),
      ),
      date_from: Type.Optional(
        Type.String({ description: t("error.memorySearchDateFromDesc") }),
      ),
      date_to: Type.Optional(
        Type.String({ description: t("error.memorySearchDateToDesc") }),
      ),
    }),
    execute: async (_toolCallId, params) => {
      try {
        const t0 = performance.now();

        if (factStore.size === 0) {
          return {
            content: [{ type: "text", text: t("error.memorySearchEmpty") }],
            details: {},
          };
        }

        const dateRange = {};
        if (params.date_from) dateRange.from = params.date_from;
        if (params.date_to) dateRange.to = params.date_to + "T23:59";

        let results = [];
        const seenIds = new Set();

        if (factStore.searchWithVectors) {
          // 计算标签相关性分数（匹配标签数 / 查询标签数）
          const tagScores = {};
          if (params.tags && params.tags.length > 0) {
            try {
              const tagResults = factStore.searchByTags(
                params.tags,
                Object.keys(dateRange).length > 0 ? dateRange : undefined,
                100,
              );
              for (const r of tagResults) {
                tagScores[r.id] = Math.min(r.matchCount / params.tags.length, 1);
              }
            } catch (err) {
              log.warn(`searchByTags 失败，跳过标签评分: ${err.message}`);
            }
          }

          const vectorResults = await factStore.searchWithVectors(
            params.query,
            20,
            Object.keys(dateRange).length > 0 ? dateRange : undefined,
            { tagScores, tagWeight: params.tags?.length > 0 ? 0.2 : 0 },
          );
          for (const r of vectorResults) {
            seenIds.add(r.id);
            results.push({ ...r, source: "hybrid" });
          }
        } else if (factStore.enhancedSearchFullText) {
          const enhancedResults = factStore.enhancedSearchFullText(params.query, {
            limit: 20,
            reranking: {
              recencyWeight: 0.2,
              tagWeight: 0.2,
              queryTags: params.tags || [],
              currentTime: new Date().toISOString(),
            },
            cjkOptions: { enable4Gram: true },
            queryExpansion: { enable: true },
          });

          for (const r of enhancedResults) {
            seenIds.add(r.id);
            results.push({ ...r, source: "enhanced-fts" });
          }

          if (params.tags && params.tags.length > 0 && results.length < 3) {
            const tagResults = factStore.searchByTags(
              params.tags,
              Object.keys(dateRange).length > 0 ? dateRange : undefined,
              15,
            );
            for (const r of tagResults) {
              if (seenIds.has(r.id)) continue;
              seenIds.add(r.id);
              results.push({ ...r, source: "tag" });
            }
          }
        } else {
          if (params.tags && params.tags.length > 0) {
            const tagResults = factStore.searchByTags(
              params.tags,
              Object.keys(dateRange).length > 0 ? dateRange : undefined,
              15,
            );
            for (const r of tagResults) {
              seenIds.add(r.id);
              results.push({ ...r, source: "tag" });
            }
          }

          if (results.length < 3 && params.query) {
            const ftsResults = factStore.searchFullText(params.query, 10);
            for (const r of ftsResults) {
              if (seenIds.has(r.id)) continue;
              seenIds.add(r.id);
              results.push({ ...r, source: "fts" });
            }
          }
        }

        if (dateRange.from || dateRange.to) {
          results = results.filter((r) => {
            if (!r.time) return true;
            if (dateRange.from && r.time < dateRange.from) return false;
            if (dateRange.to && r.time > dateRange.to) return false;
            return true;
          });
        }

        // 时间衰减：将遗忘曲线 retention 作为乘性因子融入排序
        if (factStore._forgettingCurve && results.length > 1) {
          results = results.map((r) => {
            try {
              const retention = factStore._forgettingCurve.calculateFactRetention(r);
              // 衰减因子：retention 越低（越陈旧），得分下降越多
              r._decayFactor = 0.5 + retention * 0.5; // 0.5（最陈旧）→ 1.0（最新）
            } catch {
              r._decayFactor = 1; // 衰减计算失败时不影响排序
            }
            // 基分：hybrid 路径用 hybridScore，tag 路径用 matchCount，其他用 1
            const baseScore = r.hybridScore ?? r.matchCount ?? 1;
            r._sortScore = baseScore * r._decayFactor;
            return r;
          });
          results.sort((a, b) => (b._sortScore ?? 0) - (a._sortScore ?? 0));
        }

        const elapsed = performance.now() - t0;
        log.log(
          `${elapsed.toFixed(0)}ms | ` +
          `hits: ${results.length}`,
        );

        if (results.length === 0) {
          return {
            content: [{ type: "text", text: t("error.memorySearchEmpty") }],
            details: {},
          };
        }

        const lines = results.map((r, i) => {
          const tagsStr = r.tags.length > 0 ? ` (${r.tags.join(", ")})` : "";
          const timeStr = r.time ? ` — ${r.time}` : "";
          return `${i + 1}. ${r.fact}${tagsStr}${timeStr}`;
        });

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: { resultCount: results.length },
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: t("error.memorySearchError", { msg: err.message }) }],
          details: {},
        };
      }
    },
  };
}
