# jira-bases v0.3 — Issue Lookup & Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hover preview of JIRA issues over `…/browse/KEY` links plus a "JIRA: Look up issue…" command-palette modal, sharing one fetch/cache path.

**Architecture:** Extend `JiraClient` with `getIssue` and a `not-found` error kind. New pure-TS `IssueCache` (TTL + in-flight coalescing) and `IssueService` (stale-while-revalidate). Shared pure-DOM `renderIssue` consumed by both an Obsidian `HoverPopover` listener and an Obsidian `Modal`.

**Tech Stack:** TypeScript (strict), Obsidian plugin API (`HoverPopover`, `Modal`, `requestUrl`), `vitest` + `msw` for `JiraClient`, `vitest` + `jsdom` for `renderIssue`.

**Spec:** `docs/superpowers/specs/2026-04-17-jira-issue-preview-design.md`

---

## File Structure

**Create:**
- `src/issue-cache.ts` — pure TTL cache + in-flight tracking
- `src/issue-cache.test.ts`
- `src/issue-service.ts` — orchestrator, stale-while-revalidate, callback-driven
- `src/issue-service.test.ts`
- `src/issue-preview-view.ts` — `renderIssue(el, state, ctx)` pure DOM
- `src/issue-preview-view.test.ts` (jsdom)
- `src/hover-preview.ts` — Obsidian `HoverPopover` registration
- `src/lookup-modal.ts` — Obsidian `Modal` subclass
- `src/jira-key.ts` — `parseKeyOrUrl`, `extractKeyFromHref` (shared, pure)
- `src/jira-key.test.ts`

**Modify:**
- `src/jira-client.ts` — add `Issue`, `getIssue`, `not-found` error kind
- `src/jira-client.test.ts` — add `getIssue` cases
- `src/main.ts` — wire cache, service, hover listener, lookup command
- `vitest.config.ts` — split env per file (jsdom for view test)
- `package.json` — add `jsdom` devDependency
- `README.md` — document hover + lookup
- `manifest.json` — bump version to `0.3.0`

**Boundaries:**
- `jira-client.ts`, `issue-cache.ts`, `issue-service.ts`, `issue-preview-view.ts`, `jira-key.ts` import zero Obsidian symbols.
- Obsidian-coupled glue lives only in `hover-preview.ts`, `lookup-modal.ts`, `main.ts`.

---

## Task 1: Add `jsdom` and split vitest environment

**Files:**
- Modify: `/Users/earchibald/Projects/jira-bases/package.json`
- Modify: `/Users/earchibald/Projects/jira-bases/vitest.config.ts`

- [ ] **Step 1: Install jsdom**

```bash
cd /Users/earchibald/Projects/jira-bases && npm install --save-dev jsdom@^24.0.0 @types/jsdom@^21.1.6
```

- [ ] **Step 2: Configure vitest to use jsdom for view tests via per-file pragma**

Replace `vitest.config.ts` with:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    environmentMatchGlobs: [
      ["src/**/issue-preview-view.test.ts", "jsdom"],
    ],
  },
});
```

- [ ] **Step 3: Sanity-check existing tests still pass**

Run: `npm test`
Expected: PASS (existing `jira-client` and `secret-store` tests).

- [ ] **Step 4: Commit**

```bash
cd /Users/earchibald/Projects/jira-bases && git add package.json package-lock.json vitest.config.ts && git commit -m "chore: add jsdom for upcoming view tests"
```

---

## Task 2: Extend `JiraClient` with `getIssue` (TDD)

**Files:**
- Modify: `/Users/earchibald/Projects/jira-bases/src/jira-client.ts`
- Modify: `/Users/earchibald/Projects/jira-bases/src/jira-client.test.ts`

- [ ] **Step 1: Add the failing test for the success case**

Append to `src/jira-client.test.ts`:

```ts
describe("JiraClient.getIssue", () => {
  it("returns ok with mapped issue on 200", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/issue/ABC-123`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("fields")).toBe(
          "summary,status,issuetype,priority,assignee,reporter,updated",
        );
        expect(request.headers.get("Authorization")).toBe("Bearer tok-abc");
        return HttpResponse.json({
          key: "ABC-123",
          fields: {
            summary: "A sample issue",
            status: { name: "In Progress", statusCategory: { colorName: "yellow" } },
            issuetype: { name: "Task", iconUrl: "https://jira.me.com/it.png" },
            priority: { name: "High", iconUrl: "https://jira.me.com/p.png" },
            assignee: { displayName: "Alice" },
            reporter: { displayName: "Bob" },
            updated: "2026-04-15T10:00:00.000+0000",
          },
        });
      }),
    );
    const result = await client("tok-abc").getIssue("ABC-123");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        key: "ABC-123",
        summary: "A sample issue",
        status: { name: "In Progress", categoryColor: "yellow" },
        issueType: { name: "Task", iconUrl: "https://jira.me.com/it.png" },
        priority: { name: "High", iconUrl: "https://jira.me.com/p.png" },
        assignee: { displayName: "Alice" },
        reporter: { displayName: "Bob" },
        updated: "2026-04-15T10:00:00.000+0000",
      });
    }
  });

  it("maps null assignee and missing priority", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/issue/ABC-1`, () =>
        HttpResponse.json({
          key: "ABC-1",
          fields: {
            summary: "S",
            status: { name: "Open", statusCategory: { colorName: "blue-gray" } },
            issuetype: { name: "Bug", iconUrl: "u" },
            priority: null,
            assignee: null,
            reporter: { displayName: "Bob" },
            updated: "2026-04-15T10:00:00.000+0000",
          },
        }),
      ),
    );
    const result = await client("tok-abc").getIssue("ABC-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.assignee).toBeNull();
      expect(result.value.priority).toBeNull();
    }
  });

  it("returns not-found on 404", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/issue/XYZ-9`, () =>
        new HttpResponse(null, { status: 404 }),
      ),
    );
    const result = await client("tok-abc").getIssue("XYZ-9");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual({ kind: "not-found", key: "XYZ-9" });
  });

  it("returns auth on 401", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/issue/ABC-1`, () =>
        new HttpResponse("nope", { status: 401 }),
      ),
    );
    const result = await client("tok-abc").getIssue("ABC-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("auth");
  });

  it("returns network on fetch throw", async () => {
    const c = createJiraClient({
      baseUrl: BASE,
      getToken: async () => "tok",
      request: async () => {
        throw new Error("offline");
      },
    });
    const result = await c.getIssue("ABC-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual({ kind: "network", message: "offline" });
  });

  it("returns parse on malformed body", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/issue/ABC-1`, () =>
        HttpResponse.json({ key: "ABC-1" /* no fields */ }),
      ),
    );
    const result = await client("tok-abc").getIssue("ABC-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("parse");
  });

  it("returns no-token when token missing", async () => {
    const result = await client(null).getIssue("ABC-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual({ kind: "no-token" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/jira-client.test.ts`
Expected: 7 new tests fail with `client(...).getIssue is not a function` or similar.

- [ ] **Step 3: Implement `getIssue`**

In `src/jira-client.ts`:

a) Extend `JiraError`:

```ts
export type JiraError =
  | { kind: "no-token" }
  | { kind: "auth"; status: 401 | 403; message: string }
  | { kind: "not-found"; key: string }
  | { kind: "http"; status: number; message: string }
  | { kind: "network"; message: string }
  | { kind: "parse"; message: string };
```

b) Add `Issue` type:

```ts
export type Issue = {
  key: string;
  summary: string;
  status: { name: string; categoryColor: string };
  issueType: { name: string; iconUrl: string };
  priority: { name: string; iconUrl: string } | null;
  assignee: { displayName: string } | null;
  reporter: { displayName: string };
  updated: string;
};
```

c) Extend `JiraClient` interface:

```ts
export interface JiraClient {
  getCurrentUser(): Promise<Result<CurrentUser, JiraError>>;
  getIssue(key: string): Promise<Result<Issue, JiraError>>;
}
```

d) Implement inside `createJiraClient`'s returned object, alongside `getCurrentUser`:

```ts
async getIssue(key) {
  const token = await opts.getToken();
  if (!token) return { ok: false, error: { kind: "no-token" } };

  const fields = "summary,status,issuetype,priority,assignee,reporter,updated";
  let response: HttpResponseLike;
  try {
    response = await request({
      url: `${base}/rest/api/2/issue/${encodeURIComponent(key)}?fields=${fields}`,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
  } catch (e) {
    return { ok: false, error: { kind: "network", message: (e as Error).message } };
  }

  if (response.status === 404) {
    return { ok: false, error: { kind: "not-found", key } };
  }
  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      error: { kind: "auth", status: response.status, message: await safeText(response) },
    };
  }
  if (response.status < 200 || response.status >= 300) {
    return {
      ok: false,
      error: { kind: "http", status: response.status, message: await safeText(response) },
    };
  }

  try {
    const body = (await response.json()) as { key?: unknown; fields?: Record<string, unknown> };
    const f = body.fields;
    if (!f || typeof body.key !== "string") {
      return { ok: false, error: { kind: "parse", message: "missing key or fields" } };
    }
    const summary = typeof f.summary === "string" ? f.summary : null;
    const status = f.status as { name?: string; statusCategory?: { colorName?: string } } | undefined;
    const issuetype = f.issuetype as { name?: string; iconUrl?: string } | undefined;
    const reporter = f.reporter as { displayName?: string } | undefined;
    const updated = typeof f.updated === "string" ? f.updated : null;
    if (
      !summary ||
      !status?.name ||
      !status.statusCategory?.colorName ||
      !issuetype?.name ||
      !issuetype.iconUrl ||
      !reporter?.displayName ||
      !updated
    ) {
      return { ok: false, error: { kind: "parse", message: "missing required fields" } };
    }
    const priorityRaw = f.priority as { name?: string; iconUrl?: string } | null | undefined;
    const assigneeRaw = f.assignee as { displayName?: string } | null | undefined;
    return {
      ok: true,
      value: {
        key: body.key,
        summary,
        status: { name: status.name, categoryColor: status.statusCategory.colorName },
        issueType: { name: issuetype.name, iconUrl: issuetype.iconUrl },
        priority:
          priorityRaw && priorityRaw.name && priorityRaw.iconUrl
            ? { name: priorityRaw.name, iconUrl: priorityRaw.iconUrl }
            : null,
        assignee:
          assigneeRaw && assigneeRaw.displayName
            ? { displayName: assigneeRaw.displayName }
            : null,
        reporter: { displayName: reporter.displayName },
        updated,
      },
    };
  } catch (e) {
    return { ok: false, error: { kind: "parse", message: (e as Error).message } };
  }
},
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/jira-client.test.ts`
Expected: all `getIssue` cases PASS, existing `getCurrentUser` cases still PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/earchibald/Projects/jira-bases && git add src/jira-client.ts src/jira-client.test.ts && git commit -m "feat(jira-client): add getIssue with not-found error kind"
```

---

## Task 3: `parseKeyOrUrl` / `extractKeyFromHref` helpers (TDD)

**Files:**
- Create: `/Users/earchibald/Projects/jira-bases/src/jira-key.ts`
- Create: `/Users/earchibald/Projects/jira-bases/src/jira-key.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/jira-key.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseKeyOrUrl, extractKeyFromHref } from "./jira-key";

describe("parseKeyOrUrl", () => {
  it("accepts a bare key", () => {
    expect(parseKeyOrUrl("ABC-123", "https://jira.me.com")).toBe("ABC-123");
  });
  it("accepts a key with surrounding whitespace", () => {
    expect(parseKeyOrUrl("  ABC-123  ", "https://jira.me.com")).toBe("ABC-123");
  });
  it("extracts a key from a browse URL on the configured host", () => {
    expect(
      parseKeyOrUrl("https://jira.me.com/browse/ABC-123", "https://jira.me.com"),
    ).toBe("ABC-123");
  });
  it("extracts a key from a browse URL with query/fragment", () => {
    expect(
      parseKeyOrUrl("https://jira.me.com/browse/ABC-123?focusedCommentId=1", "https://jira.me.com"),
    ).toBe("ABC-123");
  });
  it("rejects a URL on a different host", () => {
    expect(parseKeyOrUrl("https://other.com/browse/ABC-123", "https://jira.me.com")).toBeNull();
  });
  it("rejects garbage input", () => {
    expect(parseKeyOrUrl("hello world", "https://jira.me.com")).toBeNull();
    expect(parseKeyOrUrl("", "https://jira.me.com")).toBeNull();
    expect(parseKeyOrUrl("abc-123", "https://jira.me.com")).toBeNull(); // lowercase project
  });
  it("tolerates trailing slash on baseUrl", () => {
    expect(
      parseKeyOrUrl("https://jira.me.com/browse/ABC-1", "https://jira.me.com/"),
    ).toBe("ABC-1");
  });
});

describe("extractKeyFromHref", () => {
  it("returns key for matching href", () => {
    expect(
      extractKeyFromHref("https://jira.me.com/browse/PROJ-42", "https://jira.me.com"),
    ).toBe("PROJ-42");
  });
  it("returns null for non-matching host", () => {
    expect(
      extractKeyFromHref("https://elsewhere.com/browse/PROJ-42", "https://jira.me.com"),
    ).toBeNull();
  });
  it("returns null for matching host but non-browse path", () => {
    expect(
      extractKeyFromHref("https://jira.me.com/issues/PROJ-42", "https://jira.me.com"),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/jira-key.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/jira-key.ts`:

```ts
const KEY_RE = /^[A-Z][A-Z0-9]+-\d+$/;
const URL_KEY_RE = /\/browse\/([A-Z][A-Z0-9]+-\d+)(?:[/?#]|$)/;

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, "");
}

export function parseKeyOrUrl(input: string, baseUrl: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (KEY_RE.test(trimmed)) return trimmed;
  return extractKeyFromHref(trimmed, baseUrl);
}

export function extractKeyFromHref(href: string, baseUrl: string): string | null {
  const base = normalizeBase(baseUrl);
  if (!href.startsWith(base + "/")) return null;
  const m = href.match(URL_KEY_RE);
  return m ? m[1] : null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/jira-key.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/earchibald/Projects/jira-bases && git add src/jira-key.ts src/jira-key.test.ts && git commit -m "feat(jira-key): add key/URL parsing helpers"
```

---

## Task 4: `IssueCache` (TDD)

**Files:**
- Create: `/Users/earchibald/Projects/jira-bases/src/issue-cache.ts`
- Create: `/Users/earchibald/Projects/jira-bases/src/issue-cache.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/issue-cache.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createIssueCache, CACHE_TTL_MS } from "./issue-cache";
import type { Issue } from "./jira-client";

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
    // Implementations may clear inflight on settle; either behaviour is OK,
    // but most callers will replace it with set() before reading again.
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/issue-cache.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/issue-cache.ts`:

```ts
import type { Issue, JiraError, Result } from "./jira-client";

export const CACHE_TTL_MS = 5 * 60 * 1000;

type Entry = { issue: Issue; fetchedAt: number };

export interface IssueCache {
  get(key: string): { issue: Issue; fresh: boolean } | null;
  set(key: string, issue: Issue): void;
  inflight(key: string): Promise<Result<Issue, JiraError>> | null;
  trackInflight(key: string, p: Promise<Result<Issue, JiraError>>): void;
}

export function createIssueCache(now: () => number = () => Date.now()): IssueCache {
  const entries = new Map<string, Entry>();
  const pending = new Map<string, Promise<Result<Issue, JiraError>>>();

  return {
    get(key) {
      const e = entries.get(key);
      if (!e) return null;
      return { issue: e.issue, fresh: now() - e.fetchedAt < CACHE_TTL_MS };
    },
    set(key, issue) {
      entries.set(key, { issue, fetchedAt: now() });
    },
    inflight(key) {
      return pending.get(key) ?? null;
    },
    trackInflight(key, p) {
      pending.set(key, p);
      void p.finally(() => {
        if (pending.get(key) === p) pending.delete(key);
      });
    },
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/issue-cache.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/earchibald/Projects/jira-bases && git add src/issue-cache.ts src/issue-cache.test.ts && git commit -m "feat(issue-cache): in-memory TTL cache with inflight coalescing"
```

---

## Task 5: `IssueService` (TDD)

**Files:**
- Create: `/Users/earchibald/Projects/jira-bases/src/issue-service.ts`
- Create: `/Users/earchibald/Projects/jira-bases/src/issue-service.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/issue-service.test.ts`:

```ts
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
  // Let microtasks flush.
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/issue-service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/issue-service.ts`:

```ts
import type { Issue, JiraClient, JiraError, Result } from "./jira-client";
import type { IssueCache } from "./issue-cache";

export type LookupResult =
  | { state: "loading" }
  | { state: "ok"; issue: Issue; refreshing: false }
  | { state: "stale"; issue: Issue; refreshing: true }
  | { state: "error"; error: JiraError };

export interface IssueService {
  lookup(key: string, onUpdate: (r: LookupResult) => void): void;
}

export function createIssueService(client: JiraClient, cache: IssueCache): IssueService {
  function fetchAndCache(key: string): Promise<Result<Issue, JiraError>> {
    const existing = cache.inflight(key);
    if (existing) return existing;
    const p = client.getIssue(key).then((r) => {
      if (r.ok) cache.set(key, r.value);
      return r;
    });
    cache.trackInflight(key, p);
    return p;
  }

  return {
    lookup(key, onUpdate) {
      const hit = cache.get(key);
      if (hit && hit.fresh) {
        onUpdate({ state: "ok", issue: hit.issue, refreshing: false });
        return;
      }
      if (hit && !hit.fresh) {
        onUpdate({ state: "stale", issue: hit.issue, refreshing: true });
        void fetchAndCache(key).then((r) => {
          if (r.ok) onUpdate({ state: "ok", issue: r.value, refreshing: false });
          // On refetch error: emit nothing, keep showing stale data.
        });
        return;
      }
      onUpdate({ state: "loading" });
      void fetchAndCache(key).then((r) => {
        if (r.ok) onUpdate({ state: "ok", issue: r.value, refreshing: false });
        else onUpdate({ state: "error", error: r.error });
      });
    },
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/issue-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/earchibald/Projects/jira-bases && git add src/issue-service.ts src/issue-service.test.ts && git commit -m "feat(issue-service): stale-while-revalidate lookup with coalescing"
```

---

## Task 6: `IssuePreviewView` (TDD, jsdom)

**Files:**
- Create: `/Users/earchibald/Projects/jira-bases/src/issue-preview-view.ts`
- Create: `/Users/earchibald/Projects/jira-bases/src/issue-preview-view.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/issue-preview-view.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderIssue } from "./issue-preview-view";
import type { Issue } from "./jira-client";

const ISSUE: Issue = {
  key: "ABC-1",
  summary: "A sample issue",
  status: { name: "In Progress", categoryColor: "yellow" },
  issueType: { name: "Task", iconUrl: "https://jira.me.com/it.png" },
  priority: { name: "High", iconUrl: "https://jira.me.com/p.png" },
  assignee: { displayName: "Alice" },
  reporter: { displayName: "Bob" },
  updated: "2026-04-15T10:00:00.000+0000",
};

const CTX = { baseUrl: "https://jira.me.com" };

describe("renderIssue", () => {
  let el: HTMLElement;
  beforeEach(() => {
    el = document.createElement("div");
  });

  it("renders all seven fields on ok state", () => {
    renderIssue(el, { state: "ok", issue: ISSUE, refreshing: false }, CTX);
    expect(el.querySelector(".jb-key")?.textContent).toBe("ABC-1");
    const link = el.querySelector(".jb-key a") as HTMLAnchorElement | null;
    expect(link?.href).toBe("https://jira.me.com/browse/ABC-1");
    expect(el.querySelector(".jb-summary")?.textContent).toBe("A sample issue");
    expect(el.querySelector(".jb-status")?.textContent).toContain("In Progress");
    expect(el.querySelector(".jb-issuetype")?.textContent).toContain("Task");
    expect(el.querySelector(".jb-priority")?.textContent).toContain("High");
    expect(el.querySelector(".jb-assignee")?.textContent).toContain("Alice");
    expect(el.querySelector(".jb-reporter")?.textContent).toContain("Bob");
    expect(el.querySelector(".jb-updated")?.textContent).toMatch(/ago|Apr/);
  });

  it("renders 'Unassigned' when assignee is null", () => {
    renderIssue(
      el,
      { state: "ok", issue: { ...ISSUE, assignee: null }, refreshing: false },
      CTX,
    );
    expect(el.querySelector(".jb-assignee")?.textContent).toContain("Unassigned");
  });

  it("renders refreshing indicator on stale state", () => {
    renderIssue(el, { state: "stale", issue: ISSUE, refreshing: true }, CTX);
    expect(el.querySelector(".jb-refreshing")).not.toBeNull();
    expect(el.querySelector(".jb-summary")?.textContent).toBe("A sample issue");
  });

  it("renders a loading state", () => {
    renderIssue(el, { state: "loading" }, CTX);
    expect(el.querySelector(".jb-loading")).not.toBeNull();
  });

  it("renders distinct error message per kind", () => {
    const cases: Array<[Parameters<typeof renderIssue>[1], RegExp]> = [
      [{ state: "error", error: { kind: "no-token" } }, /Personal Access Token/],
      [{ state: "error", error: { kind: "auth", status: 401, message: "" } }, /Authentication failed/],
      [{ state: "error", error: { kind: "not-found", key: "XYZ-9" } }, /XYZ-9 not found/],
      [{ state: "error", error: { kind: "network", message: "x" } }, /Couldn.?t reach JIRA/],
      [{ state: "error", error: { kind: "http", status: 500, message: "" } }, /HTTP 500/],
      [{ state: "error", error: { kind: "parse", message: "x" } }, /Unexpected response/],
    ];
    for (const [state, re] of cases) {
      const e = document.createElement("div");
      renderIssue(e, state, CTX);
      expect(e.querySelector(".jb-error")?.textContent ?? "").toMatch(re);
    }
  });

  it("is idempotent — re-rendering replaces content", () => {
    renderIssue(el, { state: "loading" }, CTX);
    renderIssue(el, { state: "ok", issue: ISSUE, refreshing: false }, CTX);
    expect(el.querySelector(".jb-loading")).toBeNull();
    expect(el.querySelector(".jb-summary")?.textContent).toBe("A sample issue");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/issue-preview-view.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/issue-preview-view.ts`:

```ts
import type { Issue, JiraError } from "./jira-client";
import type { LookupResult } from "./issue-service";

export interface RenderCtx {
  baseUrl: string;
}

export function renderIssue(el: HTMLElement, state: LookupResult, ctx: RenderCtx): void {
  el.empty?.(); // Obsidian extension; fallback below
  while (el.firstChild) el.removeChild(el.firstChild);
  el.classList.add("jb-issue-preview");

  switch (state.state) {
    case "loading":
      append(el, "div", "jb-loading", "Loading…");
      return;
    case "error":
      append(el, "div", "jb-error", errorMessage(state.error));
      return;
    case "ok":
    case "stale":
      renderOk(el, state.issue, ctx);
      if (state.state === "stale") {
        append(el, "div", "jb-refreshing", "Refreshing…");
      }
      return;
  }
}

function renderOk(el: HTMLElement, issue: Issue, ctx: RenderCtx): void {
  const baseUrl = ctx.baseUrl.replace(/\/+$/, "");

  const header = append(el, "div", "jb-header");
  const keyEl = append(header, "span", "jb-key");
  const link = document.createElement("a");
  link.href = `${baseUrl}/browse/${issue.key}`;
  link.textContent = issue.key;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  keyEl.appendChild(link);

  append(el, "div", "jb-summary", issue.summary);

  const meta = append(el, "div", "jb-meta");
  append(meta, "span", "jb-status", issue.status.name).dataset.color =
    issue.status.categoryColor;
  append(meta, "span", "jb-issuetype", issue.issueType.name);
  if (issue.priority) {
    append(meta, "span", "jb-priority", issue.priority.name);
  } else {
    append(meta, "span", "jb-priority", "No priority");
  }

  const people = append(el, "div", "jb-people");
  append(people, "span", "jb-assignee", issue.assignee?.displayName ?? "Unassigned");
  append(people, "span", "jb-reporter", `Reporter: ${issue.reporter.displayName}`);

  append(el, "div", "jb-updated", `Updated ${formatRelative(issue.updated)}`);
}

function append(parent: HTMLElement, tag: string, cls: string, text?: string): HTMLElement {
  const el = document.createElement(tag);
  el.className = cls;
  if (text !== undefined) el.textContent = text;
  parent.appendChild(el);
  return el;
}

export function errorMessage(err: JiraError): string {
  switch (err.kind) {
    case "no-token":
      return "Set your JIRA Personal Access Token in plugin settings.";
    case "auth":
      return `Authentication failed (HTTP ${err.status}). Check your PAT.`;
    case "not-found":
      return `Issue ${err.key} not found.`;
    case "network":
      return "Couldn't reach JIRA.";
    case "http":
      return `JIRA returned HTTP ${err.status}.`;
    case "parse":
      return "Unexpected response from JIRA.";
  }
}

function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diffMs = Date.now() - t;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(t).toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/issue-preview-view.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/earchibald/Projects/jira-bases && git add src/issue-preview-view.ts src/issue-preview-view.test.ts && git commit -m "feat(issue-preview-view): shared pure-DOM renderer"
```

---

## Task 7: `LookupModal` (manual smoke; no automated tests)

**Files:**
- Create: `/Users/earchibald/Projects/jira-bases/src/lookup-modal.ts`

- [ ] **Step 1: Implement the modal**

Create `src/lookup-modal.ts`:

```ts
import { App, Modal, Notice, Setting } from "obsidian";
import type { IssueService } from "./issue-service";
import { renderIssue, errorMessage } from "./issue-preview-view";
import { parseKeyOrUrl } from "./jira-key";

export class LookupModal extends Modal {
  private input = "";
  constructor(
    app: App,
    private readonly service: IssueService,
    private readonly baseUrl: string,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText("JIRA: Look up issue");

    new Setting(contentEl)
      .setName("Issue key or URL")
      .addText((t) =>
        t
          .setPlaceholder("ABC-123 or https://jira.me.com/browse/ABC-123")
          .onChange((v) => (this.input = v)),
      );

    const resultEl = contentEl.createDiv({ cls: "jb-lookup-result" });

    new Setting(contentEl).addButton((b) =>
      b
        .setButtonText("Look up")
        .setCta()
        .onClick(() => this.runLookup(resultEl)),
    );
  }

  private runLookup(resultEl: HTMLElement): void {
    const key = parseKeyOrUrl(this.input, this.baseUrl);
    if (!key) {
      new Notice(`Couldn't parse '${this.input}' as a JIRA key or URL.`);
      return;
    }
    this.service.lookup(key, (state) => {
      renderIssue(resultEl, state, { baseUrl: this.baseUrl });
      if (state.state === "error") {
        new Notice(errorMessage(state.error));
      }
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/earchibald/Projects/jira-bases && git add src/lookup-modal.ts && git commit -m "feat(lookup-modal): command-palette issue lookup modal"
```

---

## Task 8: `HoverPreview` (manual smoke; no automated tests)

**Files:**
- Create: `/Users/earchibald/Projects/jira-bases/src/hover-preview.ts`

- [ ] **Step 1: Implement**

Create `src/hover-preview.ts`:

```ts
import { App, HoverPopover, Plugin } from "obsidian";
import type { IssueService } from "./issue-service";
import { extractKeyFromHref } from "./jira-key";
import { renderIssue } from "./issue-preview-view";

export function registerHoverPreview(
  plugin: Plugin,
  service: IssueService,
  getBaseUrl: () => string,
): void {
  plugin.registerDomEvent(document, "mouseover", (evt) => {
    const target = evt.target as HTMLElement | null;
    if (!target) return;
    const anchor = target.closest("a") as HTMLAnchorElement | null;
    if (!anchor) return;
    if (anchor.dataset.jbHoverBound === "1") return;

    const baseUrl = getBaseUrl();
    if (!baseUrl) return;
    const key = extractKeyFromHref(anchor.href, baseUrl);
    if (!key) return;

    anchor.dataset.jbHoverBound = "1";
    anchor.addEventListener(
      "mouseenter",
      () => openPopover(plugin.app, anchor, key, service, baseUrl),
      { once: false },
    );
    // Trigger on the current event too — user is already hovering.
    openPopover(plugin.app, anchor, key, service, baseUrl);
  });
}

function openPopover(
  _app: App,
  anchor: HTMLAnchorElement,
  key: string,
  service: IssueService,
  baseUrl: string,
): void {
  // HoverPopover constructor signature: (parent, targetEl, waitTime?)
  // `parent` should be a Component; the active leaf works in practice. We use a
  // throwaway Component-like object via the anchor's parent view; the simplest
  // safe approach is to attach to the anchor itself by casting.
  const popover = new HoverPopover(anchor as unknown as never, anchor);
  service.lookup(key, (state) => {
    renderIssue(popover.hoverEl, state, { baseUrl });
  });
}
```

> **Note for the implementer:** `HoverPopover`'s typed `parent` argument expects a `Component`. Passing the anchor element works at runtime in current Obsidian builds but is a known soft spot — if you're seeing the popover not closing on `mouseleave`, switch to passing the active `MarkdownView` (resolve via `app.workspace.getActiveViewOfType(MarkdownView)`). Do NOT introduce the change speculatively; verify the failure first.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/earchibald/Projects/jira-bases && git add src/hover-preview.ts && git commit -m "feat(hover-preview): hover-triggered issue popover on browse links"
```

---

## Task 9: Wire into `main.ts`

**Files:**
- Modify: `/Users/earchibald/Projects/jira-bases/src/main.ts`
- Modify: `/Users/earchibald/Projects/jira-bases/manifest.json`

- [ ] **Step 1: Bump version in `manifest.json`**

Change `"version": "0.2.0"` (or whatever current) to `"version": "0.3.0"`. Verify by reading the file first; do not assume the prior value.

- [ ] **Step 2: Modify `main.ts` to wire the new pieces**

Inside `JiraBasesPlugin`:

a) Add fields:

```ts
private cache = createIssueCache();
private clientForCurrent: JiraClient | null = null;
```

b) Add a helper:

```ts
private buildClient(baseUrl: string): JiraClient {
  return createJiraClient({
    baseUrl,
    getToken: () => this.secrets.get(baseUrl),
    request: obsidianRequest,
  });
}
```

c) In `onload()`, after registering the existing test-connection command, add:

```ts
const service = createIssueService(
  {
    getCurrentUser: async () => {
      throw new Error("not used by hover/lookup");
    },
    getIssue: async (key) => {
      const baseUrl = this.settings.baseUrl;
      if (!baseUrl) return { ok: false, error: { kind: "no-token" } };
      return this.buildClient(baseUrl).getIssue(key);
    },
  },
  this.cache,
);

registerHoverPreview(this, service, () => this.settings.baseUrl ?? "");

this.addCommand({
  id: "lookup-issue",
  name: "JIRA: Look up issue…",
  callback: () => {
    const baseUrl = this.settings.baseUrl;
    if (!baseUrl) {
      new Notice("Set your JIRA base URL in plugin settings.");
      return;
    }
    new LookupModal(this.app, service, baseUrl).open();
  },
});
```

d) Update imports at the top of the file:

```ts
import { createIssueCache } from "./issue-cache";
import { createIssueService } from "./issue-service";
import { registerHoverPreview } from "./hover-preview";
import { LookupModal } from "./lookup-modal";
import type { JiraClient } from "./jira-client";
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds, `main.js` regenerated.

- [ ] **Step 4: Typecheck and run all tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Manual smoke (REQUIRED before commit)**

In a dev vault with the plugin installed and a real JIRA DC base URL + PAT configured:

1. Create a note containing `[ABC-123 …](https://<your-jira>/browse/ABC-123)` with a real key.
2. Open the note in reading view, hover the link → popover appears with the seven fields.
3. Open the command palette → "JIRA: Look up issue…" → enter a key → modal renders the same preview.
4. Try a non-existent key → "Issue XYZ-9 not found."
5. Disable network briefly, hover a different (uncached) key → "Couldn't reach JIRA."
6. Hover the same valid link twice within a minute → second hover is instant (cache hit).

If any step fails, fix before committing. Do NOT mark this task complete based on tests + typecheck alone.

- [ ] **Step 6: Commit**

```bash
cd /Users/earchibald/Projects/jira-bases && git add src/main.ts manifest.json && git commit -m "feat(main): wire hover preview and lookup command"
```

---

## Task 10: README update

**Files:**
- Modify: `/Users/earchibald/Projects/jira-bases/README.md`

- [ ] **Step 1: Update README to document v0.3 features**

Read the current README first to preserve existing content. Replace the `## Status` and `## Verify` sections (or append a new `## Features (v0.3)` section if those don't exist by then) with:

```markdown
## Features (v0.3)

- **Hover preview:** mouse over any link to `<your-jira>/browse/<KEY>` to see issue summary, status, type, priority, assignee, reporter, and last-updated time. Cached for 5 minutes; stale entries refresh in the background.
- **Look up an issue:** open the command palette → "JIRA: Look up issue…" → enter a key (`ABC-123`) or paste a browse URL.
- **Test connection:** still available; verifies your base URL + PAT.
```

Bump the `## Status` line to `v0.3 (issue lookup & preview)`.

- [ ] **Step 2: Commit**

```bash
cd /Users/earchibald/Projects/jira-bases && git add README.md && git commit -m "docs: README updates for v0.3 hover preview and lookup"
```

---

## Final Verification

- [ ] **Step 1: All tests pass**

Run: `npm test`
Expected: PASS (existing + new).

- [ ] **Step 2: Typecheck clean**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Build clean**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Smoke test against a real JIRA DC instance**

Re-run Task 9 Step 5 end-to-end. Confirm hover popover, lookup modal, error states, and cache behaviour all work.

- [ ] **Step 5: Confirm spec coverage**

Cross-check against `docs/superpowers/specs/2026-04-17-jira-issue-preview-design.md`:

- Hover preview surface ✓ (Task 8 + 9)
- Command-palette lookup ✓ (Task 7 + 9)
- Seven standard fields rendered ✓ (Task 6)
- `getIssue` + `not-found` ✓ (Task 2)
- TTL cache + coalescing ✓ (Task 4)
- Stale-while-revalidate, no emit on stale-refetch error ✓ (Task 5)
- Inline error rendering; modal also emits Notice ✓ (Tasks 6, 7)
- Shared `renderIssue` reused by both surfaces ✓ (Task 6 → 7, 8)
