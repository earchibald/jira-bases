import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createIssueCache, CACHE_TTL_MS } from "./issue-cache";
import type { IssueDetails } from "./jira-fields";

const ISSUE: IssueDetails = {
  key: "ABC-1",
  summary: "S",
  status: "Open",
  type: "Task",
  priority: null,
  assignee: null,
  reporter: "Bob",
  labels: [],
  updated: "2026-04-15T10:00:00.000+0000",
  url: "https://jira.me.com/browse/ABC-1",
};

describe("IssueCache", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns null on miss", () => {
    const c = createIssueCache();
    expect(c.get("X-1")).toBeNull();
  });

  it("returns fresh on a recent set", () => {
    const c = createIssueCache();
    c.set("ABC-1", ISSUE);
    expect(c.get("ABC-1")).toEqual({ issue: ISSUE, fresh: true });
  });

  it("returns stale once TTL has elapsed", () => {
    const c = createIssueCache();
    c.set("ABC-1", ISSUE);
    vi.advanceTimersByTime(CACHE_TTL_MS + 1);
    expect(c.get("ABC-1")).toEqual({ issue: ISSUE, fresh: false });
  });

  it("set replaces an existing entry and resets freshness", () => {
    const c = createIssueCache();
    c.set("ABC-1", ISSUE);
    vi.advanceTimersByTime(CACHE_TTL_MS + 1);
    const updated = { ...ISSUE, summary: "S2" };
    c.set("ABC-1", updated);
    expect(c.get("ABC-1")).toEqual({ issue: updated, fresh: true });
  });

  it("tracks and returns inflight promises", async () => {
    const c = createIssueCache();
    expect(c.inflight("ABC-1")).toBeNull();
    let resolve!: (v: unknown) => void;
    const p = new Promise((r) => (resolve = r));
    c.trackInflight("ABC-1", p as Promise<never>);
    expect(c.inflight("ABC-1")).toBe(p);
    resolve("done");
    await p;
  });
});
