# jira-bases v0.3 — Bases Index & Issue Stubs

**Date:** 2026-04-17
**Status:** Design approved, pending implementation plan
**Builds on:** v0.1 foundation (PAT auth, `JiraClient`, `SecretStore`). Parallel to v0.2 (link insertion) in `feat/link-insertion` worktree.

## Goal

Let users correlate notes with JIRA issues so Obsidian Bases can answer both directions:

- **Note-centric:** for any note, which JIRA issues does it touch?
- **Issue-centric:** for any JIRA issue, which notes touched it, and what's its live status?

A single daily note listing a dozen issues is treated the same as a note referencing one — both participate in the same index.

## Approach

Two frontmatter-driven artifacts maintained by the plugin:

1. **`jira_issues` frontmatter list** on any note that references issues. Populated by scanning note content for JIRA links and (optionally) bare keys. Updated automatically on save.
2. **Stub notes** — one per referenced issue at `{stubsFolder}/{KEY}.md` — with live JIRA fields as frontmatter, a short body, and a preserved user-editable `## Notes` section. Populated/refreshed by an explicit command; no background JIRA traffic.

Obsidian's backlinks give issue-centric correlation for free once stubs exist (real notes link to `JIRA/ABC-123.md`, stubs' `file.backlinks` lists them). Bases are user-authored over the resulting shape; starter `.base` files are deferred to a later slice.

## User-facing surface

### Commands

- **`jira-bases:rescan-note`** — scans the active file now; writes `jira_issues` frontmatter. Useful when auto-on-save was disabled or bypassed.
- **`jira-bases:sync-issue-stubs`** — unions all `jira_issues` keys across the vault, ensures a stub exists for each, and refreshes each stub's frontmatter via `getIssueDetails`. Reports `"Synced N stubs (M failed)"` via Notice.
- **`jira-bases:clean-orphaned-stubs`** — finds stubs whose KEY does not appear in any note's `jira_issues`, shows a confirmation modal listing them, deletes on confirm.

### Automatic behavior

A debounced vault-modify listener (500 ms per file) re-scans the modified file and rewrites its `jira_issues` frontmatter. No JIRA calls; the scan is purely local regex.

### Settings additions

- **Stubs folder** (text, default `"JIRA"`). Relative path from vault root. Created on demand.
- **Project prefixes** (text, comma-separated, default `""`). Bare-key matching is disabled unless at least one prefix is configured; link-based matching works unconditionally.

## Architecture

Seven new units plus one extension. All non-Obsidian units are pure and fully unit-tested; Obsidian glue is manually verified.

### 1. `RefScanner` — `src/ref-scanner.ts` (new, pure)

```ts
export function findReferences(
  content: string,
  baseUrl: string,
  prefixes: string[],
): Set<string>;
```

- **Link form:** matches `[...](${baseUrl}/browse/KEY)`. Case-insensitive on KEY; normalizes to uppercase before return. `baseUrl` is regex-escaped and trailing slashes are normalized.
- **Bare-key form:** if `prefixes` is non-empty, matches `\b(PREFIX1|PREFIX2|...)-\d+\b` across all prefixes, case-sensitive (JIRA keys are uppercase by convention).
- **Output:** deduplicated uppercase keys. No I/O, no Obsidian imports.

### 2. `FrontmatterEditor` — `src/frontmatter.ts` (new, pure)

```ts
export type Frontmatter = Record<string, unknown>;

export function readFrontmatter(content: string): {
  frontmatter: Frontmatter;
  body: string;
};

export function writeFrontmatter(
  content: string,
  patch: Frontmatter,
): string | null;  // null if existing frontmatter can't be round-tripped safely
```

- Parses the leading `---\n...\n---\n` block if present. If absent, creates one.
- Merge semantics: shallow. Keys in `patch` replace existing values; unpatched keys are preserved verbatim.
- Uses a small YAML emitter tuned for the shapes this plugin writes (strings, ISO dates, scalar lists, string lists). Complex values already in the file round-trip through a simple parser. (If the existing frontmatter contains shapes the parser can't round-trip, the write is aborted and returned as `null` — callers surface a Notice.)
- No dependency on `js-yaml`: the subset used is small enough to hand-roll, and avoids bundling a parser into the plugin.

### 3. `IssueDetails` parser — `src/jira-fields.ts` (new, pure)

```ts
export interface IssueDetails {
  key: string;
  summary: string;
  status: string;
  type: string;
  priority: string | null;
  assignee: string | null;
  reporter: string | null;
  labels: string[];
  updated: string;       // ISO 8601 from JIRA
  url: string;           // derived by caller: `${baseUrl}/browse/${key}`
}

export function parseIssueDetails(
  json: unknown,
  baseUrl: string,
): IssueDetails | null;
```

Reads from JIRA's `/rest/api/2/issue/{KEY}` response shape: `fields.summary`, `fields.status.name`, `fields.issuetype.name`, `fields.priority?.name`, `fields.assignee?.displayName`, `fields.reporter?.displayName`, `fields.labels` (array of string), `fields.updated`. Returns `null` on missing required fields.

### 4. `JiraClient` extension — `src/jira-client.ts`

Adds one method:

```ts
getIssueDetails(key: string): Promise<Result<IssueDetails, JiraError>>;
```

- Endpoint: `GET {base}/rest/api/2/issue/{KEY}?fields=summary,status,issuetype,priority,assignee,reporter,labels,updated`.
- New error variant: `{ kind: "not-found"; key: string }` returned on 404.
- Reuses existing `HttpRequest` injection from v0.1.
- KEY is path-encoded (`encodeURIComponent`) even though well-formed keys don't need it — cheap defense against odd inputs.

### 5. `StubWriter` — `src/stub-writer.ts` (new, Obsidian-facing)

```ts
export interface VaultAdapter {
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  ensureFolder(path: string): Promise<void>;
}

export async function writeStub(
  vault: VaultAdapter,
  stubsFolder: string,
  details: IssueDetails,
): Promise<void>;
```

- Path: `${stubsFolder}/${details.key}.md`.
- On create: full template with managed frontmatter, H1 (`# {key} — {summary}`), browse link, `## Notes` heading with a blank line beneath.
- On refresh: reads existing file, patches only the managed frontmatter keys (listed below), preserves everything else — including the user's content below `## Notes`.
- **Managed frontmatter keys:** `jira_key`, `jira_summary`, `jira_status`, `jira_type`, `jira_priority`, `jira_assignee`, `jira_reporter`, `jira_labels`, `jira_updated`, `jira_url`, `jira_synced_at`. Non-managed keys are untouched.
- `jira_synced_at` is set to `new Date().toISOString()` on every write.

### 6. `Indexer` — `src/indexer.ts` (new, pure-ish)

```ts
export interface IndexerDeps {
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;
  listNotes(): Promise<string[]>;   // returns paths of all md files
  getSettings(): { baseUrl: string; prefixes: string[] };
}

export async function rescanFile(deps: IndexerDeps, path: string): Promise<void>;

export async function collectAllKeys(deps: IndexerDeps): Promise<Set<string>>;

export async function findOrphanedStubs(
  deps: IndexerDeps,
  stubsFolder: string,
): Promise<string[]>;  // returns stub KEYs with no references
```

- `rescanFile`: read file → `findReferences` → merge into `jira_issues` frontmatter via `writeFrontmatter`. If the resulting list is identical to the existing list (same set, same order after sort), the write is skipped (avoids save-loop feedback with the vault-modify handler).
- `collectAllKeys`: iterate all notes, read each frontmatter, union `jira_issues` lists. Skips notes inside `stubsFolder` itself.
- `findOrphanedStubs`: list stubs folder, subtract `collectAllKeys`.

### 7. Plugin entry additions — `src/main.ts`

- Register `stubsFolder` and `projectPrefixes` settings; settings tab gains corresponding controls (text input + comma-split).
- Register `rescan-note`, `sync-issue-stubs`, `clean-orphaned-stubs` commands.
- Register a debounced `vault.on("modify", ...)` handler that calls `rescanFile` for the modified path (debounce: 500 ms per path). Disabled for files inside `stubsFolder` to prevent self-triggering.
- `sync-issue-stubs` orchestration: `collectAllKeys` → for each key, `getIssueDetails` → on success, `writeStub`; on any error, append to an error list. Final Notice: `"Synced {N} stubs ({M} failed)"`. Failures are logged via `console.warn` with key + error kind.
- `clean-orphaned-stubs` orchestration: `findOrphanedStubs` → Obsidian `Modal` listing keys, Confirm / Cancel buttons → on Confirm, delete each via `vault.delete`. Notice: `"Deleted {N} orphaned stubs."`.

### Data flow

**On save:**
```
vault modify event (path)
    ↓ (debounce 500 ms per path)
skip if inside stubsFolder
    ↓
read file → findReferences(content, baseUrl, prefixes)
    ↓
merge keys into jira_issues frontmatter (skip write if unchanged)
    ↓
write file
```

**On `sync-issue-stubs`:**
```
collectAllKeys() → Set<KEY>
    ↓ for each KEY (sequential to avoid hammering JIRA):
client.getIssueDetails(KEY)
    ↓ ok → writeStub(stubsFolder, details)
    ↓ err → record failure
    ↓
Notice: "Synced N stubs (M failed)"
```

Sequential fetch is deliberate: plugin targets small-to-medium vaults; parallel fetch risks tripping JIRA rate limits on bulk first-runs. Revisit if slow in practice.

**On `clean-orphaned-stubs`:**
```
findOrphanedStubs() → KEY[]
    ↓
confirmation modal
    ↓
delete each stub file
    ↓
Notice: "Deleted N orphaned stubs"
```

## Error handling

| Situation | Handling |
|---|---|
| Scanner regex error | Impossible (compiled once). |
| File read fails during rescan | Notice: `"jira-bases: could not read {path}"`. Save handler continues for the next event. |
| Frontmatter unparseable | Notice: `"jira-bases: skipped {path} — could not parse frontmatter"`. File is not modified. |
| `getIssueDetails` `not-found` | Per-key failure; stub is NOT created (prevents stubs for deleted/typo'd issues). |
| `getIssueDetails` `auth` / `network` / `http` / `parse` | Per-key failure; existing stub left as-is; error counted in the summary Notice. |
| Stub file exists but has unreadable frontmatter on refresh | Skip the write for that stub; counted as a failure. User must fix manually. |
| `clean-orphaned-stubs` delete fails | Counted in the final notice: `"Deleted N orphaned stubs (M failed)"`. |

## Persistence

`data.json` gains two fields:

```json
{
  "stubsFolder": "JIRA",
  "projectPrefixes": []
}
```

No keychain changes. Existing v0.1 fields (`baseUrl`, `encryptedTokens`) untouched.

## Testing

### Unit tests (pure)

- **`ref-scanner.test.ts`**
  - Link form with matching baseUrl → captured.
  - Link form with non-matching baseUrl → ignored.
  - Bare key matched when prefix configured; not matched when it isn't.
  - `UTF-8`, `HTTP-2`, `COVID-19` not matched when those aren't prefixes.
  - `PROJ-123` matched when `PROJ` is a prefix; `NOPE-12` not matched.
  - Multiple occurrences deduplicated.
  - Trailing slash and querystring on baseUrl normalized.
  - Empty content, empty prefixes list — well-defined empty output.

- **`frontmatter.test.ts`**
  - File with no frontmatter → `writeFrontmatter` adds a block.
  - Existing frontmatter preserved keys not in patch.
  - List field replaced wholesale (semantics: patch replaces, not merges).
  - Body preserved byte-for-byte.
  - Idempotent re-write of the same patch is a no-op on content.
  - Unparseable frontmatter → parser returns a sentinel indicating failure; caller can detect.

- **`jira-fields.test.ts`**
  - Full issue JSON with all optional fields populated.
  - Missing `priority`/`assignee`/`reporter` → fields become `null`.
  - Empty `labels` → `[]`.
  - Missing `summary` or `status` → `parseIssueDetails` returns `null`.
  - `url` derived from `baseUrl` + `key`.

- **`jira-client.test.ts`** (extended)
  - `getIssueDetails` 200 → returns parsed details.
  - `getIssueDetails` 404 → `{ kind: "not-found", key }`.
  - `getIssueDetails` 401 → `{ kind: "auth", status: 401 }`.
  - `getIssueDetails` malformed JSON → `{ kind: "parse" }`.
  - Request URL includes `?fields=...` with the expected fields.

- **`stub-writer.test.ts`** (uses an in-memory `VaultAdapter`)
  - Create: file doesn't exist → folder ensured, stub written with full template, all managed keys present.
  - Refresh: file exists with user text below `## Notes` → text preserved, only managed frontmatter keys changed.
  - Refresh: file exists with a non-managed frontmatter key → key preserved.
  - `jira_synced_at` updated on every write.

- **`indexer.test.ts`** (uses in-memory deps)
  - `rescanFile`: populates `jira_issues` from content.
  - `rescanFile`: no-op when scanned set equals existing set (same elements, any order).
  - `collectAllKeys`: unions across multiple notes, excludes files inside stubsFolder.
  - `findOrphanedStubs`: returns KEYs present in stub folder but not in any `jira_issues`.

### Manual verification (dev vault)

- Create a note with a v0.2-style issue link; save; verify `jira_issues` appears in frontmatter.
- Configure prefixes `[ABC]`; type `ABC-1` into the body; save; verify it's added.
- Run `sync-issue-stubs`; verify `JIRA/ABC-1.md` exists with live fields.
- Add text below `## Notes` in the stub; re-run `sync-issue-stubs`; verify the text survives.
- Remove the link from the note, re-scan; run `clean-orphaned-stubs`; verify the stub is listed and deletable.
- Create a minimal `.base` over `file.inFolder("JIRA")` and confirm the issue-centric view renders.

## Coordination with v0.2

v0.2 (link insertion) lives on `feat/link-insertion`. Overlap:

- Both extend `src/jira-client.ts`. v0.2 adds `getIssue(key)`/`searchIssues(...)` with a skinny `Issue` shape. v0.3 adds `getIssueDetails(key)` with a rich `IssueDetails` shape — additive, no existing signatures touched.
- Both extend `PluginSettings`. v0.2 adds `linkTemplate`. v0.3 adds `stubsFolder` and `projectPrefixes`. Additive.
- Merge order doesn't matter; conflicts will be trivial additions if any.

Post-merge consolidation (deferred): if `Issue` and `IssueDetails` converge in use, collapse to a single method. Not worth doing pre-merge.

## Non-goals for v0.3

- Starter `.base` files shipped by the plugin. (Ship after v0.3 proves the shape.)
- Scheduled auto-refresh of stubs.
- Writing back to JIRA.
- Sprint / fixVersion / resolution / custom fields.
- OAuth, mobile support, multi-instance — still carried forward from v0.1.
- Parallel `getIssueDetails` fetching.
- Rename-awareness: if the user renames a stub file, the plugin treats it as a new untracked file. Out of scope.

## Open questions (deferred)

- If a user's vault has thousands of notes, `collectAllKeys` reads every file's frontmatter on each sync. Likely fine in practice; revisit if sync becomes slow.
- Whether to surface per-key failures in a dedicated view (rather than just `console.warn`). Wait for a real use case.
