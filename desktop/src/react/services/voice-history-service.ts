/**
 * voice-history-service.ts — Voice conversation history using IndexedDB
 *
 * - Max 1000 entries, auto-prune on insert
 * - 30-day expiry, cleaned up on each access
 * - Pagination support with limit/offset
 */

export interface VoiceHistoryEntry {
  id: string;
  timestamp: Date;
  userText: string;
  aiText: string;
  duration: number;
  metrics?: {
    sttLatency?: number;
    ttsLatency?: number;
    totalLatency?: number;
  };
}

export interface VoiceHistoryQuery {
  limit?: number;
  offset?: number;
  sortBy?: 'newest' | 'oldest';
}

// ── Storage interface for testability ─────────────────────────────────────────

interface VoiceHistoryStorage {
  init(): Promise<void>;
  put(entry: VoiceHistoryEntry): Promise<void>;
  get(id: string): Promise<VoiceHistoryEntry | undefined>;
  getAll(sortDir: 'asc' | 'desc'): Promise<VoiceHistoryEntry[]>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
  count(): Promise<number>;
  deleteMany(ids: string[]): Promise<void>;
}

// ── IndexedDB implementation ─────────────────────────────────────────────────

type IDBFactoryProvider = () => IDBFactory | null;

let idbFactoryProvider: IDBFactoryProvider = () =>
  typeof indexedDB !== 'undefined' ? indexedDB : null;

/** @internal For testing only */
export function __setIdbFactoryProvider(provider: IDBFactoryProvider): void {
  idbFactoryProvider = provider;
}

/** @internal For testing only */
export function __resetIdbFactoryProvider(): void {
  idbFactoryProvider = () =>
    typeof indexedDB !== 'undefined' ? indexedDB : null;
}

function getIdb(): IDBFactory {
  const db = idbFactoryProvider();
  if (!db) throw new Error('IndexedDB is not available');
  return db;
}

class IndexedDBStorage implements VoiceHistoryStorage {
  private static DB_NAME = 'voice-history';
  private static STORE_NAME = 'conversations';
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = getIdb().open(IndexedDBStorage.DB_NAME, 1);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IndexedDBStorage.STORE_NAME)) {
          const store = db.createObjectStore(IndexedDBStorage.STORE_NAME, {
            keyPath: 'id',
          });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
    });

    return this.dbPromise;
  }

  private tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return this.getDb().then((db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IndexedDBStorage.STORE_NAME, mode);
        const store = tx.objectStore(IndexedDBStorage.STORE_NAME);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        tx.onerror = () => reject(tx.error);
      })
    );
  }

  async init(): Promise<void> {
    await this.getDb();
  }

  async put(entry: VoiceHistoryEntry): Promise<void> {
    await this.tx('readwrite', (store) => store.put(entry));
  }

  async get(id: string): Promise<VoiceHistoryEntry | undefined> {
    return this.tx('readonly', (store) => store.get(id));
  }

  async getAll(sortDir: 'asc' | 'desc'): Promise<VoiceHistoryEntry[]> {
    return this.tx('readonly', (store) => {
      const index = store.index('timestamp');
      const req = index.openCursor(null, sortDir === 'desc' ? 'prev' : 'next');
      return new Promise((resolve) => {
        const results: VoiceHistoryEntry[] = [];
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) { resolve(results); return; }
          results.push(cursor.value);
          cursor.continue();
        };
      });
    });
  }

  async delete(id: string): Promise<void> {
    await this.tx('readwrite', (store) => store.delete(id));
  }

  async clear(): Promise<void> {
    await this.tx('readwrite', (store) => store.clear());
  }

  async count(): Promise<number> {
    return this.tx('readonly', (store) => store.count());
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.tx('readwrite', (store) => {
      // Delete all in one transaction
      for (const id of ids) store.delete(id);
      // Return a dummy request to satisfy the type
      return store.count();
    });
  }
}

// ── In-memory implementation for testing ──────────────────────────────────────

export class InMemoryStorage implements VoiceHistoryStorage {
  private _data = new Map<string, VoiceHistoryEntry>();

  async init(): Promise<void> {}

  async put(entry: VoiceHistoryEntry): Promise<void> {
    this._data.set(entry.id, { ...entry, timestamp: new Date(entry.timestamp) });
  }

  async get(id: string): Promise<VoiceHistoryEntry | undefined> {
    const entry = this._data.get(id);
    return entry ? { ...entry, timestamp: new Date(entry.timestamp) } : undefined;
  }

  async getAll(sortDir: 'asc' | 'desc'): Promise<VoiceHistoryEntry[]> {
    const entries = Array.from(this._data.values());
    entries.sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      return sortDir === 'desc' ? tb - ta : ta - tb;
    });
    return entries.map((e) => ({ ...e, timestamp: new Date(e.timestamp) }));
  }

  async delete(id: string): Promise<void> {
    this._data.delete(id);
  }

  async clear(): Promise<void> {
    this._data.clear();
  }

  async count(): Promise<number> {
    return this._data.size;
  }

  async deleteMany(ids: string[]): Promise<void> {
    for (const id of ids) this._data.delete(id);
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const hex = (n: number) => n.toString(16).padStart(4, '0');
  const d = Date.now();
  const r = Math.floor(Math.random() * 0xffff);
  return `${hex(d & 0xffff)}${hex(d >> 16)}-${hex(r)}-${hex((r >> 4) & 0xfff)}-${hex((r >> 8) & 0xff)}-${hex(r)}${hex(d & 0xffff)}`;
}

export class VoiceHistoryService {
  private static MAX_ENTRIES = 1000;
  private static EXPIRY_DAYS = 30;

  private storage: VoiceHistoryStorage;

  constructor(storage?: VoiceHistoryStorage) {
    this.storage = storage || new IndexedDBStorage();
  }

  async addEntry(
    entry: Omit<VoiceHistoryEntry, 'id' | 'timestamp'>,
  ): Promise<string> {
    const id = generateId();
    const fullEntry: VoiceHistoryEntry = {
      ...entry,
      id,
      timestamp: new Date(),
    };

    await this.storage.put(fullEntry);
    await this.pruneIfOverMax();
    await this.pruneExpired();

    return id;
  }

  async getEntries(query?: VoiceHistoryQuery): Promise<VoiceHistoryEntry[]> {
    const limit = query?.limit ?? 50;
    const offset = query?.offset ?? 0;
    const sortBy = query?.sortBy ?? 'newest';

    const all = await this.storage.getAll(sortBy === 'newest' ? 'desc' : 'asc');
    return all.slice(offset, offset + limit);
  }

  async getEntry(id: string): Promise<VoiceHistoryEntry | null> {
    const entry = await this.storage.get(id);
    return entry ?? null;
  }

  async deleteEntry(id: string): Promise<void> {
    await this.storage.delete(id);
  }

  async clearAll(): Promise<void> {
    await this.storage.clear();
  }

  async getCount(): Promise<number> {
    return this.storage.count();
  }

  private async pruneIfOverMax(): Promise<void> {
    const count = await this.storage.count();
    if (count <= VoiceHistoryService.MAX_ENTRIES) return;

    const toDelete = count - VoiceHistoryService.MAX_ENTRIES;
    const oldest = await this.storage.getAll('asc');
    const idsToDelete = oldest.slice(0, toDelete).map((e) => e.id);
    await this.storage.deleteMany(idsToDelete);
  }

  private async pruneExpired(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - VoiceHistoryService.EXPIRY_DAYS);

    const all = await this.storage.getAll('asc');
    const expired = all.filter((e) => new Date(e.timestamp) < cutoff);
    if (expired.length > 0) {
      await this.storage.deleteMany(expired.map((e) => e.id));
    }
  }
}

// Singleton instance
export const voiceHistoryService = new VoiceHistoryService();
