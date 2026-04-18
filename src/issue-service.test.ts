import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createIssueService, LookupResult } from "./issue-service";
import { createIssueCache, CACHE_TTL_MS } from "./issue-cache";
import type { Issue, JiraClient, Result, JiraError } from "./jira-client";

const ISSUE: Issue = {
  key: "ABC-1",
  summary: "S",
  status: { name: "Open", categoryColor: "blue-gray" },
  issueType: { name: "Task", iconUrl: "u" },
  priority: null,
  assignee: null,
  reporter: { displayName: "Bob" },
  updated: "2026-04-15T10:00:00.000+0000",
};

function fakeClient(impl: (key: string) => Promise<Result<Issue, JiraError>>): JiraClient {
  return {
    async getCurrentUser() {
      throw new Error("not used");
    },
    getIssue: vi.fn(impl) as JiraClient["getIssue"],
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("IssueService.lookup", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("emits loading then ok on miss", async () => {
    const cache = createIssueCache();
    const client = fakeClient(async () => ({ ok: true, value: ISSUE }));
    const svc = createIssueService(client, cache);
    const calls: LookupResult[] = [];
    svc.lookup("ABC-1", (r) => calls.push(r));
    await flush();
    expect(calls.map((c) => c.state)).toEqual(["loading", "ok"]);
    if (calls[1].state === "ok") expect(calls[1].issue).toEqual(ISSUE);
  });

  it("emits loading then error on miss-error", async () => {
    const cache = createIssueCache();
    const client = fakeClient(async () => ({ ok: false, error: { kind: "not-found", key: "ABC-1" } }));
    const svc = createIssueService(client, cache);
    const calls: LookupResult[] = [];
    svc.lookup("ABC-1", (r) => calls.push(r));
    await flush();
    expect(calls.map((c) => c.state)).toEqual(["loading", "error"]);
  });

  it("emits ok once on a fresh hit", async () => {
    const cache = createIssueCache();
    cache.set("ABC-1", ISSUE);
    const client = fakeClient(async () => {
      throw new Error("should not be called");
    });
    const svc = createIssueService(client, cache);
    const calls: LookupResult[] = [];
    svc.lookup("ABC-1", (r) => calls.push(r));
    await flush();
    expect(calls).toEqual([{ state: "ok", issue: ISSUE, refreshing: false }]);
  });

  it("emits stale then ok on a stale hit with successful refetch", async () => {
    const cache = createIssueCache();
    cache.set("ABC-1", ISSUE);
    vi.advanceTimersByTime(CACHE_TTL_MS + 1);
    const fresh: Issue = { ...ISSUE, summary: "Updated" };
    const client = fakeClient(async () => ({ ok: true, value: fresh }));
    const svc = createIssueService(client, cache);
    const calls: LookupResult[] = [];
    svc.lookup("ABC-1", (r) => calls.push(r));
    await flush();
    expect(calls[0]).toEqual({ state: "stale", issue: ISSUE, refreshing: true });
    expect(calls[1]).toEqual({ state: "ok", issue: fresh, refreshing: false });
  });

  it("emits only stale (no follow-up) when refetch errors", async () => {
    const cache = createIssueCache();
    cache.set("ABC-1", ISSUE);
    vi.advanceTimersByTime(CACHE_TTL_MS + 1);
    const client = fakeClient(async () => ({ ok: false, error: { kind: "network", message: "x" } }));
    const svc = createIssueService(client, cache);
    const calls: LookupResult[] = [];
    svc.lookup("ABC-1", (r) => calls.push(r));
    await flush();
    expect(calls).toEqual([{ state: "stale", issue: ISSUE, refreshing: true }]);
  });

  it("coalesces concurrent lookups into one fetch", async () => {
    const cache = createIssueCache();
    const fetcher = vi.fn(async () => ({ ok: true as const, value: ISSUE }));
    const client = fakeClient(fetcher);
    const svc = createIssueService(client, cache);
    const a: LookupResult[] = [];
    const b: LookupResult[] = [];
    svc.lookup("ABC-1", (r) => a.push(r));
    svc.lookup("ABC-1", (r) => b.push(r));
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a.at(-1)?.state).toBe("ok");
    expect(b.at(-1)?.state).toBe("ok");
  });
});
