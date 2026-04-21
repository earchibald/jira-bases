# jira-bases v0.1 — Foundation Slice

**Date:** 2026-04-17
**Status:** Design approved, pending implementation plan

## Goal

Ship an Obsidian plugin that authenticates to a JIRA Data Center instance with a Personal Access Token (PAT) and verifies connectivity via a "Test connection" command. This is the minimal substrate on which later features (configurable link insertion, Bases metadata population, issue lookup/preview) will be built.

## Non-Goals (v0.1)

- Link insertion (any format)
- Obsidian Bases metadata population
- Issue lookup / preview UI
- OAuth 2.0 / 1.0a flows
- Mobile support
- Token refresh
- Rate limiting, caching, request coalescing
- Multiple JIRA instances

Each of these gets its own spec later.

## Target Environment

- **Obsidian:** desktop only (Windows, macOS, Linux)
- **JIRA:** Data Center / Server, self-hosted
- **Auth:** Personal Access Token (Bearer), provided by the end user. No admin involvement required.

## Architecture

Three units with narrow interfaces, independently testable.

### 1. `SecretStore`

Wraps `keytar` for OS keychain access. Only module in the codebase that touches the native dependency; everything else depends on its interface so it can be mocked.

**Interface:**
```ts
interface SecretStore {
  get(baseUrl: string): Promise<string | null>;
  set(baseUrl: string, token: string): Promise<void>;
  delete(baseUrl: string): Promise<void>;
}
```

**Implementation detail:** uses `keytar` with `service = "obsidian-jira-bases"`, `account = <baseUrl>`.

### 2. `JiraClient`

Typed wrapper over `fetch`. Constructed with `{ baseUrl, getToken }`, where `getToken` is an async callable so the client doesn't hold the secret itself.

**Interface (v0.1):**
```ts
interface JiraClient {
  getCurrentUser(): Promise<Result<CurrentUser, JiraError>>;
}

type CurrentUser = { displayName: string; accountId: string; emailAddress?: string };

type JiraError =
  | { kind: "no-token" }
  | { kind: "auth"; status: 401 | 403; message: string }
  | { kind: "network"; message: string }
  | { kind: "parse"; message: string }
  | { kind: "http"; status: number; message: string };
```

Calls `GET {baseUrl}/rest/api/2/myself` with `Authorization: Bearer <PAT>` and `Accept: application/json`. Returns a discriminated `Result` rather than throwing, so callers handle each case explicitly.

### 3. `JiraBasesPlugin` (Obsidian entry point)

Thin glue. Responsibilities:

- Register the settings tab
- Register the command `jira-bases:test-connection`
- Construct `SecretStore` and `JiraClient` on demand

No business logic lives here.

**Settings tab UI:**
- Text field: JIRA Base URL (e.g., `https://jira.me.com`)
- Text field (masked): Personal Access Token
- Button: Save
- Button: Test connection
- Inline note: "Your PAT is stored in your operating system's keychain, not in your vault."

## Data Flow

```
User opens Settings → enters baseUrl + PAT → clicks Save
    ↓
baseUrl written to data.json (plaintext, not sensitive)
PAT written to OS keychain via SecretStore.set(baseUrl, pat)
    ↓
User invokes "Test connection" command (or clicks Test button in settings)
    ↓
Plugin constructs JiraClient({ baseUrl, getToken: () => SecretStore.get(baseUrl) })
    ↓
JiraClient.getCurrentUser() → GET /rest/api/2/myself
    ↓
Result displayed via Obsidian Notice:
  ok  → "Connected as <displayName>"
  err → error-specific message (see below)
```

## Persistence

- **`data.json` (vault-local, plaintext):** `{ baseUrl: string }`. Non-sensitive.
- **OS keychain:** PAT under `(service = "obsidian-jira-bases", account = <baseUrl>)`.

Rationale: `data.json` syncs with the vault, which is undesirable for secrets. Keychain keeps the PAT on the local machine and out of any vault-sync path.

## Error Handling

All errors surface as Obsidian `Notice` messages. Distinct, actionable text per kind:

| Kind      | Message                                                                 |
|-----------|-------------------------------------------------------------------------|
| no URL    | "Set your JIRA base URL in plugin settings."                            |
| no token  | "Set your JIRA Personal Access Token in plugin settings."               |
| auth      | "Authentication failed (HTTP \<status\>). Check your PAT."              |
| network   | "Could not reach JIRA: \<message\>."                                    |
| http      | "JIRA returned HTTP \<status\>: \<message\>."                           |
| parse     | "Unexpected response from JIRA."                                        |

Each message is explicit enough that a user can act on it without opening devtools.

## Testing

- **`SecretStore`:** unit-tested against a mocked `keytar`.
- **`JiraClient`:** unit-tested with `vitest` + `msw` (mock `/rest/api/2/myself` for ok / 401 / 500 / network error / malformed JSON).
- **Plugin entry:** thin; verified manually in a dev vault pointed at a real JIRA DC instance.

## Repo Scaffolding

Start from the standard `obsidian-sample-plugin` template:

- `esbuild` bundler
- TypeScript, strict mode
- `manifest.json`, `main.ts`
- Add runtime dep: `keytar`
- Add dev deps: `vitest`, `msw`, `@types/node`

## Open Questions (deferred, not blocking v0.1)

- How to handle keychain unavailability on headless Linux (no `libsecret`)? — defer until a user reports it; document the limitation in README.
- Whether to support multiple JIRA instances — deferred; current design keys keychain by baseUrl so it's forward-compatible.
