import { callText } from "../../core/llm-client.js";
import { getLocale } from "../../server/i18n.js";
import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("contradiction-detector");

export class ContradictionDetector {
  constructor(factStore, resolvedModel) {
    this._factStore = factStore;
    this._resolvedModel = resolvedModel;
  }

  async detect(newFact, newTags = []) {
    try {
      const relatedFacts = await this._findRelatedFacts(newFact, newTags);

      if (relatedFacts.length === 0) {
        return { hasContradiction: false, conflicts: [] };
      }

      const conflicts = await this._detectContradictionsWithLLM(newFact, relatedFacts);

      return {
        hasContradiction: conflicts.length > 0,
        conflicts,
      };
    } catch (err) {
      log.warn(`矛盾检测失败: ${err.message}`);
      return { hasContradiction: false, conflicts: [] };
    }
  }

  async _findRelatedFacts(newFact, newTags) {
    const tagResults = this._factStore.searchByTags(newTags, null, 10);

    const ftsResults = this._factStore.searchFullText(newFact, 10);

    const seen = new Set();
    const results = [];

    for (const fact of [...tagResults, ...ftsResults]) {
      if (!seen.has(fact.id)) {
        seen.add(fact.id);
        results.push(fact);
      }
    }

    return results.slice(0, 20);
  }

  async _detectContradictionsWithLLM(newFact, existingFacts) {
    const { model: utilityModel, api, api_key, base_url } = this._resolvedModel;
    const isZh = getLocale().startsWith("zh");

    const existingFactsText = existingFacts
      .map((f, i) => `${i + 1}. ${f.fact}`)
      .join("\n");

    const prompt = isZh
      ? `你是一个矛盾检测器。判断新事实是否与已有事实矛盾。

新事实：${newFact}

已有事实：
${existingFactsText}

判断规则：
1. 如果新事实与已有事实在同一主题上表达相反含义，则为矛盾
2. 如果新事实是已有事实的补充或细化，则不为矛盾
3. 如果新事实是已有事实的更新（如偏好变化），则为矛盾（需要标记旧事实为过时）

输出格式（JSON 数组）：
[
  {
    "existing_fact_id": 已有事实的序号,
    "reason": "矛盾原因说明"
  }
]

如果没有矛盾，输出空数组 []。只输出 JSON，不要输出其他内容。`
      : `You are a contradiction detector. Determine if the new fact contradicts existing facts.

New fact: ${newFact}

Existing facts:
${existingFactsText}

Rules:
1. If the new fact expresses the opposite meaning on the same topic as an existing fact, it is a contradiction
2. If the new fact is a supplement or refinement of an existing fact, it is not a contradiction
3. If the new fact is an update (e.g., preference change), it is a contradiction (need to mark the old fact as outdated)

Output format (JSON array):
[
  {
    "existing_fact_id": 序号 of the existing fact,
    "reason": "Reason for contradiction"
  }
]

If there is no contradiction, output an empty array []. Output only JSON, no other content.`;

    try {
      const raw = await callText({
        api,
        model: utilityModel,
        apiKey: api_key,
        baseUrl: base_url,
        systemPrompt: prompt,
        messages: [{ role: "user", content: `检测矛盾：\n新事实：${newFact}\n已有事实：\n${existingFactsText}` }],
        temperature: 0.1,
        maxTokens: 1024,
      });

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter(p => p.existing_fact_id >= 1 && p.existing_fact_id <= existingFacts.length)
        .map(p => ({
          existingFact: existingFacts[p.existing_fact_id - 1].fact,
          reason: p.reason,
        }));
    } catch (err) {
      log.warn(`LLM 矛盾检测失败: ${err.message}`);
      return [];
    }
  }
}
