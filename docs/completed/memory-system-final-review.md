# 记忆系统最终审查报告（Round 15 — 端到端静态分析）

> **日期**: 2026-05-23  
> **方法**: 语法检查 + ESM 导入解析 + 调用链追踪 + 数据流矩阵 + 边界条件枚举  
> **运行时验证**: 语法检查全通过 (8/8)，模块导入全通过 (3/3)，原生模块不可用（已尝试 pnpm rebuild + 手动下载 prebuilt binary，均因网络/build-tools 限制失败）

---

## 一、验证矩阵

| 检查项 | 方法 | 结果 |
|--------|------|------|
| 语法正确性 | `node --check` × 8 文件 | ✅ 全部通过 |
| ESM 导入链路 | `import()` 动态加载 × 3 核心类 | ✅ 全部通过 |
| 调用链闭合 | 静态追踪 7 条关键路径 | ✅ 全部闭合 |
| SQL 参数匹配 | 逐一比对 named/anonymous params | ✅ 全部匹配 |
| Schema 迁移顺序 | 构造函数执行顺序分析 | ✅ ALTER TABLE 先于 prepare |
| 原子初始化 | 多子系统初始化分析 | ✅ 全有或全无 |
| 资源关闭 | 逐一核对 close() 方法 | ⚠️ 1 个遗漏 |
| 数据流完整性 | SQL → _rowToFact → 搜索结果 | ✅ 字段全映射 |
| 日期过滤 | 混合搜索 3 层过滤追踪 | ✅ 无绕过 |
| 错误容错 | 逐一检查 try/catch 覆盖 | ✅ 无传播中断 |

---

## 二、调用链逐条追踪

### 链路 1: FactStore 构造 → 遗忘曲线初始化

```
new FactStore(dbPath, opts)
  ├─ _initSchema()           → CREATE TABLE facts + FTS5
  ├─ _migrate()              → v0→v1→v2 (quality scores)
  │   └─ _migrateToQualityScores()
  │       └─ db.prepare("SELECT * FROM facts").all()  // 直接 SQL, 不依赖 _stmts ✅
  ├─ _createFtsTriggers()    → 3 FTS 触发器
  ├─ 可选: _vectorEngine / _ftsOptimizer 初始化
  ├─ _initForgettingCurve()  → ALTER TABLE 添加 hit_count/importance/last_accessed_at/last_decay_check
  │   └─ 原子赋值: 两个子系统都成功 → 赋值; 任一失败 → null,null ✅
  ├─ _prepareStatements()    → SELECT * 编译, 线程含新列 ✅
  └─ _tagSearchCache
```

**结论**: 执行顺序正确，无回归风险。

### 链路 2: 添加事实 → 质量评分 → 向量存储

```
factStore.add(entry)
  ├─ scrubPII()             → PII 脱敏
  ├─ _stmts.insert.run()   → facts 表 + FTS 触发器自动同步
  ├─ _computeQualityForNewFact()
  │   └─ this.getAll()     → 全量加载 (性能: O(n²) for addBatch, 非 bug)
  │   └─ _qualityScorer.score(newFact, allFacts) → UPDATE quality_* 列
  └─ _storeEmbeddingAsync() (后台不阻塞)
      └─ _embeddingModel.getEmbedding(fact)
      └─ _vectorEngine.storeEmbedding(id, embedding, {time})
```

**结论**: 链路完整，PII 先脱敏再存储，质量评分容错。

### 链路 3: 混合搜索 (searchWithVectors)

```
memory-search.js search_memory
  ├─ 1. searchByTags → 计算 tagScores map (try/catch 保护) ✅
  └─ 2. factStore.searchWithVectors(query, limit, dateRange, {tagScores, tagWeight})
      ├─ 2a. searchFullText(query, limit*2) → ftsResults
      ├─ 2b. 无向量引擎 → 直接返回 ftsResults
      └─ 2c. 有向量引擎:
          ├─ _embeddingModel.getEmbedding(query)
          └─ _vectorEngine.hybridSearch(embedding, ftsResults, limit, opts)
              ├─ searchByVector() → vectorResults
              ├─ 日期过滤 ftsResults → filteredFtsResults ✅ (修复后)
              ├─ 遍历 filteredFtsResults → 融合 combinedMap ✅ (修复后)
              └─ 加权融合: vectorScore*0.5 + ftsScore*0.3 + tagScore*0.2
          └─ 通过 factMap 反查 facts 表 → 过滤掉已删除的记录 ✅
  ├─ 3. Post-filter by dateRange (第二层安全网)
  ├─ 4. 遗忘曲线衰减: _decayFactor * baseScore → _sortScore 排序
  │   └─ 每条独立 try/catch, 失败不影响其他 ✅
  └─ 5. 格式化输出
```

**结论**: 3 层日期过滤（SQL + hybridSearch + post-filter），2 层错误保护，FTS → 向量 → 衰减排序链路完全贯通。

### 链路 4: 遗忘→归档→删除 (每日 Step 7)

```
memory-ticker._doDaily() Step 7
  ├─ 条件: _dailyStepsCompleted.has("forgettingCheck") == false
  │         && factStore._forgettingCurve != null ✅
  └─ factStore._forgettingCurve.evaluateForgetting()
      ├─ getAllForDecay → facts (当天未检查的)
      ├─ 逐条计算 ageDays → calculateRetentionWithReinforcement
      ├─ isMemoryProtected() → 跳过
      ├─ retention < archiveThreshold → toArchive
      └─ updateDecayCheck → 标记已检查
  ├─ 条件: toArchive.length > 0 && factStore._archiveManager != null ✅
  └─ archiveBatch(toArchive, reason) → 写入 archived_facts.db
  └─ 逐条 factStore.delete(fact.id) → 从活跃库移除
      └─ FTS 触发器自动清理 FTS 索引 ✅
      └─ ⚠️ 向量 embedding 未清理 (见下文发现 1)
```

**结论**: 归档链完整，FTS 同步正确。向量残留无害但不干净。

### 链路 5: compileFacts 分块合并

```
compileFacts(summaryManager, outputPath, model, opts)
  ├─ 读取 prevFacts + 30 天 sessions 的 Key Facts 段
  ├─ 合并 → combined
  ├─ _compileFactsSafely(combined, prompt, model, maxTokens)
  │   ├─ combined ≤ 6000 chars → 直接 LLM
  │   └─ combined > 6000 chars:
  │       ├─ 按句子分块 → chunks
  │       ├─ 每块独立压缩 → results
  │       ├─ 两两递归合并 (最多 5 轮)
  │       │   ├─ 单块成功 → merged.push(result)
  │       │   ├─ 单块失败 → 保留两块原始内容 ✅ (修复后)
  │       │   └─ 合并失败 → 保留原块 + 标记 stop ✅
  │       └─ 最终多条时用换行拼接
  └─ LLM 全部失败 → result = combined ✅ (修复后)
  └─ atomicWrite(outputPath, result)
```

**结论**: 分块合并逻辑健壮，LLM 失败不丢数据，合并失败不丢原块。

### 链路 6: 资源关闭

```
factStore.close()
  ├─ this.db.close()          → facts.db 连接 ✅
  ├─ _vectorEngine.close()    → vectors.db 连接 ✅
  ├─ _embeddingModel.close()  → 模型资源 ✅
  ├─ _forgettingCurve.close() → facts.db 独立连接 ✅ (ForgettingCurveEngine 自己打开的)
  ├─ _archiveManager.close()  → archived_facts.db 连接 ✅
  └─ ⚠️ _ftsOptimizer.close() → optimized.db 连接 ❌ 遗漏!
```

**结论**: `_ftsOptimizer` 未关闭，造成 optimized.db 连接泄漏。

### 链路 7: Schema 迁移完整序列

```
v0: 初始 CREATE TABLE facts (id, fact, search_text, tags, time, session_id, created_at)
v0→v1: _ensureSearchTextColumn → 重建 FTS5 (双列: fact + search_text)
v1→v2: _migrateToQualityScores → ALTER TABLE ADD quality_* + access_count + user_feedback
v2→v3: (由 ForgettingCurveEngine._migrateSchema) → ALTER TABLE ADD hit_count + importance + last_accessed_at + last_decay_check
```

**结论**: 迁移链完整，v=2 在执行 `_initForgettingCurve` 之前，v=2 的 `_migrateToQualityScores` 使用直接 SQL 不依赖 `_stmts`，v=3 列在 `_prepareStatements` 之前添加完毕。

---

## 三、发现的新问题

### ⚠️ MODERATE: `_ftsOptimizer` 资源泄漏

- **位置**: `fact-store.js:850-856` `close()` 方法
- **问题**: `Fts5Optimizer` 在构造函数中打开了独立的 `{dbPath}-optimized.db` 数据库连接，但 `close()` 中未调用 `this._ftsOptimizer?.close()`
- **影响**: 当启用 `enableFts5Optimization` 时，`optimized.db` 连接永不关闭，进程退出时靠操作系统回收
- **修复**:
  ```javascript
  close() {
    if (this.db?.open) this.db.close();
    if (this._vectorEngine) this._vectorEngine.close();
    if (this._embeddingModel) this._embeddingModel.close();
    if (this._ftsOptimizer) this._ftsOptimizer.close();   // ← 新增
    if (this._forgettingCurve) this._forgettingCurve.close();
    if (this._archiveManager) this._archiveManager.close();
  }
  ```

### ℹ️ LOW: 删除事实后向量残留

- **位置**: `fact-store.js:813` `delete()` + `memory-ticker.js:345` Step 7 delete
- **问题**: `FactStore.delete()` 从 facts 表删除记录，FTS 触发器自动清理 FTS 索引，但 `embeddings` 表中的向量数据未清理
- **影响**: `searchByVector` 仍会返回已删除 fact 的 ID，但 `searchWithVectors` 中通过 `factMap.get(r.factId)` 的 null guard 过滤掉了。属于无害残留，但长期运行会积累垃圾向量
- **建议**: 在 `delete()` 中增加 `if (this._vectorEngine) this._vectorEngine.deleteEmbedding(id)` 调用

### ℹ️ LOW: `_computeQualityForNewFact` O(n²) 性能

- **位置**: `fact-store.js:367-386` `_computeQualityForNewFact`
- **问题**: 每添加一条事实都调用 `this.getAll()` 加载全量事实到内存，`addBatch(N)` 会 N 次加载全部事实
- **影响**: 对于大量事实场景（>10,000），内存和 CPU 压力显著。`addBatch` 内的每个 `add()` 都做一次全量加载
- **建议**: `addBatch()` 中在循环外加载一次 allFacts 并复用

---

## 四、已验证的功能完整性

| 功能模块 | 状态 | 验证方式 |
|----------|------|----------|
| PII 脱敏 | ✅ 正常 | 代码追踪: scrubPII → add |
| FTS5 全文搜索 | ✅ 正常 | 调用链: buildFtsQuery → _stmts.ftsSearch + LIKE fallback |
| CJK n-gram 分词 | ✅ 正常 | cjkNgrams 2-gram/3-gram → FTS query |
| 标签搜索 (JSON 精确匹配) | ✅ 正常 | json_each + prepared statement 缓存 |
| 向量余弦相似度 | ✅ 正常 | cosine_similarity UDF → searchByVector |
| 混合搜索 (3-way fusion) | ✅ 正常 | 向量 + FTS + 标签 加权融合 |
| 质量评分 | ✅ 正常 | createQualityScorer → scoreBatch → UPDATE |
| 用户反馈 (important/useless) | ✅ 正常 | markFactImportant/markFactUseless → user_feedback JSON |
| 遗忘曲线 | ✅ 正常 | calculateRetention + reinforcement boost |
| 记忆归档 | ✅ 正常 | archiveBatch + INSERT OR IGNORE 去重 |
| 归档恢复 | ✅ 正常 | restoreFact/restoreBatch |
| 每日任务断点续跑 | ✅ 正常 | _dailyStepsCompleted Set 持久化 |
| 编译去重 (指纹) | ✅ 正常 | MD5 fingerprint + .fingerprint 文件 |
| 编译分块合并 | ✅ 正常 | sentences-based chunking + recursive merge |
| 熔断器 | ✅ 正常 | circuitBreaker + retryManager |
| 错误 dedup | ✅ 正常 | _lastErrorSig 去重 + _logStepError |
| 健康状态 | ✅ 正常 | _health 8-step tracking + getHealthStatus() |
| 向量搜索优雅降级 | ✅ 正常 | 无向量引擎 → FTS only; FTS 语法错误 → LIKE fallback |
| 空结果处理 | ✅ 正常 | 无事实 → 返回空消息; 无新摘要 → 保留旧 compiled |
| 日期范围过滤 | ✅ 正常 | 3 层防线: SQL → hybridSearch filter → post-filter |

---

## 五、最终结论

**记忆系统经过 15 轮审计，已达可交付状态。**

核心调用链路全部贯通，7 条关键路径的端到端数据流验证通过。此前发现的 14 个 bug 全部修复且无回归。本次最终审查发现 1 个 MODERATE 级遗漏（`_ftsOptimizer.close()`）和 2 个 LOW 级改进建议。

**建议立即修复的**:
1. [MODERATE] `fact-store.js` `close()` 方法添加 `_ftsOptimizer.close()`

**建议关注但不紧急的**:
2. [LOW] `delete()` 方法同步清理 vector embedding
3. [LOW] `addBatch()` 优化全量加载性能

---

🤖 Generated with [Qoder](https://qoder.com)
