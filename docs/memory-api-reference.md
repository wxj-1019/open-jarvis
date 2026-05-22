# Memory API Reference

## FactStore

The primary interface for storing and searching meta-facts.

### Constructor

```javascript
new FactStore(dbPath, opts?)
```

**Parameters:**
- `dbPath` (string): Path to the SQLite facts database file
- `opts` (object, optional):
  - `Database` (import("better-sqlite3")): Custom better-sqlite3 constructor
  - `vectorDbPath` (string): Path to vector embeddings database
  - `embeddingModel` (EmbeddingModelManager): Embedding model instance

**Example:**
```javascript
import { FactStore } from "./lib/memory/fact-store.js";
import { EmbeddingModelManager } from "./lib/memory/embedding-model.js";

const embeddingModel = new EmbeddingModelManager();
await embeddingModel.initialize();

const store = new FactStore("./agents/hana/memory/facts.db", {
  vectorDbPath: "./agents/hana/memory/vectors.db",
  embeddingModel,
});
```

### Methods

#### `add(entry)`

Adds a single meta-fact to the store.

**Parameters:**
- `entry` (object):
  - `fact` (string): The fact text
  - `tags` (string[]): Tags for retrieval
  - `time` (string, optional): Timestamp in `YYYY-MM-DDTHH:MM` format
  - `session_id` (string, optional): Source session ID

**Returns:** `{ id: number }` - The inserted fact ID

**Example:**
```javascript
const result = store.add({
  fact: "User prefers dark mode for coding",
  tags: ["preferences", "coding"],
  time: "2025-05-15T14:30",
  session_id: "abc-123",
});
console.log(result.id); // 1
```

#### `addBatch(entries)`

Adds multiple facts in a single transaction.

**Parameters:**
- `entries` (array): Array of entry objects (same format as `add`)

**Returns:** `number` - Number of facts inserted

**Example:**
```javascript
const count = store.addBatch([
  { fact: "Fact one", tags: ["a"], time: "2025-05-01T10:00" },
  { fact: "Fact two", tags: ["b"], time: "2025-05-02T10:00" },
]);
console.log(count); // 2
```

#### `searchByTags(queryTags, dateRange?, limit?)`

Searches facts by tag matching (OR logic, ordered by match count).

**Parameters:**
- `queryTags` (string[]): Tags to match
- `dateRange` (object, optional):
  - `from` (string): Start date (`YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`)
  - `to` (string): End date
- `limit` (number, default: 20): Maximum results

**Returns:** `Array<{id, fact, tags, time, session_id, created_at, matchCount}>`

**Example:**
```javascript
const results = store.searchByTags(["preferences", "coding"], {
  from: "2025-05-01",
  to: "2025-05-31",
}, 10);
```

#### `searchFullText(query, limit?)`

Performs FTS5 full-text search with CJK ngram support.

**Parameters:**
- `query` (string): Search query
- `limit` (number, default: 20): Maximum results

**Returns:** `Array<{id, fact, tags, time, session_id, created_at}>`

**Example:**
```javascript
const results = store.searchFullText("memory system architecture");
```

#### `searchWithVectors(query, limit?, dateRange?)`

Hybrid search combining vector similarity and FTS5 results.

**Parameters:**
- `query` (string): Search query
- `limit` (number, default: 20): Maximum results
- `dateRange` (object, optional): Date range filter

**Returns:** `Promise<Array<{id, fact, tags, time, session_id, created_at, hybridScore, vectorScore?, ftsScore?}>>`

**Example:**
```javascript
const results = await store.searchWithVectors("user programming preferences", 10);
console.log(results[0].hybridScore); // 0.85
```

#### `getById(id)`

Retrieves a single fact by ID.

**Parameters:**
- `id` (number): Fact ID

**Returns:** Fact object or `null`

#### `getBySession(sessionId)`

Retrieves all facts from a specific session.

**Parameters:**
- `sessionId` (string): Session ID

**Returns:** `Array<{id, fact, tags, time, session_id, created_at}>`

#### `getAll()`

Retrieves all facts ordered by time descending.

**Returns:** `Array<{id, fact, tags, time, session_id, created_at}>`

#### `delete(id)`

Deletes a single fact.

**Parameters:**
- `id` (number): Fact ID

**Returns:** `boolean` - True if deleted

#### `clearAll()`

Deletes all facts and rebuilds FTS index.

#### `exportAll()`

Exports all facts (without internal fields) for API usage.

**Returns:** `Array<{id, fact, tags, time, session_id, created_at}>`

#### `importAll(entries)`

Imports facts from exported data.

**Parameters:**
- `entries` (array): Array of fact objects

#### `close()`

Closes database connections.

### Properties

#### `size`

Returns the total number of facts in the store.

**Type:** `number`

---

## VectorSearchEngine

Vector-based semantic search engine using cosine similarity.

### Constructor

```javascript
new VectorSearchEngine(dbPath, opts?)
```

**Parameters:**
- `dbPath` (string): Path to vector embeddings database
- `opts` (object, optional):
  - `Database` (import("better-sqlite3")): Custom better-sqlite3 constructor
  - `dimension` (number, default: 384): Embedding dimension

### Methods

#### `storeEmbedding(factId, embedding, metadata?)`

Stores an embedding for a fact.

**Parameters:**
- `factId` (number): Fact ID from FactStore
- `embedding` (Float32Array): Embedding vector
- `metadata` (object, optional):
  - `time` (string): Timestamp

**Throws:** Error on dimension mismatch

#### `deleteEmbedding(factId)`

Deletes an embedding.

**Parameters:**
- `factId` (number): Fact ID

#### `searchByVector(queryEmbedding, limit?, dateRange?)`

Searches by vector similarity.

**Parameters:**
- `queryEmbedding` (Float32Array): Query embedding
- `limit` (number, default: 20): Maximum results
- `dateRange` (object, optional): Date range filter

**Returns:** `Array<{factId, vectorScore, time?}>`

#### `hybridSearch(queryEmbedding, ftsResults, limit?, opts?)`

Combines vector and FTS results with weighted scoring.

**Parameters:**
- `queryEmbedding` (Float32Array): Query embedding
- `ftsResults` (array): FTS results with `{id, rank}`
- `limit` (number, default: 20): Maximum results
- `opts` (object, optional):
  - `vectorWeight` (number, default: 0.6)
  - `ftsWeight` (number, default: 0.4)
  - `dateRange` (object)

**Returns:** `Array<{factId, hybridScore, vectorScore, ftsScore}>`

#### `getEmbeddingCount()`

Returns total number of stored embeddings.

**Returns:** `number`

#### `hasEmbedding(factId)`

Checks if a fact has an embedding.

**Parameters:**
- `factId` (number): Fact ID

**Returns:** `boolean`

#### `close()`

Closes database connection.

### Properties

#### `dimension`

Returns the embedding dimension.

**Type:** `number`

---

## EmbeddingModelManager

Manages embedding model loading and inference.

### Constructor

```javascript
new EmbeddingModelManager(opts?)
```

**Parameters:**
- `opts` (object, optional):
  - `modelId` (string, default: "Xenova/all-MiniLM-L6-v2"): Local model ID
  - `dimension` (number, default: 384): Embedding dimension
  - `remoteApiUrl` (string): Remote embedding API URL
  - `remoteApiKey` (string): Remote API key
  - `forceRemote` (boolean): Always use remote API

### Methods

#### `initialize()`

Loads the embedding model (local or remote).

**Returns:** `Promise<void>`

#### `getEmbedding(text)`

Gets embedding for a single text.

**Parameters:**
- `text` (string): Input text

**Returns:** `Promise<Float32Array|null>`

#### `getEmbeddings(texts)`

Gets embeddings for multiple texts (batch).

**Parameters:**
- `texts` (string[]): Input texts

**Returns:** `Promise<Array<Float32Array|null>>`

#### `close()`

Disposes the model pipeline.

### Properties

#### `isAvailable`

Whether the embedding model is loaded and ready.

**Type:** `boolean`

#### `dimension`

Embedding dimension.

**Type:** `number`

---

## Memory Ticker

The scheduler that orchestrates the memory pipeline.

### `createMemoryTicker(opts)`

Creates a memory ticker instance.

**Parameters:**
- `opts` (object):
  - `summaryManager` (SessionSummaryManager): Summary manager instance
  - `configPath` (string): Config file path
  - `factStore` (FactStore): Fact store instance
  - `getResolvedMemoryModel` (function): Returns `{model, api, api_key, base_url}`
  - `onCompiled` (function, optional): Callback when memory.md updates
  - `sessionDir` (string): Session directory path
  - `memoryMdPath` (string): Path to memory.md
  - `todayMdPath` (string): Path to today.md
  - `weekMdPath` (string): Path to week.md
  - `longtermMdPath` (string): Path to longterm.md
  - `factsMdPath` (string): Path to facts.md
  - `getMemoryMasterEnabled` (function, optional): Returns memory master switch state
  - `isSessionMemoryEnabled` (function, optional): Returns per-session memory state
  - `getTimezone` (function, optional): Returns user timezone

### Methods

#### `start()`

Starts the hourly date check timer.

#### `stop()`

Stops the ticker and waits for in-flight operations.

**Returns:** `Promise<void>`

#### `tick()`

Manually triggers a full compilation (for debugging/startup).

**Returns:** `Promise<void>`

#### `triggerNow()`

Non-blocking version of `tick()`.

#### `notifyTurn(sessionPath)`

Called after each conversation turn.

**Parameters:**
- `sessionPath` (string): Path to session .jsonl file

#### `notifySessionEnd(sessionPath)`

Called before session switch/dispose (final pass).

**Parameters:**
- `sessionPath` (string): Path to session .jsonl file

**Returns:** `Promise<void>`

#### `notifyPromoted(sessionPath)`

Called after session promotion (heartbeat/cron sessions).

**Parameters:**
- `sessionPath` (string): Path to promoted session file

**Returns:** `Promise<void>`

#### `flushSession(sessionPath)`

Forces a summary refresh for a session.

**Parameters:**
- `sessionPath` (string): Path to session file

**Returns:** `Promise<void>`

#### `flushSessionAndCompile(sessionPath)`

Forces summary refresh and immediate memory.md assembly.

**Parameters:**
- `sessionPath` (string): Path to session file

**Returns:** `Promise<void>`

#### `getHealthStatus()`

Returns health status for each compilation step.

**Returns:** `Record<string, { lastSuccessAt, lastErrorAt, lastErrorMsg, failCount }>`

---

## Session Summary Manager

Manages per-session summary files.

### Constructor

```javascript
new SessionSummaryManager(summariesDir)
```

**Parameters:**
- `summariesDir` (string): Path to summaries directory

### Methods

#### `getSummary(sessionId)`

Gets summary for a session.

**Parameters:**
- `sessionId` (string): Session ID

**Returns:** Summary object or `null`

#### `saveSummary(sessionId, data)`

Saves a summary.

**Parameters:**
- `sessionId` (string): Session ID
- `data` (object): Summary data

#### `rollingSummary(sessionId, messages, resolvedModel, opts?)`

Updates summary with new messages.

**Parameters:**
- `sessionId` (string): Session ID
- `messages` (array): New messages
- `resolvedModel` (object): Model configuration
- `opts` (object, optional):
  - `resetAt` (string): Compiled reset timestamp
  - `timeZone` (string): User timezone

**Returns:** `Promise<void>`

#### `getDirtySessions(opts?)`

Gets sessions where summary differs from snapshot.

**Parameters:**
- `opts` (object, optional):
  - `since` (string): Only sessions after this date

**Returns:** `Array<{session_id, summary, snapshot, snapshot_at, updated_at}>`

#### `markProcessed(sessionId)`

Marks session as processed (snapshot = summary).

**Parameters:**
- `sessionId` (string): Session ID

#### `getSummariesInRange(from, to, opts?)`

Gets summaries in a date range.

**Parameters:**
- `from` (Date): Start date
- `to` (Date): End date
- `opts` (object, optional):
  - `since` (string): Only summaries after this date

**Returns:** `Array<{session_id, summary, updated_at}>`

#### `clearCache()`

Clears the summary cache.

---

## Compile Functions

### `compileToday(summaryManager, outputPath, resolvedModel, opts?)`

Compiles today's session summaries into today.md.

**Parameters:**
- `summaryManager` (SessionSummaryManager)
- `outputPath` (string): Path to today.md
- `resolvedModel` (object): Model configuration
- `opts` (object, optional):
  - `since` (string): Only sessions after this date

**Returns:** `Promise<"compiled"|"skipped">`

### `compileWeek(summaryManager, outputPath, resolvedModel, opts?)`

Compiles 7-day sliding window into week.md.

**Parameters:** Same as `compileToday`

**Returns:** `Promise<"compiled"|"skipped">`

### `compileLongterm(weekMdPath, longtermPath, resolvedModel)`

Folds week.md into longterm.md.

**Parameters:**
- `weekMdPath` (string): Path to week.md
- `longtermPath` (string): Path to longterm.md
- `resolvedModel` (object): Model configuration

**Returns:** `Promise<"compiled"|"skipped">`

### `compileFacts(summaryManager, outputPath, resolvedModel, opts?)`

Compiles Key Facts sections into facts.md.

**Parameters:**
- `summaryManager` (SessionSummaryManager)
- `outputPath` (string): Path to facts.md
- `resolvedModel` (object): Model configuration
- `opts` (object, optional):
  - `since` (string): Only sessions after this date

**Returns:** `Promise<"compiled"|"skipped">`

### `assemble(factsPath, todayPath, weekPath, longtermPath, memoryMdPath)`

Assembles four intermediate files into memory.md.

**Parameters:**
- `factsPath` (string): Path to facts.md
- `todayPath` (string): Path to today.md
- `weekPath` (string): Path to week.md
- `longtermPath` (string): Path to longterm.md
- `memoryMdPath` (string): Output path for memory.md

---

## Compile Retry Manager

### `createCompileRetryManager(opts)`

Creates a retry manager for compilation steps.

**Parameters:**
- `opts` (object):
  - `logger` (object): Logger with `info`, `warn`, `error` methods
  - `loadCache` (function): `(stepName) => Promise<{result, timestamp}|null>`
  - `saveCache` (function): `(stepName, result) => Promise<void>`

### Methods

#### `executeWithRetry(fn, stepName, opts?)`

Executes a function with retry logic.

**Parameters:**
- `fn` (function): Async function to execute
- `stepName` (string): Step name for logging/caching
- `opts` (object, optional):
  - `degrade` (boolean): Enable degradation to cached result

**Returns:** `Promise<any>`

### `isResponseValid(response)`

Validates a compilation response.

**Parameters:**
- `response` (any): Response to validate

**Returns:** `boolean`

---

## Deep Memory

### `processDirtySessions(summaryManager, factStore, resolvedModel, opts?)`

Processes dirty sessions to extract new facts.

**Parameters:**
- `summaryManager` (SessionSummaryManager)
- `factStore` (FactStore)
- `resolvedModel` (object): Model configuration
- `opts` (object, optional):
  - `since` (string): Only sessions after this date
  - `timeZone` (string): User timezone
  - `getSourceTimeRange` (function): `(sessionId) => Promise<{start, end}|null>`

**Returns:** `Promise<{processed: number, factsAdded: number}>`

---

## Forgetting Curve Engine

Models memory decay over time with configurable schedule points.

### Constructor

```javascript
new ForgettingCurveEngine(dbPath, config)
```

**Parameters:**
- `dbPath` (string): Path to facts database
- `config` (object):
  - `enabled` (boolean): Enable forgetting curve
  - `schedule` (Array<{days: number, retentionRate: number}>, optional): Decay schedule points
  - `archiveThreshold` (number, 0-1, default: 0.25): Retention threshold for archival
  - `protectedTags` (string[], optional): Tags that prevent archival

### Methods

#### `calculateRetention(ageDays)`

Calculates base retention rate for a given age.

**Parameters:**
- `ageDays` (number): Age in days

**Returns:** `number` - Retention rate (0-1)

#### `calculateRetentionWithReinforcement(ageDays, importance, hitCount)`

Calculates retention with importance and access count boosts.

**Parameters:**
- `ageDays` (number): Age in days
- `importance` (number, 0-1): Importance level
- `hitCount` (number): Access count

**Returns:** `number` - Retention rate (0-1)

#### `evaluateForgetting()`

Evaluates all facts for forgetting candidates.

**Returns:** `{toArchive: Array, healthy: Array, protected: Array}`

#### `recordAccess(factId)`

Records a memory access (increments hit count).

**Parameters:**
- `factId` (number): Fact ID

#### `setImportance(factId, importance)`

Sets importance for a fact.

**Parameters:**
- `factId` (number): Fact ID
- `importance` (number, 0-1): Importance level

#### `updateConfig(newConfig)`

Updates configuration dynamically.

**Parameters:**
- `newConfig` (object): Partial config object

#### `close()`

Closes database connection.

---

## Memory Archive Manager

Manages archived memories with export/import support.

### Constructor

```javascript
new MemoryArchiveManager(archivePath)
```

**Parameters:**
- `archivePath` (string): Path to archive database

### Methods

#### `archiveFact(fact, reason?)`

Archives a single fact.

**Parameters:**
- `fact` (object): Fact with `{id, fact, tags, time, session_id, created_at, hit_count, importance}`
- `reason` (string, default: "decay_below_threshold"): Archive reason

#### `archiveBatch(facts, reason?)`

Archives multiple facts in a transaction.

**Parameters:**
- `facts` (array): Array of fact objects
- `reason` (string): Archive reason

**Returns:** `number` - Number of facts archived

#### `getAll()`

Gets all archived facts.

**Returns:** `Array<{original_id, fact, tags, time, session_id, created_at, archived_at, reason, hit_count, importance}>`

#### `getCount()`

Gets count of archived facts.

**Returns:** `number`

#### `searchByFact(query)`

Searches archived facts by content.

**Parameters:**
- `query` (string): Search query

**Returns:** `Array<object>`

#### `searchByTags(queryTags)`

Searches archived facts by tags.

**Parameters:**
- `queryTags` (string[]): Tags to match

**Returns:** `Array<object>`

#### `searchBySession(sessionId)`

Searches archived facts by session.

**Parameters:**
- `sessionId` (string): Session ID

**Returns:** `Array<object>`

#### `restoreFact(originalId)`

Restores a fact from archive.

**Parameters:**
- `originalId` (number): Original fact ID

**Returns:** `object|null` - Restored fact or null

#### `restoreBatch(originalIds)`

Restores multiple facts.

**Parameters:**
- `originalIds` (number[]): Array of fact IDs

**Returns:** `Array<object>` - Restored facts

#### `exportAll()`

Exports all archived facts as JSON.

**Returns:** `string` - JSON string

#### `importAll(jsonData)`

Imports archived facts from JSON.

**Parameters:**
- `jsonData` (string): JSON string

**Returns:** `number` - Number of facts imported

#### `cleanupOldArchives(daysOld)`

Removes archives older than specified days.

**Parameters:**
- `daysOld` (number): Age threshold

**Returns:** `number` - Number of facts removed

#### `deleteFact(originalId)`

Deletes a specific archived fact.

**Parameters:**
- `originalId` (number): Original fact ID

**Returns:** `boolean`

#### `clearAll()`

Clears all archived facts.

#### `close()`

Closes database connection.

---

## Quality Scorer

Scores memory quality across five dimensions.

### `createQualityScorer(config)`

Creates a quality scorer instance.

**Parameters:**
- `config` (object, optional):
  - `weights` (object, optional): Scoring weights
  - `minQualityThreshold` (number, default: 40): Minimum quality threshold
  - `duplicateSimilarityThreshold` (number, default: 0.6): Duplicate detection threshold

**Returns:** Quality scorer object

### Methods

#### `score(fact, allFacts)`

Scores a single fact.

**Parameters:**
- `fact` (object): Fact to score
- `allFacts` (array): All facts for consistency check

**Returns:** `{factId, specificity, recency, relevance, consistency, usage, composite, isLowQuality, tier}`

#### `scoreBatch(facts)`

Scores multiple facts.

**Parameters:**
- `facts` (array): Facts to score

**Returns:** `Array<object>` - Scored facts

#### `findPotentialDuplicates(fact, existingFacts)`

Finds potential duplicate facts.

**Parameters:**
- `fact` (object): Fact to check
- `existingFacts` (array): Existing facts to compare against

**Returns:** `Array<{factId, similarity}>`

#### `getMinQualityThreshold()`

Gets minimum quality threshold.

**Returns:** `number`

### Standalone Scoring Functions

#### `scoreSpecificity(factText)`

Scores fact specificity (0-100).

**Parameters:**
- `factText` (string): Fact text

**Returns:** `number` - Specificity score

#### `scoreRecency(timestamp, referenceTime?)`

Scores recency using exponential decay (90-day half-life).

**Parameters:**
- `timestamp` (string): Fact timestamp
- `referenceTime` (number, optional): Reference time (default: now)

**Returns:** `number` - Recency score (0-100)

#### `scoreRelevance(fact, userTags?)`

Scores relevance based on tag weights.

**Parameters:**
- `fact` (object): Fact with tags
- `userTags` (string[], optional): User tags for matching

**Returns:** `number` - Relevance score (0-100)

#### `scoreConsistency(fact, allFacts)`

Scores consistency by detecting conflicts.

**Parameters:**
- `fact` (object): Fact to check
- `allFacts` (array): All facts for comparison

**Returns:** `number` - Consistency score (0-100)

#### `scoreUsage(accessCount)`

Scores usage with exponential saturation.

**Parameters:**
- `accessCount` (number): Access count

**Returns:** `number` - Usage score (0-100)

#### `computeCompositeScore(dimensions, weights?)`

Computes weighted composite score.

**Parameters:**
- `dimensions` (object): `{specificity, recency, relevance, consistency, usage}`
- `weights` (object, optional): Custom weights

**Returns:** `number` - Composite score (0-100)

---

## Quality Monitor

Monitors memory quality health and generates alerts.

### `createQualityMonitor(config)`

Creates a quality monitor instance.

**Parameters:**
- `config` (object, optional):
  - `minQualityThreshold` (number, default: 40): Minimum quality threshold
  - `alertThreshold` (number, default: 0.3): Alert trigger ratio
  - `scoringWeights` (object, optional): Custom scoring weights
  - `autoCleanupEnabled` (boolean, default: false): Enable auto cleanup
  - `autoCleanupThreshold` (number, default: 15): Cleanup quality threshold
  - `autoCleanupAgeDays` (number, default: 365): Cleanup age threshold
  - `stalenessThresholdDays` (number, default: 180): Staleness threshold

**Returns:** Quality monitor object

### Methods

#### `recordMetrics(factId, scores)`

Records metrics for a fact.

**Parameters:**
- `factId` (number): Fact ID
- `scores` (object): Score object from scorer

#### `recordMetricsForFact(fact, allFacts)`

Records metrics by scoring a fact.

**Parameters:**
- `fact` (object): Fact to score
- `allFacts` (array): All facts

**Returns:** `object` - Score result

#### `getHealthStatus()`

Gets overall health status.

**Returns:** `{totalMemories, averageQuality, qualityHealth, tierDistribution, alertCount}`

#### `getAlerts()`

Gets current alerts.

**Returns:** `Array<{type, message, severity, timestamp, count}>`

#### `clearAlerts()`

Clears all alerts.

#### `exportReport()`

Exports comprehensive quality report.

**Returns:** `{generatedAt, totalMemories, averageQuality, qualityHealth, tierDistribution, lowQualityCount, alerts, mergeSuggestions, staleMemories, recommendations}`

#### `identifyLowQuality()`

Identifies low quality memories.

**Returns:** `Array<{factId, composite, reason}>`

#### `suggestMerges(facts)`

Suggests merge candidates.

**Parameters:**
- `facts` (array): Facts to compare

**Returns:** `Array<{factId1, factId2, similarity, suggestedAction}>`

#### `identifyNeedsUpdate()`

Identifies stale memories needing update.

**Returns:** `Array<{factId, composite, recency, reason}>`

#### `processFacts(facts)`

Processes facts with scoring and alerts.

**Parameters:**
- `facts` (array): Facts to process

**Returns:** `{scoredFacts, alerts, lowQualityFacts, healthStatus}`

#### `identifyCleanupCandidates()`

Identifies cleanup candidates.

**Returns:** `Array<{factId, composite, recency, reason}>`

#### `getScorer()`

Gets underlying scorer.

**Returns:** Quality scorer object

---

## FTS5 Optimizer
