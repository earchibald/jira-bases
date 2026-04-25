import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createFailedKeysTracker } from "./failed-keys-tracker";

describe("FailedKeysTracker", () => {
  let mockNow: number;
  const now = () => mockNow;

  beforeEach(() => {
    mockNow = 1000000;
  });

  it("returns false for a key that was never added", () => {
    const tracker = createFailedKeysTracker({ ttlMs: 5000, maxSize: 10 }, now);
    expect(tracker.has("ABC-1")).toBe(false);
  });

  it("returns true for a key that was added", () => {
    const tracker = createFailedKeysTracker({ ttlMs: 5000, maxSize: 10 }, now);
    tracker.add("ABC-1");
    expect(tracker.has("ABC-1")).toBe(true);
  });

  it("evicts a key after TTL has elapsed", () => {
    const tracker = createFailedKeysTracker({ ttlMs: 5000, maxSize: 10 }, now);
    tracker.add("ABC-1");
    mockNow += 4999;
    expect(tracker.has("ABC-1")).toBe(true);
    mockNow += 2;
    expect(tracker.has("ABC-1")).toBe(false);
  });

  it("updates accessedAt when has() is called on an existing key", () => {
    const tracker = createFailedKeysTracker({ ttlMs: 5000, maxSize: 10 }, now);
    tracker.add("ABC-1");
    mockNow += 3000;
    expect(tracker.has("ABC-1")).toBe(true);
    // accessedAt updated to mockNow (1003000)
    // but TTL is still measured from addedAt (1000000)
    mockNow += 1999;
    expect(tracker.has("ABC-1")).toBe(true);
    mockNow += 2;
    expect(tracker.has("ABC-1")).toBe(false);
  });

  it("updates accessedAt when add() is called on an existing key", () => {
    const tracker = createFailedKeysTracker({ ttlMs: 5000, maxSize: 10 }, now);
    tracker.add("ABC-1");
    mockNow += 3000;
    tracker.add("ABC-1");
    // accessedAt updated to mockNow (1003000)
    // but TTL is still measured from addedAt (1000000)
    mockNow += 1999;
    expect(tracker.has("ABC-1")).toBe(true);
    mockNow += 2;
    expect(tracker.has("ABC-1")).toBe(false);
  });

  it("evicts LRU entry when maxSize is reached", () => {
    const tracker = createFailedKeysTracker({ ttlMs: 10000, maxSize: 3 }, now);
    tracker.add("ABC-1");
    mockNow += 100;
    tracker.add("ABC-2");
    mockNow += 100;
    tracker.add("ABC-3");
    mockNow += 100;
    // Adding a 4th key should evict ABC-1 (oldest accessedAt)
    tracker.add("ABC-4");
    expect(tracker.has("ABC-1")).toBe(false);
    expect(tracker.has("ABC-2")).toBe(true);
    expect(tracker.has("ABC-3")).toBe(true);
    expect(tracker.has("ABC-4")).toBe(true);
  });

  it("evicts LRU based on accessedAt, not addedAt", () => {
    const tracker = createFailedKeysTracker({ ttlMs: 10000, maxSize: 3 }, now);
    tracker.add("ABC-1");
    mockNow += 100;
    tracker.add("ABC-2");
    mockNow += 100;
    tracker.add("ABC-3");
    mockNow += 100;
    // Access ABC-1 to update its accessedAt
    tracker.has("ABC-1");
    mockNow += 100;
    // Adding a 4th key should evict ABC-2 (oldest accessedAt now)
    tracker.add("ABC-4");
    expect(tracker.has("ABC-1")).toBe(true);
    expect(tracker.has("ABC-2")).toBe(false);
    expect(tracker.has("ABC-3")).toBe(true);
    expect(tracker.has("ABC-4")).toBe(true);
  });

  it("evicts expired entries before checking LRU", () => {
    const tracker = createFailedKeysTracker({ ttlMs: 5000, maxSize: 3 }, now);
    tracker.add("ABC-1");
    mockNow += 100;
    tracker.add("ABC-2");
    mockNow += 100;
    tracker.add("ABC-3");
    // ABC-1 is now expired (5001ms old from its addedAt)
    mockNow += 4801;
    // Adding a 4th key evicts expired ABC-1, no LRU needed
    tracker.add("ABC-4");
    expect(tracker.has("ABC-1")).toBe(false);
    expect(tracker.has("ABC-2")).toBe(true);
    expect(tracker.has("ABC-3")).toBe(true);
    expect(tracker.has("ABC-4")).toBe(true);
  });

  it("handles multiple expired entries", () => {
    const tracker = createFailedKeysTracker({ ttlMs: 5000, maxSize: 10 }, now);
    tracker.add("ABC-1");
    mockNow += 100;
    tracker.add("ABC-2");
    mockNow += 100;
    tracker.add("ABC-3");
    mockNow += 5000;
    // ABC-1 and ABC-2 are expired
    expect(tracker.has("ABC-1")).toBe(false);
    expect(tracker.has("ABC-2")).toBe(false);
    expect(tracker.has("ABC-3")).toBe(true);
  });

  it("does not evict when below maxSize", () => {
    const tracker = createFailedKeysTracker({ ttlMs: 10000, maxSize: 5 }, now);
    tracker.add("ABC-1");
    tracker.add("ABC-2");
    tracker.add("ABC-3");
    expect(tracker.has("ABC-1")).toBe(true);
    expect(tracker.has("ABC-2")).toBe(true);
    expect(tracker.has("ABC-3")).toBe(true);
  });

  it("uses Date.now() by default when no now function is provided", () => {
    const tracker = createFailedKeysTracker({ ttlMs: 1000, maxSize: 10 });
    tracker.add("ABC-1");
    expect(tracker.has("ABC-1")).toBe(true);
  });
});
