# Memory System Architecture

## Overview

The OpenJarvis memory system is a multi-layered architecture designed to maintain a persistent, evolving understanding of the user. It combines session-level summarization, compiled memory documents, and a fact-based archival system with both full-text and semantic search capabilities.

## System Layers

```
┌─────────────────────────────────────────────────────────────┐
│                     Memory Ticker (Scheduler)                │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ Turn-based  │  │ Session-end  │  │ Daily maintenance  │  │
│  │ (every 10)  │  │ final pass   │  │ (date change)      │  │
│  └──────┬──────┘  └──────┬───────┘  └────────┬───────────┘  │
└─────────┼────────────────┼────────────────────┼──────────────┘
          │                │                    │
          ▼                ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                   Compilation Pipeline                       │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ Rolling     │  │ compileToday │  │ compileWeek        │  │
│  │ Summary     │  │ (daily)      │  │ (7-day sliding)    │  │
│  └─────────────┘  └──────────────┘  └────────────────────┘  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │compileFacts │  │compileLongterm│  │ assemble()         │  │
│  │ (30-day)    │  │ (fold weekly) │  │ (merge to memory)  │  │
│  └─────────────┘  └──────────────┘  └────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
          │                                    │
          ▼                                    ▼
┌─────────────────────┐          ┌─────────────────────────────┐
│   Deep Memory       │          │   Compiled Memory Files     │
│  (Fact Extraction)  │          │  ┌───────────────────────┐  │
│                     │          │  │ memory.md (assembled) │  │
│  ┌───────────────┐  │          │  │ today.md              │  │
│  │ Diff analysis │  │          │  │ week.md               │  │
│  │ LLM splitting │  │          │  │ longterm.md           │  │
│  │ Fact Store    │  │          │  │ facts.md              │  │
│  └───────────────┘  │          │  └───────────────────────┘  │
└──────────┬──────────┘          └─────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│              Memory Lifecycle Management (v4)                │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Quality      │  │ Forgetting   │  │ FTS5 Optimizer    │  │
│  │ Scorer       │  │ Curve        │  │ (reranking, fuzzy)│  │
│  │ (5-dimension)│  │ (Ebbinghaus) │  │                   │  │
│  └──────────────┘  └──────┬───────┘  └───────────────────┘  │
│                           │                                  │
│                           ▼                                  │
│                  ┌──────────────────┐                        │
│                  │ Memory Archive   │                        │
│                  │ (export/import)  │                        │
│                  └──────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Archival Layer (Fact Store)               │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ FTS5 Engine  │  │ Vector Search│  │ Tag-based Search  │  │
│  │ (full-text)  │  │ (semantic)   │  │ (exact match)     │  │
│  └──────────────┘  └──────────────┘  └───────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           Hybrid Search (Vector + FTS)                │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Memory Ticker (`lib/memory/memory-ticker.js`)

The memory scheduler orchestrates the entire memory pipeline. It operates on three trigger mechanisms:

- **Turn-based**: Every 10 conversation turns, triggers rolling summary + compileToday
- **Session-end**: When a session closes, runs final summary pass
- **Daily maintenance**: When date changes (detected hourly), runs full compilation pipeline

Key responsibilities:
- Tracks turn counts per session
- Manages step health status for UI/monitoring
- Handles error deduplication to prevent log spam
- Supports breakpoint resume for daily tasks

### 2. Session Summary Manager (`lib/memory/session-summary.js`)

Maintains per-session JSON summary files with:
- **Rolling summary**: Continuously updated conversation digest
- **Snapshot**: Point-in-time copy for dirty-session detection
- **Dirty session tracking**: Identifies sessions needing fact extraction

### 3. Compilation Pipeline (`lib/memory/compile.js`)

Four independent compilation steps, each with fingerprint caching:

| Step | Input | Output | Frequency |
|------|-------|--------|-----------|
| `compileToday` | Today's session summaries | `today.md` | Every 10 turns / session-end |
| `compileWeek` | 7-day sliding window | `week.md` | Daily |
| `compileLongterm` | `week.md` + previous `longterm.md` | `longterm.md` | Daily |
| `compileFacts` | 30-day Key Facts sections | `facts.md` | Daily |
| `assemble` | All four `.md` files | `memory.md` | After each compilation |

#### Compile Retry (`lib/memory/compile-retry.js`)

Each compilation step uses exponential backoff retry:
- Max 3 attempts per step
- Backoff: 2s → 4s → 8s
- Validates responses (rejects empty/malformed)
- Degrades to cached result if available (< 24h old)

### 4. Deep Memory (`lib/memory/deep-memory.js`)

Extracts atomic facts from session summaries:
- Runs daily on "dirty" sessions (summary ≠ snapshot)
- Uses LLM to split summaries into atomic facts with tags
- Handles time context extraction for factual timestamps
- Processes sessions in batches (max 3 concurrent)
- Tracks failure counts with TTL-based expiration

### 5. Fact Store (`lib/memory/fact-store.js`)

The archival layer storing meta-facts with SQLite + FTS5:

**Schema:**
```sql
CREATE TABLE facts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  fact        TEXT NOT NULL,
  search_text TEXT NOT NULL DEFAULT '',
  tags        TEXT NOT NULL DEFAULT '[]',
  time        TEXT,
  session_id  TEXT,
  created_at  TEXT NOT NULL
);

CREATE VIRTUAL TABLE facts_fts USING fts5(
  fact,
  search_text,
  content=facts,
  content_rowid=id,
  tokenize='unicode61'
);
```

**Search Methods:**
- `searchByTags()` - Exact tag matching with OR logic, ordered by match count
- `searchFullText()` - FTS5 full-text search with CJK ngram support
- `searchWithVectors()` - Hybrid search combining vector + FTS scores

**CJK Support:**
- Generates 2-gram and 3-gram tokens for Chinese/Japanese/Korean text
- Combines lexical tokens with ngrams for comprehensive search coverage
- LIKE fallback for FTS5 syntax errors

### 6. Vector Search Engine (`lib/memory/vector-search.js`)

Semantic search using cosine similarity:

- Stores embeddings in separate SQLite database
- Custom `cosine_similarity` SQL function
- Hybrid search combining vector scores with FTS5 rank
- Configurable weights (default: vector 0.6, FTS 0.4)

### 7. Embedding Model Manager (`lib/memory/embedding-model.js`)

Manages embedding model loading:
- Local model via `@xenova/transformers`
- Remote API fallback
- Batch embedding support
- Configurable dimension (default: 384)

### 8. Quality Scorer (`lib/memory/quality-scorer.js`)

Evaluates memory quality across five dimensions:

**Scoring Dimensions:**
- **Specificity (25%)**: How detailed and concrete the memory is
- **Recency (20%)**: How recent (90-day exponential decay half-life)
- **Relevance (25%)**: Relevance to user model (identity > preference > interest)
- **Consistency (15%)**: Consistency with other memories (conflict detection)
- **Usage (15%)**: How frequently accessed (exponential saturation)

**Features:**
- Composite score calculation (0-100)
- Quality tier classification: excellent (80+), good (60+), fair (40+), poor (<40)
- Duplicate detection via Jaccard similarity (threshold ≥0.6)
- Low-quality memory flagging for review

### 9. Quality Monitor (`lib/memory/quality-monitor.js`)

Monitors memory health and generates alerts:

**Features:**
- Real-time quality tracking
- Alert generation when quality degrades below threshold
- Merge suggestions for duplicate memories
- Stale memory identification (180+ days old)
- Comprehensive report export
- Optional auto-cleanup of low-quality old memories

### 10. Forgetting Curve Engine (`lib/memory/forgetting-curve.js`)

Models memory decay using Ebbinghaus forgetting curve:

**Default Schedule:**
- 1 day: 50% retention
- 3 days: 30% retention
- 7 days: 20% retention
- 30 days: 10% retention

**Features:**
- Configurable decay schedule
- Importance boost (0-1 scale)
- Hit count reinforcement (access count increases retention)
- Protected tags (never forget certain memory types)
- Evaluates memories during daily compilation

### 11. Memory Archive Manager (`lib/memory/memory-archive.js`)

Manages archived memories with full lifecycle support:

**Features:**
- Archive facts below retention threshold
- Search archived memories (by fact, tags, session)
- Restore individual or batch of archived facts
- Export/import archived memories as JSON
- Cleanup old archives (configurable age threshold)
- Separate database to avoid bloating main facts database

### 12. FTS5 Optimizer (`lib/memory/fts5-optimizer.js`)

Enhances FTS5 search with advanced features:

**Features:**
- BM25 parameter tuning (k1, b)
- Multi-factor reranking (FTS + recency + tag relevance)
- CJK 4-gram tokenization (improved Chinese/Japanese/Korean)
- Query expansion via synonym mapping
- Fuzzy matching with edit distance tolerance
- Custom column weights (fact vs search_text)

## Memory Search Flow

```
User Query → search_memory tool
                │
                ▼
    ┌───────────────────────┐
    │  searchWithVectors()  │
    └───────────┬───────────┘
                │
        ┌───────┴───────┐
        │               │
        ▼               ▼
    FTS5 Search    Vector Search
        │               │
        └───────┬───────┘
                │
                ▼
    ┌───────────────────────┐
    │  Hybrid Scoring       │
    │  score = v*0.6 + f*0.4│
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────────┐
    │  Date Range Filter    │
    └───────────┬───────────┘
                │
                ▼
    Return top-N results
```

## Data Flow Diagram

```
Session Messages
      │
      ▼ (every 10 turns)
┌─────────────┐
│Rolling Summary│
└──────┬──────┘
       │
       ▼ (session end)
┌─────────────┐     ┌──────────────┐
│ compileToday│────▶│   assemble() │────▶ memory.md
└─────────────┘     └──────────────┘
       │
       ▼ (daily)
┌──────────────┐  ┌─────────────────┐  ┌──────────────┐
│ compileWeek  │─▶│compileLongterm  │  │ compileFacts │
└──────────────┘  └─────────────────┘  └──────┬───────┘
       │                                      │
       ▼                                      ▼
┌──────────────────────────────────────────────────────────┐
│                    assemble()                             │
│  memory.md = facts + today + week + longterm              │
└──────────────────────────────────────────────────────────┘
       │
       ▼ (daily - deep memory)
┌─────────────────────┐
│  processDirtySessions│
│  → extractFacts      │
│  → FactStore.addBatch│
└──────────┬──────────┘
           │
           ▼
    ┌──────────────┐
    │  facts.db    │
    │  vectors.db  │
    └──────────────┘
```

## Configuration

Memory system behavior is controlled via `config.yaml`:

```yaml
memory:
  enabled: true                    # Master switch
  model: "utility-model-ref"       # Model for compilation/fact extraction
  summary_model: "utility-model-ref"  # Model for rolling summaries
  embedding:
    local: true                    # Use local embedding model
    remote_api_url: ""             # Remote embedding API URL
    remote_api_key: ""             # Remote embedding API key
    force_remote: false            # Always use remote
```

## Performance Characteristics

| Metric | Target | Notes |
|--------|--------|-------|
| FTS5 search latency | <100ms | For 1000 facts |
| Tag search latency | <50ms | For 1000 facts |
| Batch insertion | <5s | For 1000 facts |
| Database size | <10MB | For 1000 facts |
| Memory footprint | <500MB | For 10k facts |

## Testing

Integration tests are located in `tests/integration/memory-pipeline.test.js` and performance benchmarks in `tests/performance/memory-benchmarks.test.js`.

Run tests with:
```bash
npm test -- tests/integration/memory-pipeline.test.js
npm test -- tests/performance/memory-benchmarks.test.js
```
