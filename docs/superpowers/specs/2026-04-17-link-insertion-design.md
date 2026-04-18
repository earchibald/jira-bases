# jira-bases v0.2 — Smart Link Insertion

**Date:** 2026-04-17
**Status:** Design approved, pending implementation plan
**Builds on:** v0.1 foundation slice (PAT auth, `JiraClient`, `SecretStore`)

## Goal

Let a user insert a link to any JIRA issue into the current note via the command palette. The rendered text follows a user-configurable template so teams and individuals can match their existing conventions.

## User-facing surface

Two commands, one shared modal, one template setting.

### Commands

- **`jira-bases:insert-issue-link`** — opens the issue picker modal. On confirm, inserts the rendered template at the cursor. If text is selected, it is replaced.
- **`jira-bases:link-selection-to-issue`** — opens the same modal. On confirm, wraps the current selection as `[<selection>](<url>)`. If nothing is selected, shows a Notice (`"Select text first, or use 'Insert issue link'."`) and exits without opening the modal.

### Modal behavior

Extends Obsidian `SuggestModal<Issue>`.

- **Input detection:** input matching `/^[A-Z][A-Z0-9]+-\d+$/i` → direct `getIssue(key)`. Otherwise → debounced `searchIssues(query, 20)` (250 ms debounce).
- **Empty input:** empty list with placeholder hint `"Type an issue key or text to search"`.
- **In-flight:** placeholder `"Searching…"`; no spinner beyond that.
- **Result rendering:** line 1 = `KEY — Summary`; line 2 (muted) = `Type · Status`.
- **Result limit:** 20.
- **Errors:** surfaced via Obsidian `Notice`; modal stays open with empty list so the user can retry.

## Settings additions

- **Link template** (text field, default `[{key} {summary}]({url})`). Inline help lists the five supported tokens.
- **Reset to default** button that restores the default template.

No per-vault templates, no format picker at insertion time — deferred.

## Architecture

Three new units; one existing unit extended. All units communicate through narrow, mockable interfaces.

### 1. `TemplateRenderer` — `src/template.ts` (new, pure)

```ts
export interface IssueFields {
  key: string;
  summary: string;
  status: string;
  type: string;
  url: string;
}

export function renderTemplate(template: string, fields: IssueFields): string;
```

- Replaces `{key}`, `{summary}`, `{status}`, `{type}`, `{url}`.
- Unknown tokens are left as-is (surfaces typos to the user rather than silently eating them).
- Missing fields render as empty string.
- No markdown escaping — the template is the user's responsibility.

### 2. `JiraClient` additions — `src/jira-client.ts`

New methods on the existing interface:

```ts
export interface Issue {
  key: string;
  summary: string;
  status: string;
  type: string;
}

interface JiraClient {
  // existing:
  getCurrentUser(): Promise<Result<CurrentUser, JiraError>>;
  // new:
  getIssue(key: string): Promise<Result<Issue, JiraError>>;
  searchIssues(query: string, limit: number): Promise<Result<Issue[], JiraError>>;
}
```

- `getIssue` → `GET {base}/rest/api/2/issue/{key}?fields=summary,status,issuetype`.
- `searchIssues` → `GET {base}/rest/api/2/search?jql=<encoded>&fields=summary,status,issuetype&maxResults=<limit>`. JQL: `text ~ "<escaped>" ORDER BY updated DESC`. Input quotes/backslashes escaped before embedding.
- New error variant: `{ kind: "not-found"; key: string }` returned when `getIssue` receives 404.
- URL is not returned by the client; it is derived by the caller as `${baseUrl}/browse/${key}` to keep the client pure and decoupled from link formatting.

### 3. `IssueSuggestModal` — `src/issue-suggest-modal.ts` (new)

Extends `SuggestModal<Issue>`. Constructor takes `{ app, client, onChoose }`. Internals:

- Debounce helper (250 ms) for text queries.
- Key detector (regex above) to pick `getIssue` vs `searchIssues`.
- Renders items via `renderSuggestion(issue, el)`; calls `onChoose(issue)` on selection.
- `onChoose` is the extension point that differentiates the two commands.

### 4. Plugin entry additions — `src/main.ts`

- Register both commands.
- Each command constructs an `IssueSuggestModal` with an `onChoose` closure that performs the appropriate editor action:
  - Insert: `editor.replaceSelection(rendered)`.
  - Link-selection: `editor.replaceSelection('[' + selectedText + '](' + url + ')')`.
- Template string and base URL are pulled from settings at command invocation time (no capture at registration) so settings changes are picked up without a reload.

## Data flow — insert-issue-link

```
User invokes command
    ↓
Plugin reads { baseUrl, template } from settings
Plugin constructs JiraClient and IssueSuggestModal
    ↓
Modal opens → user types
    ↓
Input looks like a key?  → getIssue(key)
Otherwise                 → debounce 250ms → searchIssues(query, 20)
    ↓
Results render in modal; user picks one
    ↓
onChoose(issue):
  fields = { ...issue, url: `${baseUrl}/browse/${issue.key}` }
  text = renderTemplate(template, fields)
  editor.replaceSelection(text)
    ↓
Modal closes
```

`link-selection-to-issue` differs only in `onChoose`: it ignores the template and emits `[<selection>](<url>)`.

## Error handling

All errors surface as Obsidian `Notice` messages. The modal stays open on search/fetch errors so the user can adjust the query or retry.

| Situation | Message |
|---|---|
| `no-token` / `auth` / `network` / `http` / `parse` | existing foundation-slice messages |
| `getIssue` 404 (`not-found`) | `"Issue {key} not found."` |
| `searchIssues` returns `http` 400 | `"JIRA search failed (HTTP 400). Check that your query is valid."` |
| `link-selection-to-issue` invoked with no selection | `"Select text first, or use 'Insert issue link'."` |

## Persistence

- `data.json` gains one field: `linkTemplate: string` (default `"[{key} {summary}]({url})"`).
- No new secrets, no keychain changes.

## Testing

- **`template.test.ts` (new):** token substitution, missing fields (empty string), unknown tokens (left as-is), repeated tokens, empty template.
- **`jira-client.test.ts` (extended):** `getIssue` cases — 200, 404 (→ `not-found`), 401 (→ `auth`), malformed JSON (→ `parse`). `searchIssues` cases — 200 with results, 200 empty, 400 (→ `http`), JQL input with quotes/backslashes (verify escaping in the outgoing URL). Mocks via the existing `HttpRequest` injection.
- **`issue-suggest-modal.test.ts` (new):** extract the non-Obsidian logic (key detection, debounce, result mapping) into pure helpers and unit-test those. The Obsidian `SuggestModal` integration is verified manually in a dev vault.

## Non-goals for v0.2

- Autocomplete-suggester and paste-rewrite insertion triggers — future slices.
- Multiple named templates / format picker at insertion time — defer until a user asks.
- Request caching, coalescing, rate limiting.
- `assignee`, `priority`, `reporter` tokens — add when requested.
- Project scoping — all searches are global over the configured instance.
- Mobile support; multiple JIRA instances; OAuth — still out of scope, carried forward from v0.1.

## Open questions (deferred, not blocking v0.2)

- JQL dialects across JIRA DC versions: `text ~ "..."` is broadly supported but may degrade on very old instances. Revisit only if a user reports a 400 on a well-formed query.
- Whether to cache the last N searches per session — defer until the request volume feels noticeable.
