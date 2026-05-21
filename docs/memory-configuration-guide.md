# Memory System Configuration Guide

## Overview

The memory system in OpenJarvis is highly configurable. This guide covers all available configuration options, recommended settings for different use cases, and troubleshooting tips.

## Configuration File

Memory settings are configured in your `config.yaml` file (located in your workspace directory):

```yaml
# config.yaml
memory:
  enabled: true
  model: "your-utility-model"
  summary_model: "your-utility-model"
  embedding:
    local: true
    remote_api_url: ""
    remote_api_key: ""
    force_remote: false
```

## Configuration Options

### `memory.enabled`

**Type:** `boolean`  
**Default:** `true`  
**Description:** Master switch for the entire memory system. When disabled, no memory operations (summarization, compilation, fact extraction) will occur.

```yaml
memory:
  enabled: false  # Disables all memory features
```

### `memory.model`

**Type:** `string` (model reference)  
**Default:** The utility model configured during setup  
**Description:** Model used for memory compilation (compileToday, compileWeek, compileLongterm, compileFacts) and fact extraction.

**Recommended models:**
- For Chinese: Models with strong Chinese comprehension
- For English: Any capable instruction-following model
- The model should have good summarization capabilities

```yaml
memory:
  model: "anthropic/claude-sonnet-4-20250514"
```

### `memory.summary_model`

**Type:** `string` (model reference)  
**Default:** The utility model configured during setup  
**Description:** Model used for rolling session summaries. Can be a smaller/cheaper model since summaries are less complex than full compilation.

```yaml
memory:
  summary_model: "openai/gpt-4o-mini"
```

### `memory.embedding`

Embedding configuration for vector-based semantic search.

#### `memory.embedding.local`

**Type:** `boolean`  
**Default:** `true`  
**Description:** Whether to use the local embedding model (`@xenova/transformers`). The local model runs on-device and doesn't require API calls.

```yaml
memory:
  embedding:
    local: true  # Use local model (recommended for privacy)
```

#### `memory.embedding.remote_api_url`

**Type:** `string`  
**Default:** `""`  
**Description:** URL for remote embedding API (OpenAI compatible format).

```yaml
memory:
  embedding:
    remote_api_url: "https://api.openai.com/v1/embeddings"
```

#### `memory.embedding.remote_api_key`

**Type:** `string`  
**Default:** `""`  
**Description:** API key for remote embedding service.

```yaml
memory:
  embedding:
    remote_api_key: "sk-..."
```

#### `memory.embedding.force_remote`

**Type:** `boolean`  
**Default:** `false`  
**Description:** Always use remote embedding API, even if local model is available and working.

```yaml
memory:
  embedding:
    force_remote: true  # Skip local model, use remote API
```

### `memory.forgetting_curve`

Forgetting curve configuration for automatic memory archival based on Ebbinghaus forgetting model.

#### `memory.forgetting_curve.enabled`

**Type:** `boolean`  
**Default:** `false`  
**Description:** Enable forgetting curve evaluation during daily compilation.

```yaml
memory:
  forgetting_curve:
    enabled: true
```

#### `memory.forgetting_curve.schedule`

**Type:** `Array<{days: number, retentionRate: number}>`  
**Default:** Standard Ebbinghaus curve
**Description:** Decay schedule points defining retention rate at specific days.

```yaml
memory:
  forgetting_curve:
    schedule:
      - days: 1
        retentionRate: 0.50    # 50% after 1 day
      - days: 3
        retentionRate: 0.30    # 30% after 3 days
      - days: 7
        retentionRate: 0.20    # 20% after 7 days
      - days: 30
        retentionRate: 0.10    # 10% after 30 days
```

#### `memory.forgetting_curve.archive_threshold`

**Type:** `number` (0-1)  
**Default:** `0.25`  
**Description:** Retention rate threshold below which memories are archived. Lower values keep memories longer.

```yaml
memory:
  forgetting_curve:
    archive_threshold: 0.15  # More aggressive archival
```

#### `memory.forgetting_curve.protected_tags`

**Type:** `string[]`  
**Default:** `[]`  
**Description:** Tags that prevent archival regardless of retention rate.

```yaml
memory:
  forgetting_curve:
    protected_tags:
      - "important"
      - "identity"
      - "preferences"
```

### `memory.quality`

Quality scoring and monitoring configuration.

#### `memory.quality.enabled`

**Type:** `boolean`  
**Default:** `false`  
**Description:** Enable quality evaluation during fact processing.

```yaml
memory:
  quality:
    enabled: true
```

#### `memory.quality.weights`

**Type:** `object`  
**Default:** `{specificity: 0.25, recency: 0.20, relevance: 0.25, consistency: 0.15, usage: 0.15}`  
**Description:** Weights for the five quality dimensions.

```yaml
memory:
  quality:
    weights:
      specificity: 0.30    # How detailed/specific the memory is
      recency: 0.15        # How recent (reduced for long-term memories)
      relevance: 0.30      # Relevance to user model
      consistency: 0.15    # Consistency with other memories
      usage: 0.10          # How frequently accessed
```

#### `memory.quality.min_threshold`

**Type:** `number` (0-100)  
**Default:** `40`  
**Description:** Minimum quality score. Memories below this threshold are flagged for review.

```yaml
memory:
  quality:
    min_threshold: 30  # More lenient threshold
```

#### `memory.quality.auto_cleanup`

**Type:** `object`  
**Description:** Automatic cleanup of low-quality memories.

```yaml
memory:
  quality:
    auto_cleanup:
      enabled: false         # Enable automatic cleanup
      threshold: 15          # Quality threshold for cleanup
      age_days: 365          # Only clean memories older than 1 year
```

### `memory.search`

Search optimization configuration.

#### `memory.search.ft5_optimizer`

**Type:** `object`  
**Description:** FTS5 search enhancement settings.

```yaml
memory:
  search:
    fts5_optimizer:
      synonym_map:
        "machine learning": ["ML", "机器学习"]
        "artificial intelligence": ["AI", "人工智能"]
      bm25_params:
        k1: 1.2
        b: 0.75
      column_weights:
        fact: 2.0
        search_text: 1.0
```

## Session-Level Memory Control

Individual sessions can have memory enabled or disabled through the UI or API:

```
# Via settings UI: Settings → Memory → Per-session toggle
# Via API: DELETE /api/memories?agentId=hana (clears all)
# Via API: DELETE /api/memories/compiled?agentId=hana (clears compiled only)
```

## Memory File Structure

Each agent has its own memory directory:

```
agents/
└── hana/
    └── memory/
        ├── memory.md          # Assembled memory (used in system prompt)
        ├── today.md           # Today's session compilation
        ├── today.md.fingerprint
        ├── week.md            # 7-day sliding window compilation
        ├── week.md.fingerprint
        ├── longterm.md        # Long-term user profile
        ├── longterm.md.fingerprint
        ├── facts.md           # Key facts (stable user attributes)
        ├── facts.db           # SQLite fact store
        ├── vectors.db         # Vector embeddings (optional)
        ├── summaries/         # Per-session summary files
        │   ├── session-id-1.json
        │   └── session-id-2.json
        └── reset.json         # Reset watermark
```

## Tuning Recommendations

### For Privacy-Focused Users

```yaml
memory:
  embedding:
    local: true          # All processing on-device
    force_remote: false
    remote_api_url: ""
    remote_api_key: ""
  forgetting_curve:
    enabled: true
    archive_threshold: 0.20  # Conservative archival
    protected_tags:
      - "identity"
      - "preferences"
```

### For Best Search Quality

```yaml
memory:
  embedding:
    local: true          # Fallback
    remote_api_url: "https://api.openai.com/v1/embeddings"
    remote_api_key: "sk-..."  # Uses text-embedding-3-small or similar
    force_remote: false  # Try local first, use remote if unavailable
  search:
    fts5_optimizer:
      synonym_map:
        "machine learning": ["ML", "机器学习"]
        "AI": ["artificial intelligence", "人工智能"]
      bm25_params:
        k1: 1.5
        b: 0.8
```

### For Low-Resource Systems

```yaml
memory:
  model: "openai/gpt-4o-mini"       # Cheaper model for compilation
  summary_model: "openai/gpt-4o-mini"  # Same model for summaries
  embedding:
    local: true          # Local embedding uses minimal resources
    force_remote: false
  quality:
    enabled: false       # Disable quality scoring
  forgetting_curve:
    enabled: false       # Disable forgetting curve
```

### For Heavy Users (Many Sessions)

```yaml
memory:
  model: "anthropic/claude-sonnet-4-20250514"  # Better compilation quality
  summary_model: "anthropic/claude-sonnet-4-20250514"
  embedding:
    local: true
    force_remote: false
  forgetting_curve:
    enabled: true
    archive_threshold: 0.15  # More aggressive archival to control size
    protected_tags:
      - "important"
      - "identity"
  quality:
    enabled: true
    auto_cleanup:
      enabled: true
      threshold: 20
      age_days: 180
```

### For Knowledge Workers (Research/Academic)

```yaml
memory:
  forgetting_curve:
    enabled: true
    schedule:
      - days: 1
        retentionRate: 0.60    # Slower decay for knowledge
      - days: 7
        retentionRate: 0.40
      - days: 30
        retentionRate: 0.25
      - days: 90
        retentionRate: 0.15
    archive_threshold: 0.10
  quality:
    enabled: true
    weights:
      specificity: 0.35    # Prioritize detailed memories
      recency: 0.10        # Less weight on recency
      relevance: 0.30
      consistency: 0.15
      usage: 0.10
```

## Troubleshooting

### Memory Not Updating

1. Check `memory.enabled` is `true`
2. Verify the configured model is accessible
3. Check `agents/hana/memory/reset.json` for reset timestamp
4. Look for errors in debug logs

### Search Returns No Results

1. Ensure facts have been extracted (check `facts.db` exists)
2. Verify session summaries exist in `summaries/` directory
3. Try different search terms (tags vs full-text)

### Vector Search Not Working

1. Check embedding model initialization in logs
2. Verify `vectors.db` exists and is not corrupted
3. Ensure fact count is sufficient (>10 facts for meaningful results)

### Database Growing Too Large

1. Clear old facts: `DELETE /api/memories?agentId=hana`
2. Reset compiled memory: `DELETE /api/memories/compiled?agentId=hana`
3. Consider disabling vector embeddings if not needed

### Performance Issues

1. Limit fact count through regular cleanup
2. Use a faster model for compilation
3. Disable vector search if not needed (remove `vectorDbPath` option)

## Manual Memory Operations

### Trigger Full Compilation

```javascript
// Via memory ticker
memoryTicker.tick();

// Or trigger without awaiting
memoryTicker.triggerNow();
```

### Clear Memory

```bash
# Via API
curl -X DELETE "http://localhost:PORT/api/memories?agentId=hana"
curl -X DELETE "http://localhost:PORT/api/memories/compiled?agentId=hana"
```

### Export Facts

```bash
# Via API
curl "http://localhost:PORT/api/facts?agentId=hana"
```

## Advanced Usage Examples

### User Feedback Loop

Mark facts as important or useless to influence quality scores:

```javascript
// Mark a fact as important (increases quality score by 15)
const result = factStore.add({
  fact: "用户是一名资深软件工程师",
  tags: ["identity", "work"],
});
factStore.markFactImportant(result.id, "核心身份信息");

// Mark a fact as useless (decreases quality score by 30)
const result2 = factStore.add({
  fact: "临时会议安排",
  tags: ["temporary"],
});
factStore.markFactUseless(result2.id, "已过时");

// Get user feedback for a fact
const feedback = factStore.getUserFeedback(result.id);
console.log(feedback); // { important: true, importantReason: "核心身份信息", importantAt: "..." }

// Get all facts marked as important or useless
const importantFacts = factStore.getFactsWithFeedback("important");
const uselessFacts = factStore.getFactsWithFeedback("useless");
```

### Recompute Quality Score

Manually recompute quality score for a fact (e.g., after access count changes):

```javascript
// Increment access count
factStore.incrementAccessCount(factId);

// Recompute quality score to reflect new access count
factStore.recomputeQualityForFact(factId);

// Get updated quality scores
const fact = factStore.getById(factId);
console.log(fact.quality_scores);
```

### Compile Quality Evaluation

Evaluate the quality of compiled memory output:

```javascript
import { createCompileQualityEvaluator } from "./lib/memory/compile-quality.js";

const evaluator = createCompileQualityEvaluator();

// Evaluate compile result
const evaluation = evaluator.evaluateCompileResult({
  today: "用户今天专注于记忆系统优化",
  week: "本周用户主要关注性能优化",
  longterm: "用户是一名资深工程师",
  facts: "用户喜欢高质量的代码",
});

console.log(evaluation.score); // Overall score (0-100)
console.log(evaluation.issues); // Array of issues found
console.log(evaluation.sectionScores); // Per-section scores

// Compare two compile results
const comparison = evaluator.compareCompileResults(beforeEval, afterEval);
console.log(comparison.improved); // true if score improved
console.log(comparison.scoreDiff); // Score difference

// Generate human-readable report
const report = evaluator.generateReport(evaluation, comparison);
console.log(report);
```

### Timezone-Aware Time Display

Display memory times in user's timezone with relative formatting:

```javascript
import {
  setUserTimezone,
  convertToUserTimezone,
  formatMemoryTime,
  isToday,
} from "./lib/memory/timezone-utils.js";

// Set user's timezone
setUserTimezone("Asia/Shanghai");

// Convert ISO string to user's timezone
const utcTime = "2026-05-22T10:00:00Z";
const userTime = convertToUserTimezone(utcTime);
console.log(userTime); // "2026-05-22T18:00:00" (UTC+8)

// Format memory time with relative display
const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
console.log(formatMemoryTime(fiveMinAgo)); // "5 分钟前"

const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
console.log(formatMemoryTime(twoHoursAgo)); // "2 小时前"

const threeDaysAgo = new Date(Date.now() - 3 * 86400 * 1000).toISOString();
console.log(formatMemoryTime(threeDaysAgo)); // "3 天前"

// Check if a memory was created today
console.log(isToday(new Date().toISOString())); // true
console.log(isToday(threeDaysAgo)); // false
```

### Automatic Quality Repair

Generate suggestions for improving low-quality facts:

```javascript
import { createQualityRepair } from "./lib/memory/quality-repair.js";

const repair = createQualityRepair({ maxSuggestionsPerRun: 10 });

// Get low-quality facts from fact store
const lowQualityFacts = factStore.getLowQualityFacts(40);

// Generate repair suggestions
const suggestions = repair.generateRepairSuggestions(lowQualityFacts);

for (const suggestion of suggestions) {
  console.log(`Fact #${suggestion.factId} (score: ${suggestion.currentScore}):`);
  console.log(`  Issues: ${suggestion.issues.join(", ")}`);
  console.log(`  Suggestions: ${suggestion.suggestions.join("; ")}`);
}

// Apply repair with LLM (requires LLM call function)
const factToRepair = lowQualityFacts[0];
const repairResult = await repair.applyRepairWithLLM(factToRepair, async (prompt) => {
  // Call your LLM here
  const response = await callText({
    api: "your-api",
    model: "your-model",
    messages: [{ role: "user", content: prompt }],
  });
  return response;
});

if (repairResult.success) {
  console.log(`Improved: ${repairResult.originalText} → ${repairResult.improvedText}`);
}

// Generate repair report
const report = repair.generateRepairReport(suggestions);
console.log(report);
```

### Performance Monitoring

Track and monitor memory system performance:

```javascript
import { createPerformanceMonitor } from "./lib/memory/performance-monitor.js";

const perfMonitor = createPerformanceMonitor({
  searchTimeoutMs: 500,
  addTimeoutMs: 200,
  compileTimeoutMs: 30000,
});

// Record metrics manually
const startTime = performance.now();
const result = await factStore.searchFullText("query");
perfMonitor.recordMetric("search", performance.now() - startTime, true);

// Wrap operations for automatic tracking
const wrappedSearch = perfMonitor.wrapOperation("search", (query) => {
  return factStore.searchFullText(query);
});

const results = await wrappedSearch("user preferences");

// Get performance metrics
const searchMetrics = perfMonitor.getMetrics("search");
console.log(searchMetrics);
// {
//   operation: "search",
//   sampleCount: 10,
//   avgDuration: 45,
//   minDuration: 20,
//   maxDuration: 120,
//   p50Duration: 40,
//   p95Duration: 95,
//   successRate: 100
// }

// Get all metrics
const allMetrics = perfMonitor.getAllMetrics();

// Get alerts
const alerts = perfMonitor.getAlerts();
for (const alert of alerts) {
  console.log(`[${alert.severity}] ${alert.message}`);
}

// Generate performance report
const report = perfMonitor.generateReport();
console.log(report);
```

### Config Hot Reload

Watch configuration file for changes and reload automatically:

```javascript
import { loadConfigWithWatch, stopWatching } from "./lib/memory/config-loader.js";

// Load config with hot reload
const config = loadConfigWithWatch("/path/to/config.yaml", (configPath, newConfig) => {
  console.log(`Config reloaded: ${configPath}`);
  // Apply new config
  applyMemoryConfig(newConfig.memory);
});

// Stop watching when shutting down
stopWatching("/path/to/config.yaml");

// Or stop all watchers
import { stopAllWatching } from "./lib/memory/config-loader.js";
stopAllWatching();
```

### Vector-Based Duplicate Detection

Detect semantic duplicates using vector embeddings:

```javascript
import { createQualityScorer } from "./lib/memory/quality-scorer.js";

const scorer = createQualityScorer();

// Detect duplicates using both Jaccard and vector similarity
const newFact = { id: 1, fact: "用户喜欢在晚上喝茉莉花茶" };
const existingFacts = factStore.getAll();

const duplicates = await scorer.findPotentialDuplicatesVector(
  newFact,
  existingFacts,
  vectorEngine,      // From factStore._vectorEngine
  embeddingModel     // From factStore._embeddingModel
);

for (const dup of duplicates) {
  console.log(`Duplicate fact #${dup.factId} (similarity: ${dup.similarity}, method: ${dup.method})`);
}
```

## Performance Targets

| Scenario | Expected Performance |
|----------|---------------------|
| FTS5 search (1000 facts) | <100ms |
| Tag search (1000 facts) | <50ms |
| Batch insert (1000 facts) | <5s |
| Database size (1000 facts) | <10MB |
| Memory footprint (10k facts) | <500MB |
