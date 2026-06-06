import { describe, it, expect, beforeEach } from 'vitest';
import {
  VoiceHistoryService,
  InMemoryStorage,
} from '../../desktop/src/react/services/voice-history-service';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEntry(overrides = {}) {
  return {
    userText: 'Hello',
    aiText: 'Hi there!',
    duration: 3000,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('VoiceHistoryService', () => {
  let service;
  let storage;

  beforeEach(() => {
    storage = new InMemoryStorage();
    service = new VoiceHistoryService(storage);
  });

  it('should add and retrieve an entry', async () => {
    const id = await service.addEntry(makeEntry({ userText: 'Test query', aiText: 'Test answer', duration: 5000 }));

    expect(id).toBeDefined();
    expect(typeof id).toBe('string');

    const entries = await service.getEntries();

    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(id);
    expect(entries[0].userText).toBe('Test query');
    expect(entries[0].aiText).toBe('Test answer');
    expect(entries[0].duration).toBe(5000);
    expect(entries[0].timestamp).toBeInstanceOf(Date);
  });

  it('should return entries sorted newest first by default', async () => {
    await service.addEntry(makeEntry({ userText: 'First' }));
    await new Promise((r) => setTimeout(r, 5));
    await service.addEntry(makeEntry({ userText: 'Second' }));
    await new Promise((r) => setTimeout(r, 5));
    await service.addEntry(makeEntry({ userText: 'Third' }));

    const entries = await service.getEntries();

    expect(entries).toHaveLength(3);
    expect(entries[0].userText).toBe('Third');
    expect(entries[1].userText).toBe('Second');
    expect(entries[2].userText).toBe('First');
  });

  it('should support pagination with limit', async () => {
    for (let i = 0; i < 10; i++) {
      await service.addEntry(makeEntry({ userText: `Entry ${i}` }));
      await new Promise((r) => setTimeout(r, 1));
    }

    const entries = await service.getEntries({ limit: 3 });

    expect(entries).toHaveLength(3);
    expect(entries[0].userText).toBe('Entry 9');
  });

  it('should support pagination with offset', async () => {
    for (let i = 0; i < 10; i++) {
      await service.addEntry(makeEntry({ userText: `Entry ${i}` }));
      await new Promise((r) => setTimeout(r, 1));
    }

    const entries = await service.getEntries({ limit: 3, offset: 5 });

    expect(entries).toHaveLength(3);
    expect(entries[0].userText).toBe('Entry 4');
    expect(entries[1].userText).toBe('Entry 3');
    expect(entries[2].userText).toBe('Entry 2');
  });

  it('should support sorting oldest first', async () => {
    await service.addEntry(makeEntry({ userText: 'First' }));
    await new Promise((r) => setTimeout(r, 5));
    await service.addEntry(makeEntry({ userText: 'Second' }));
    await new Promise((r) => setTimeout(r, 5));
    await service.addEntry(makeEntry({ userText: 'Third' }));

    const entries = await service.getEntries({ sortBy: 'oldest' });

    expect(entries[0].userText).toBe('First');
    expect(entries[1].userText).toBe('Second');
    expect(entries[2].userText).toBe('Third');
  });

  it('should get a single entry by ID', async () => {
    const id = await service.addEntry(makeEntry({ userText: 'Find me' }));

    const entry = await service.getEntry(id);

    expect(entry).not.toBeNull();
    expect(entry.userText).toBe('Find me');
  });

  it('should return null for non-existent entry', async () => {
    const entry = await service.getEntry('non-existent-id');
    expect(entry).toBeNull();
  });

  it('should delete a single entry', async () => {
    const id1 = await service.addEntry(makeEntry({ userText: 'Keep' }));
    const id2 = await service.addEntry(makeEntry({ userText: 'Delete me' }));

    await service.deleteEntry(id2);

    const entries = await service.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(id1);

    const deleted = await service.getEntry(id2);
    expect(deleted).toBeNull();
  });

  it('should clear all entries', async () => {
    await service.addEntry(makeEntry({ userText: 'One' }));
    await service.addEntry(makeEntry({ userText: 'Two' }));

    await service.clearAll();

    const entries = await service.getEntries();
    expect(entries).toHaveLength(0);

    const count = await service.getCount();
    expect(count).toBe(0);
  });

  it('should return correct count', async () => {
    await service.addEntry(makeEntry());
    await service.addEntry(makeEntry());
    await service.addEntry(makeEntry());

    const count = await service.getCount();
    expect(count).toBe(3);
  });

  it('should auto-prune when over max entries', async () => {
    const maxEntries = 1000;
    for (let i = 0; i < maxEntries + 50; i++) {
      await service.addEntry(makeEntry({ userText: `Entry ${i}` }));
    }

    const count = await service.getCount();
    expect(count).toBe(maxEntries);

    const entries = await service.getEntries({ limit: 1, sortBy: 'oldest' });
    expect(entries[0].userText).toBe('Entry 50');
  });

  it('should store metrics when provided', async () => {
    const id = await service.addEntry(
      makeEntry({
        metrics: {
          sttLatency: 120,
          ttsLatency: 250,
          totalLatency: 500,
        },
      }),
    );

    const entry = await service.getEntry(id);

    expect(entry.metrics).toEqual({
      sttLatency: 120,
      ttsLatency: 250,
      totalLatency: 500,
    });
  });

  it('should generate unique IDs for each entry', async () => {
    const id1 = await service.addEntry(makeEntry());
    const id2 = await service.addEntry(makeEntry());

    expect(id1).not.toBe(id2);
  });

  it('should handle entries with empty text', async () => {
    const id = await service.addEntry(makeEntry({ userText: '', aiText: '', duration: 0 }));

    const entry = await service.getEntry(id);

    expect(entry.userText).toBe('');
    expect(entry.aiText).toBe('');
    expect(entry.duration).toBe(0);
  });
});
