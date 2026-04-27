# JIRA Bases

An Obsidian plugin that turns your JIRA issues into first-class Bases data — smart link insertion, per-issue stub notes synced from JIRA, and hover/lookup previews. **JIRA Data Center only, desktop only, Personal Access Token (PAT) auth only.** No JIRA Cloud, no OAuth, no mobile, no telemetry. See [Non-goals](#non-goals) for the full list.

> Looking for older changes? See [`CHANGELOG.md`](./CHANGELOG.md).

## Overview

JIRA Bases keeps a folder of read-only **stub notes** in your vault — one note per JIRA issue you reference — with managed frontmatter (`jira_status`, `jira_priority`, `jira_assignee`, …). Pair it with [Obsidian Bases](https://help.obsidian.md/bases) and you get a sortable, filterable table of your JIRA issues that lives entirely in your vault. The plugin also inserts smart links, previews issues on hover, and (optionally) replaces bare issue keys you type with proper links.

Three flows you'll use most:

1. **Insert a JIRA link** — fuzzy-pick an issue, paste a configurable link template.
2. **Sync stubs and view them in Bases** — scans your vault for JIRA references, fetches fields, writes one stub per issue, then renders them through a generated `.base` view.
3. **Hover or look up an issue** — preview summary, status, type, priority, assignee, reporter, and last-updated time without leaving the editor.

<!-- TODO: capture docs/screenshots/insert-link.gif — Insert issue link flow -->
<!-- TODO: capture docs/screenshots/sync-and-base.gif — Sync stubs + Bases view -->
<!-- TODO: capture docs/screenshots/hover-preview.png — Hover preview popover -->

## Quick start

### 1. Install (dev / from source)

```bash
git clone https://github.com/earchibald/jira-bases.git
cd jira-bases
npm install && npm run build
```

Symlink the build into your vault:

```bash
ln -s "$PWD/main.js"      <vault>/.obsidian/plugins/jira-bases/main.js
ln -s "$PWD/manifest.json" <vault>/.obsidian/plugins/jira-bases/manifest.json
```

Then enable **JIRA Bases** under *Settings → Community plugins*.

### 2. Connect to JIRA

In *Settings → JIRA Bases*:

1. **JIRA base URL** — e.g. `https://jira.example.com` (no trailing slash; `https://` is auto-added if you forget).
2. **Personal Access Token** — generate one in your JIRA profile → *Personal Access Tokens*, paste it, click **Save token**. The token is encrypted at rest (see [How tokens are stored](#how-tokens-are-stored)).
3. Click **Test** under *Test connection*. You should see `Connected as <your name>`.

### 3. Insert a JIRA link

Open the command palette and run **JIRA: Insert issue link**. Type any part of the key or summary, pick the issue, and a markdown link is inserted using your link template.

To wrap an existing selection, select the text first, then run **JIRA: Insert issue link** — the suggestion modal will use your selection as the seed search.

### 4. Sync stubs and view them in Bases

1. Configure *Project prefixes* in settings (e.g. `ABC, PROJ`) so the scanner recognises bare keys.
2. Run **JIRA: Sync issue stubs**. The plugin scans every note's body for JIRA references — `[…](<baseUrl>/browse/KEY)` links and bare keys for your configured prefixes — fetches each issue's fields, and writes one stub per issue under your *Stubs folder* (default: `JIRA/`).
3. Run **JIRA: Generate Bases view** to create `JIRA Issues.base` in the same folder. Open it with Bases for a sortable, filterable table.

To remove stubs whose issue is no longer referenced anywhere in the vault, run **JIRA: Clean orphaned stubs**.

### 5. Preview an issue

Hover any link to `<your-jira>/browse/<KEY>` (or any link whose visible text starts with a JIRA key in Live Preview) and a popover shows summary, status, type, priority, assignee, reporter, and last-updated time. Cached for 5 minutes; stale entries refresh in the background.

For one-off lookups without inserting a link, run **JIRA: Look up issue…** and paste a key (`ABC-123`) or a browse URL.

## Reference

### Commands

| Command | What it does |
| :--- | :--- |
| **JIRA: Test connection** | Calls `/rest/api/2/myself`. Returns the authenticated user. |
| **JIRA: Insert issue link** | Fuzzy-pick an issue and insert a markdown link using your *Link template*. Works on the current selection too. |
| **JIRA: Sync issue stubs** | Scans the vault for JIRA references, fetches fields, writes/updates stubs in your *Stubs folder*. |
| **JIRA: Clean orphaned stubs** | Deletes stub notes whose issue is no longer referenced anywhere in the vault. |
| **JIRA: Look up issue…** | Modal that accepts a key or browse URL and renders the same preview as hover. |
| **JIRA: Add comment to issue…** | Pick an issue, write a comment, post it. |
| **JIRA: Generate Bases view** | Opens a column-picker modal and writes `JIRA Issues.base` to your *Stubs folder*. |

### Settings

| Setting | Default | Notes |
| :--- | :--- | :--- |
| **JIRA base URL** | _(empty)_ | Validated on input; missing protocol is auto-fixed to `https://`. |
| **Personal Access Token** | _(empty)_ | Encrypted at rest. See [How tokens are stored](#how-tokens-are-stored). |
| **Link template** | `[{key} {summary}]({url})` | Tokens: `{key}`, `{summary}`, `{status}`, `{type}`, `{url}`. Unknown tokens are left as-is. |
| **Stubs folder** | `JIRA` | Where stub notes are written, vault-relative. |
| **Auto-lookup on type** | off | When enabled, bare keys you type (matching configured prefixes) are replaced with a link after an idle pause. |
| **Auto-lookup link style** | Minimal | `Minimal` = `[KEY](url)`. `Primary` = the *Link template* above. `Custom` = a separate template you control. |
| **Idle delay (ms)** | `2000` | How long after the last keystroke before queued lookups apply. |
| **Project prefixes** | _(empty)_ | Comma-separated, e.g. `ABC, PROJ`. Required for bare-key matching; explicit links work without it. |
| **Failed keys cache TTL / max size** | `600000` ms / `500` | Suppresses repeat API calls for keys that don't resolve. |
| **Auto-refresh stubs** | off | Periodic re-fetch of all stubs. |
| **Refresh interval (minutes)** | `60` | Used when auto-refresh is enabled. Minimum 1 minute. |
| **Refresh on startup** | off | Run a sync when Obsidian launches. |

### Link-template tokens

The template is a plain string. The following tokens are substituted:

- `{key}` — issue key, e.g. `ABC-123`
- `{summary}` — issue summary
- `{status}` — workflow status name
- `{type}` — issue type (Bug, Story, …)
- `{url}` — `<baseUrl>/browse/<KEY>`

Unknown tokens (e.g. `{keys}` typo) are left in place — the plugin doesn't error, the literal string lands in your note. If your template renders a markdown link, key/summary/status/type are escaped for link-text and the URL is escaped for link-href.

### Stub frontmatter

Stub notes inside the *Stubs folder* are managed by the plugin. The body has a `## Notes` section you can freely edit — the plugin never touches anything below `## Notes`. Frontmatter fields written:

- `jira_key`, `jira_summary`, `jira_status`, `jira_type`, `jira_priority`
- `jira_assignee`, `jira_reporter`, `jira_labels`, `jira_updated`
- `jira_url`

**Notes you authored are never modified.** Even if a note's body references a JIRA issue, the plugin will not write `jira_*` fields onto it. To filter a Bases view by issue references, scope the view to the stubs folder (`file.inFolder("JIRA")`).

### Example `.base` (filter by stubs folder)

```yaml
filters:
  and:
    - file.inFolder("JIRA")
views:
  - type: table
    name: "All issues"
    order:
      - file.name
      - jira_key
      - jira_summary
      - jira_status
      - jira_type
      - jira_priority
      - jira_assignee
```

### How tokens are stored

The PAT is **encrypted at rest using Electron's [`safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage)**, which derives its key from your operating system's secret-management facility (Keychain on macOS, libsecret on Linux, DPAPI on Windows). The resulting ciphertext is base64-encoded and written into your vault's plugin-data file at:

```
<vault>/.obsidian/plugins/jira-bases/data.json
```

The token is **not** stored in your OS keychain directly, and the plaintext token is never written to disk. If you copy your vault to another machine without the same OS-managed key, the encrypted token won't decrypt and you'll be prompted to re-enter your PAT. To remove a saved token, click **Clear token** in settings.

## Troubleshooting

### "Connected as …" doesn't appear when I click Test

- Verify the base URL has no trailing slash and uses the same protocol JIRA serves (almost always `https://`).
- Confirm the PAT is valid in JIRA → *Personal Access Tokens*. PATs can be revoked or expire — generate a new one and **Save token** again.
- If you see *OS encryption unavailable*, your Obsidian build can't reach `safeStorage`. Token storage requires desktop Obsidian — mobile is unsupported.

### Stub sync doesn't pick up bare keys (`ABC-123`)

Bare-key matching only fires for prefixes listed under *Project prefixes*. Add `ABC` (uppercase, comma-separated for multiples) and re-run **JIRA: Sync issue stubs**. Explicit `[…](<baseUrl>/browse/KEY)` links are matched without any prefix configuration.

### Hover preview doesn't appear

- The link must point at `<your-jira>/browse/<KEY>`, **or** be a Live Preview link whose visible text starts with a JIRA key. Reading-mode links use the URL match.
- Hover previews share the issue cache; if a key was queried recently and failed, it's suppressed for the *Failed keys cache TTL* (default 10 minutes). Wait it out, or change the TTL to a smaller value.

### My stub frontmatter looks wrong / I want a field added

The set of `jira_*` fields is fixed — the plugin owns those. Anything below `## Notes` in a stub is yours to edit and won't be overwritten. For non-JIRA fields, add them under `## Notes` (or in a separate sibling note that links to the stub).

## Non-goals

To keep scope tight, this plugin explicitly **does not** support:

- **JIRA Cloud.** Targets JIRA Data Center only. The Cloud REST API surface, auth flows, and pagination semantics differ; supporting both would double maintenance and dilute the Data Center experience.
- **OAuth.** Personal Access Token (PAT) only. No 3LO, no device flow, no SSO bridging.
- **Mobile.** Desktop-only (`isDesktopOnly: true`). Token storage relies on Electron `safeStorage`, which has no mobile equivalent.
- **Multi-account / multi-instance.** One JIRA base URL + token per vault.
- **Live Preview decorations beyond hover preview.** No inline status pills, no in-editor issue summaries, no CodeMirror widgets — hover-only.
- **Telemetry.** No analytics, no crash reporting, no phone-home.
