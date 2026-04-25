type Entry = { addedAt: number; accessedAt: number };

export interface FailedKeysTracker {
  has(key: string): boolean;
  add(key: string): void;
}

export interface FailedKeysTrackerConfig {
  ttlMs: number;
  maxSize: number;
}

export function createFailedKeysTracker(
  config: FailedKeysTrackerConfig,
  now: () => number = () => Date.now(),
): FailedKeysTracker {
  const entries = new Map<string, Entry>();

  function evictExpired(): void {
    const cutoff = now() - config.ttlMs;
    for (const [key, entry] of entries) {
      if (entry.addedAt < cutoff) {
        entries.delete(key);
      }
    }
  }

  function evictLRU(): void {
    if (entries.size < config.maxSize) return;

    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of entries) {
      if (entry.accessedAt < oldestTime) {
        oldestTime = entry.accessedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      entries.delete(oldestKey);
    }
  }

  return {
    has(key) {
      evictExpired();
      const entry = entries.get(key);
      if (!entry) return false;
      entry.accessedAt = now();
      return true;
    },
    add(key) {
      evictExpired();
      const existing = entries.get(key);
      if (existing) {
        existing.accessedAt = now();
        return;
      }
      evictLRU();
      const timestamp = now();
      entries.set(key, { addedAt: timestamp, accessedAt: timestamp });
    },
  };
}
