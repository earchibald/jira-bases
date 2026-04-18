# jira-bases v0.3 — Issue Lookup & Preview

**Date:** 2026-04-17
**Status:** Design approved, pending implementation plan
**Depends on:** v0.1 (foundation: `SecretStore`, `JiraClient`, settings)

## Goal

Let the user glance at JIRA issue metadata without leaving Obsidian. Two surfaces share one fetch/cache path:

1. **Hover preview** over any rendered link to `<baseUrl>/browse/<KEY>` (including v0.2 smart links).
2. **Command-palette lookup** — "JIRA: Look up issue…" → key or URL → preview in a modal.

## Non-Goals (v0.3)

- Sidebar panel (deferred to v0.4)
- Issue description rendering (ADF / wiki markup)
- Write actions (comments, transitions, edits)
- Hover preview inside source-mode raw markdown
- Configurable preview field set
- Persistent cache across plugin reloads
- Multiple JIRA instances

## Fields Shown

Fixed set of seven, sufficient to answer "what is this and should I click through?":

- Key (linked back to `<baseUrl>/browse/<KEY>`)
- Summary
- Status (with category color)
- Issue Type (icon + name)
- Priority (icon + name)
- Assignee (display name; "Unassigned" if null)
- Reporter (display name)
- Updated (relative time, e.g., "3 days ago")

## Architecture

Extends v0.1's three units. Adds two pure-TS units (cache, service) and three Obsidian-facing units (hover, modal, view). Cache and service are framework-free and fully unit-tested.

### `JiraClient` (extend)

Add one method and one error kind. No other changes.

```ts
interface JiraClient {
  getCurrentUser(): Promise<Result<CurrentUser, JiraError>>; // existing
  getIssue(key: string): Promise<Result<Issue, JiraError>>;  // new
}

type Issue = {
  key: string;
  summary: string;
  status: { name: string; categoryColor: string };
  issueType: { name: string; iconUrl: string };
  priority: { name: string; iconUrl: string } | null;
  assignee: { displayName: string } | null;
  reporter: { displayName: string };
  updated: string; // ISO 8601
};

type JiraError =
  | { kind: "no-token" }
  | { kind: "auth"; status: 401 | 403; message: string }
  | { kind: "not-found"; key: string }            // new
  | { kind: "network"; message: string }
  | { kind: "parse"; message: string }
  | { kind: "http"; status: number; message: string };
```

`getIssue` calls `GET /rest/api/2/issue/{key}?fields=summary,status,issuetype,priority,assignee,reporter,updated`. Maps HTTP 404 to `{ kind: "not-found", key }`. Other status codes follow existing v0.1 mapping.

### `IssueCache` (new)

Pure TS. No I/O, no Obsidian.

```ts
interface IssueCache {
  get(key: string): { issue: Issue; fresh: boolean } | null;
  set(key: string, issue: Issue): void;
  // In-flight request coalescing:
  inflight(key: string): Promise<Result<Issue, JiraError>> | null;
  trackInflight(key: string, p: Promise<Result<Issue, JiraError>>): void;
}
```

- TTL: 5 minutes (constant `CACHE_TTL_MS`).
- `fresh = (now - fetchedAt) < CACHE_TTL_MS`.
- `inflight` returns the in-flight promise if a fetch for `key` is already running, so concurrent hovers coalesce into one network call.
- Cleared on plugin unload (process-local `Map`).

### `IssueService` (new)

Orchestrates `JiraClient` + `IssueCache`. Single public method:

```ts
type LookupResult =
  | { state: "loading" }                              // miss + fetch in flight (initial)
  | { state: "ok"; issue: Issue; refreshing: false }  // cache fresh OR fetch resolved
  | { state: "stale"; issue: Issue; refreshing: true }// cache stale, refetch in flight
  | { state: "error"; error: JiraError };

interface IssueService {
  lookup(key: string, onUpdate: (r: LookupResult) => void): void;
}
```

`lookup` is callback-driven so the same call can emit multiple states (stale → ok). Behavior:

- **Hit fresh:** emit `ok` once.
- **Hit stale:** emit `stale` immediately; kick off background refetch via `JiraClient`; on success emit `ok`. On refetch error, **emit nothing** — keep showing the stale data (the user already has something useful; replacing it with an error is worse than keeping slightly old data). The next user-initiated lookup will retry.
- **Miss:** emit `loading`; await fetch; emit `ok` or `error`.
- **Coalescing:** if `inflight(key)` exists, attach to it instead of starting a new fetch.

### `HoverPreview` (new, Obsidian-facing)

Registers on workspace via `registerDomEvent(document, "mouseover", handler)`. Handler:

1. Find the closest `<a>`. If none, return.
2. Read `href`. If it doesn't start with `<settings.baseUrl>/browse/`, return.
3. Extract the key with regex `/\/browse\/([A-Z][A-Z0-9]+-\d+)(?:[?#]|$)/`.
4. Call `IssueService.lookup(key, render)`. `render` writes into an Obsidian `HoverPopover` anchored to the link.

Each popover is single-use; closes on `mouseleave` of both link and popover (Obsidian's built-in HoverPopover behavior).

### `LookupModal` (new, Obsidian-facing)

Obsidian `Modal` subclass. UI: text input + "Look up" button. On submit:

1. Parse input as key (`/^[A-Z][A-Z0-9]+-\d+$/`) or URL (extract via the same regex). On parse failure → `Notice("Couldn't parse '<input>' as a JIRA key or URL")`, leave modal open.
2. On parsed key → swap modal body to a render container; call `IssueService.lookup(key, render)`.
3. Errors: render inline AND emit `Notice` with the same message (modal is user-initiated).

### `IssuePreviewView` (new, shared)

```ts
function renderIssue(el: HTMLElement, state: LookupResult, ctx: { baseUrl: string }): void;
```

Pure DOM rendering. Used by both `HoverPreview` and `LookupModal` so the two surfaces look identical and any future surface (e.g., sidebar) plugs in trivially. Idempotent — safe to call repeatedly on the same element as state evolves.

### `JiraBasesPlugin` (extend)

- Construct `IssueCache` and `IssueService` on load; reuse the existing `JiraClient`.
- Register `HoverPreview` (DOM listener).
- Register command `jira-bases:lookup-issue` → opens `LookupModal`.
- Tear down listener and clear cache on unload.

## Data Flow

```
Hover
─────
mouseover → match <a href="…/browse/KEY"> → extract KEY
  ↓
IssueService.lookup(KEY, render)
  ├─ cache hit fresh   → render({state:"ok", issue})
  ├─ cache hit stale   → render({state:"stale", issue, refreshing:true})
  │                       fetch in background
  │                       on success → render({state:"ok", issue})
  │                       on error   → no emit (stale data stays on screen)
  ├─ cache miss        → render({state:"loading"})
  │                       await fetch
  │                       on success → cache.set; render({state:"ok"})
  │                       on error   → render({state:"error"})
  └─ inflight exists   → attach to existing promise (no extra fetch)

Command-palette
───────────────
"JIRA: Look up issue…" → LookupModal opens
  ↓
user submits "ABC-123" or "https://jira.me.com/browse/ABC-123"
  ↓
parse → key OR Notice(parse error) and stay open
  ↓
IssueService.lookup(key, render-into-modal-body)
  ↓
on error → render inline + Notice
on ok    → render inline
```

## Error Handling

| Kind | Inline message (popover & modal body) | Notice (modal only) |
|---|---|---|
| no-token | "Set your JIRA Personal Access Token in plugin settings." | same |
| auth | "Authentication failed (HTTP \<status\>). Check your PAT." | same |
| not-found | "Issue \<KEY\> not found." | same |
| network | "Couldn't reach JIRA." | same |
| http | "JIRA returned HTTP \<status\>." | same |
| parse (response) | "Unexpected response from JIRA." | same |
| parse (input, modal only) | n/a (modal stays open) | "Couldn't parse '\<input\>' as a JIRA key or URL." |

Hover never emits a Notice — failures stay confined to the popover the user is already looking at.

## Persistence

None added in v0.3. Cache is in-memory only; cleared on plugin reload. No new entries in `data.json`.

## Testing

- **`IssueCache`** — unit tests: TTL boundary, set/get round-trip, inflight tracking, eviction-on-set replaces existing entry.
- **`IssueService`** — unit tests with a fake `JiraClient`: miss → ok, miss → error, hit-fresh, hit-stale (verifies two callback emissions: stale then ok), coalesced concurrent lookups (single fetch, both callbacks fire).
- **`JiraClient.getIssue`** — `vitest` + `msw`: 200 (field mapping), 401, 404 (→ `not-found`), 500, network error, malformed JSON.
- **`IssuePreviewView`** — JSDOM: renders all seven fields on `ok`; renders correct message per error kind; renders "refreshing" indicator on `stale`.
- **`HoverPreview`, `LookupModal`** — manual smoke test in a dev vault against real JIRA DC.

## Repo Changes

**New files:**
- `src/issue-cache.ts` + `src/issue-cache.test.ts`
- `src/issue-service.ts` + `src/issue-service.test.ts`
- `src/issue-preview-view.ts` + `src/issue-preview-view.test.ts`
- `src/hover-preview.ts`
- `src/lookup-modal.ts`

**Modified:**
- `src/jira-client.ts` — add `getIssue`, `Issue` type, `not-found` error kind.
- `src/jira-client.test.ts` — add `getIssue` cases.
- `src/main.ts` — wire up cache, service, hover listener, command.
- `README.md` — document hover + lookup command.

No new runtime dependencies. Existing `vitest`/`msw` cover the new tests; add `jsdom` (already typically transitive via `vitest`) if not present for `IssuePreviewView` tests.

## Open Questions (deferred, not blocking v0.3)

- Hover in source-mode raw markdown — defer; current scope covers reading view and live preview where Obsidian renders links as `<a>`.
- Description rendering (ADF / wiki markup) — defer; risky tar-pit, not needed for the "should I click through?" use case.
- Configurable preview fields — defer; ship the fixed seven, revisit after usage.
- Persistent cache across reloads — defer; in-memory is sufficient for typical session length.
- Sidebar panel (v0.4 candidate).
