# Memory System Migration Guide

## Overview

This guide covers migrating between memory system versions:
- **v1**: Original SQLite + sqlite-vec based memory
- **v2**: Tag-based retrieval + FTS5 (no vectors)
- **v3**: Current system with vector search, compilation pipeline, and fact store

## Version History

| Version | Key Features | Storage | Search | Quality | Forgetting |
|---------|-------------|---------|--------|---------|------------|
| v1 | Embedding KNN + hybrid ranking | SQLite + sqlite-vec | Vector + keyword | None | None |
| v2 | Tag matching + FTS5 | SQLite + FTS5 | Tag + full-text | None | None |
| v3 | Vector search + FTS5 hybrid + compilation pipeline | SQLite + FTS5 + vector DB | Hybrid (vector + FTS + tag) | None | None |
| v4 | Quality scoring + forgetting curve + FTS5 optimization | SQLite + FTS5 + vector DB + archive DB | Hybrid + reranking + fuzzy | 5-dimension scoring | Ebbinghaus curve |

## Migrating v1 → v2

v2 removed vector-based storage in favor of tag-based retrieval.

### What Changes

- **Removed**: `sqlite-vec` extension, embedding storage, KNN search
- **Added**: FTS5 full-text search, tag-based retrieval, session summaries
- **Data migration**: Existing facts are preserved, embeddings are dropped

### Migration Steps

1. **Backup your data**
   ```bash
   cp -r agents/hana/memory agents/hana/memory.backup
   ```

2. **Stop the application**

3. **Delete old vector extension data** (automatic on first run)
   - The `facts.db` schema will be automatically migrated
   - `sqlite-vec` related tables will be ignored

4. **Start the application**
   - v2 schema migration runs automatically
   - Session summaries will be rebuilt from existing sessions

5. **Verify migration**
   ```bash
   # Check facts are preserved
   sqlite3 agents/hana/memory/facts.db "SELECT COUNT(*) FROM facts;"
   ```

### Data Loss

- **Lost**: Vector embeddings (will be regenerated if vector search is re-enabled in v3)
- **Preserved**: All facts, tags, timestamps

---

## Migrating v2 → v3

v3 adds vector search, a multi-stage compilation pipeline, and improved fact extraction.

### What Changes

- **Added**: Vector search engine, embedding model, compilation pipeline
- **Added**: `search_text` column for CJK-optimized FTS5
- **Added**: Schema version tracking (`user_version`)
- **Enhanced**: Fact extraction with time context awareness

### Migration Steps

1. **Backup your data**
   ```bash
   cp -r agents/hana/memory agents/hana/memory.backup
   ```

2. **Stop the application**

3. **Start the application**
   - v3 migration runs automatically on startup
   - The `search_text` column will be added to `facts` table
   - FTS5 table will be rebuilt with dual-column schema
   - Schema version will be updated to 2

4. **Trigger initial compilation**
   ```javascript
   // Via memory ticker (automatic on startup)
   // Or manually:
   memoryTicker.tick();
   ```

5. **Verify migration**
   ```bash
   # Check schema version
   sqlite3 agents/hana/memory/facts.db "PRAGMA user_version;"
   # Should return: 2

   # Check search_text column exists
   sqlite3 agents/hana/memory/facts.db "PRAGMA table_info(facts);"

   # Check FTS5 table structure
   sqlite3 agents/hana/memory/facts.db "PRAGMA table_info(facts_fts);"
   ```

### Automatic Migration

The FactStore handles migration automatically:

```javascript
// In fact-store.js _migrate()
_migrate() {
  const current = this.db.pragma("user_version", { simple: true });
  if (current >= SCHEMA_VERSION) return;  // Already up to date

  this.db.transaction(() => {
    let v = current;
    while (v < SCHEMA_VERSION) {
      switch (v) {
        case 0: break;  // v0 → v1: initial schema marker
        case 1: this._migrateToSearchText(); break;  // v1 → v2
      }
      v++;
    }
    this.db.pragma(`user_version = ${SCHEMA_VERSION}`);
  })();
}
```

### New Features After Migration

1. **Vector Search**: Enable by configuring embedding model in `config.yaml`
2. **Hybrid Search**: Automatic fallback from vector → FTS → LIKE
3. **CJK Search**: Improved Chinese/Japanese/Korean search with ngram tokens
4. **Compilation Pipeline**: Automatic memory compilation (today/week/longterm/facts)

---

## Migrating v3 → v4

v4 adds quality scoring, forgetting curve with archival, and FTS5 search optimizations.

### What Changes

- **Added**: Quality scorer (`quality-scorer.js`) with 5-dimension evaluation
- **Added**: Forgetting curve engine (`forgetting-curve.js`) with Ebbinghaus model
- **Added**: Memory archive manager (`memory-archive.js`) for archived facts
- **Added**: FTS5 optimizer (`fts5-optimizer.js`) with reranking and fuzzy matching
- **Added**: New database tables: `memory_archive`, quality metrics tracking
- **Enhanced**: Fact store with `hit_count`, `importance`, quality score fields
- **Enhanced**: Configuration with `forgetting_curve`, `quality`, `search` sections

### Migration Steps

1. **Backup your data**
   ```bash
   cp -r agents/hana/memory agents/hana/memory.backup
   ```

2. **Stop the application**

3. **Update configuration**
   
   Add new sections to `config.yaml`:
   
   ```yaml
   memory:
     forgetting_curve:
       enabled: false  # Start disabled, enable after testing
       archive_threshold: 0.25
       protected_tags:
         - "important"
     quality:
       enabled: true   # Enable quality scoring
       min_threshold: 40
     search:
       fts5_optimizer:
         synonym_map: {}  # Add synonyms as needed
   ```

4. **Start the application**
   - v4 migration runs automatically on startup
   - New columns added to `facts` table: `hit_count`, `importance`
   - `memory-archive.db` created for archived facts
   - Quality metrics initialized

5. **Initial quality evaluation**
   
   Run a full quality scan to score existing facts:
   
   ```javascript
   // Via API or console
   const monitor = createQualityMonitor({minQualityThreshold: 40});
   const facts = factStore.getAll();
   const report = monitor.processFacts(facts);
   console.log(`Evaluated ${report.scoredFacts.length} facts`);
   console.log(`Low quality: ${report.lowQualityFacts.length}`);
   ```

6. **Test forgetting curve**
   
   Enable forgetting curve in small batches:
   
   ```yaml
   memory:
     forgetting_curve:
       enabled: true
       archive_threshold: 0.15  # Conservative threshold initially
   ```
   
   Monitor archival:
   
   ```javascript
   const archive = new MemoryArchiveManager("./agents/hana/memory/memory-archive.db");
   console.log(`Archived: ${archive.getCount()} facts`);
   ```

7. **Verify migration**
   ```bash
   # Check facts table has new columns
   sqlite3 agents/hana/memory/facts.db "PRAGMA table_info(facts);"
   
   # Check archive database exists
   ls -la agents/hana/memory/memory-archive.db
   
   # Check quality metrics
   sqlite3 agents/hana/memory/facts.db "SELECT COUNT(*) FROM facts WHERE importance > 0;"
   ```

### Automatic Migration

The FactStore and ForgettingCurveEngine handle migration automatically:

```javascript
// In fact-store.js _migrate()
_migrate() {
  const current = this.db.pragma("user_version", { simple: true });
  if (current >= SCHEMA_VERSION) return;

  this.db.transaction(() => {
    let v = current;
    while (v < SCHEMA_VERSION) {
      switch (v) {
        case 0: break;  // v0 → v1
        case 1: this._migrateToSearchText(); break;  // v1 → v2
        case 2: this._migrateToQualityFields(); break;  // v2 → v3
      }
      v++;
    }
    this.db.pragma(`user_version = ${SCHEMA_VERSION}`);
  })();
}
```

### New Features After Migration

1. **Quality Scoring**: All facts scored on 5 dimensions (specificity, recency, relevance, consistency, usage)
2. **Forgetting Curve**: Automatic archival of low-retention memories based on Ebbinghaus model
3. **Archive System**: Archived facts preserved with search, restore, and export capabilities
4. **FTS5 Optimization**: Enhanced search with reranking, fuzzy matching, and query expansion
5. **Configuration Control**: Fine-grained control over quality thresholds, forgetting schedule, and search behavior

### Data Impact

- **No data loss**: All existing facts preserved
- **New fields**: `hit_count` (0), `importance` (0) added to facts
- **Archive database**: Created empty, populated only when forgetting curve runs
- **Quality scores**: Computed on-demand, not stored in database initially

---

## Manual Data Migration Scripts

### Export Facts (All Versions)

```bash
sqlite3 agents/hana/memory/facts.db ".mode json" ".output facts-export.json" "SELECT * FROM facts;"
```

### Import Facts

```bash
sqlite3 agents/hana/memory/facts.db ".mode json" ".import facts-export.json facts"
```

### Rebuild FTS5 Index

```bash
sqlite3 agents/hana/memory/facts.db "INSERT INTO facts_fts(facts_fts) VALUES ('rebuild');"
```

### Reset Schema Version (Emergency)

```bash
# Only use if migration is stuck
sqlite3 agents/hana/memory/facts.db "PRAGMA user_version = 0;"
```

---

## Troubleshooting Migration

### Migration Fails

1. **Check database integrity**
   ```bash
   sqlite3 agents/hana/memory/facts.db "PRAGMA integrity_check;"
   ```

2. **Restore from backup**
   ```bash
   rm -rf agents/hana/memory
   mv agents/hana/memory.backup agents/hana/memory
   ```

3. **Check logs** for specific error messages

### Missing Data After Migration

1. Verify the backup contains the data:
   ```bash
   sqlite3 agents/hana/memory.backup/facts.db "SELECT COUNT(*) FROM facts;"
   ```

2. Check if migration ran:
   ```bash
   sqlite3 agents/hana/memory/facts.db "PRAGMA user_version;"
   ```

3. Manually trigger re-migration:
   ```bash
   sqlite3 agents/hana/memory/facts.db "PRAGMA user_version = 0;"
   # Then restart application
   ```

### Performance Degradation After Migration

1. **Rebuild FTS5 index**
   ```bash
   sqlite3 agents/hana/memory/facts.db "INSERT INTO facts_fts(facts_fts) VALUES ('rebuild');"
   ```

2. **Vacuum database**
   ```bash
   sqlite3 agents/hana/memory/facts.db "VACUUM;"
   ```

3. **Check WAL mode**
   ```bash
   sqlite3 agents/hana/memory/facts.db "PRAGMA journal_mode;"
   # Should return: wal
   ```

---

## Configuration Changes Between Versions

### v1 Configuration
```yaml
memory:
  enabled: true
  model: "utility-model"
  # No embedding config (used sqlite-vec)
```

### v2 Configuration
```yaml
memory:
  enabled: true
  model: "utility-model"
  summary_model: "utility-model"
  # No vector search
```

### v3 Configuration
```yaml
memory:
  enabled: true
  model: "utility-model"
  summary_model: "utility-model"
  embedding:
    local: true
    remote_api_url: ""
    remote_api_key: ""
    force_remote: false
```

### v4 Configuration
```yaml
memory:
  enabled: true
  model: "utility-model"
  summary_model: "utility-model"
  embedding:
    local: true
    remote_api_url: ""
    remote_api_key: ""
    force_remote: false
  forgetting_curve:
    enabled: false
    schedule:
      - days: 1
        retentionRate: 0.50
      - days: 3
        retentionRate: 0.30
      - days: 7
        retentionRate: 0.20
      - days: 30
        retentionRate: 0.10
    archive_threshold: 0.25
    protected_tags:
      - "important"
  quality:
    enabled: true
    weights:
      specificity: 0.25
      recency: 0.20
      relevance: 0.25
      consistency: 0.15
      usage: 0.15
    min_threshold: 40
    auto_cleanup:
      enabled: false
      threshold: 15
      age_days: 365
  search:
    fts5_optimizer:
      synonym_map: {}
      bm25_params:
        k1: 1.2
        b: 0.75
      column_weights:
        fact: 2.0
        search_text: 1.0
```

---

## Rollback Procedure

If you need to rollback to a previous version:

1. **Stop the application**

2. **Restore database from backup**
   ```bash
   cp agents/hana/memory.backup/facts.db agents/hana/memory/facts.db
   ```

3. **Reset schema version** (if needed)
   ```bash
   sqlite3 agents/hana/memory/facts.db "PRAGMA user_version = <version>;"
   ```

4. **Remove v3-specific files**
   ```bash
   rm -f agents/hana/memory/vectors.db
   rm -f agents/hana/memory/summaries/*.json
   rm -f agents/hana/memory/reset.json
   ```

5. **Start the application with the older version**

---

## Best Practices

1. **Always backup before migration**
2. **Test migration on a copy first**
3. **Keep backups for at least 30 days**
4. **Monitor logs during first run after migration**
5. **Verify fact count before and after migration**
6. **Run a full compilation cycle after migration**
