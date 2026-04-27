# Changelog

All notable changes to **JIRA Bases** are recorded here. Releases follow [semver](https://semver.org/) and are auto-published to GitHub Releases when `manifest.json` / `package.json` versions change on `main`.

## 0.8.0 — Sync UX: failure log, scoped sync, status-bar interaction (JB-11)

- **Inspectable failure log.** When a sync ends with failures, the Notice now invites a click that opens a modal listing every failure (key, error kind, full message) plus the synced count and timestamp. Replaces the prior "Synced N stubs (M failed). First: …" Notice that only surfaced one failure.
- **Scoped sync commands.** Three new commands let you refresh stubs without re-scanning the whole vault:
  - **JIRA: Sync this note's references** — scans the active file only.
  - **JIRA: Sync this folder's references** — scans every `.md` under the active note's folder (recursive).
  - **JIRA: Sync this issue** — single-key prompt; auto-fills from the cursor when a JIRA key is under it.
- **Clickable status bar.** The "JIRA: Last synced …" status-bar item is now interactive — click to reopen the last sync's failure log. Same surface is also available as the **JIRA: Show last sync summary** command for keyboard-only users.

## 0.6.2 — README rewrite (JB-7)

- README rewritten as a user-facing reference (Overview / Quick Start / Reference / Troubleshooting / Non-goals). Per-version blocks moved here. Corrected the PAT-storage description: the token is encrypted with Electron `safeStorage` (using OS-managed keys) and the base64 ciphertext is stored in `<vault>/.obsidian/plugins/jira-bases/data.json` — not in the OS keychain directly.

## 0.6.x — Frontmatter policy & non-goals

- Plugin no longer modifies the frontmatter of user-authored notes. Only stubs inside the configured stubs folder have managed `jira_*` frontmatter.
- Documented non-goals (JIRA Cloud, OAuth, mobile, multi-account, telemetry) explicitly in README and settings.
- GitHub release CI auto-publishes on version bumps to `main`.

## 0.5 — Starter `.base` generator

- **JIRA: Generate Bases view** — column-picker modal that writes a ready-to-use `JIRA Issues.base` to your stubs folder. Default columns: key, summary, status, type, priority, assignee. Add reporter, labels, updated, or url as needed.

## 0.4 — Issue lookup & hover preview

- **Hover preview** — hovering any link to `<your-jira>/browse/<KEY>` (or a Live Preview link whose visible text starts with a JIRA key) shows summary, status, type, priority, assignee, reporter, and last-updated time. Cached for 5 minutes; stale entries refresh in the background.
- **JIRA: Look up issue…** — command-palette modal that accepts a key (`ABC-123`) or a browse URL and renders the same preview.

## 0.3 — Bases index & issue stubs

- **JIRA: Sync issue stubs** scans every note's body for JIRA references — `[…](<baseUrl>/browse/KEY)` links and (for configured project prefixes) bare keys like `ABC-1` — fetches current fields from JIRA, and maintains one stub note per issue under your stubs folder (default `JIRA/`). Each stub has a managed frontmatter block plus a `## Notes` section you can edit freely; the plugin never touches content below `## Notes`.
- **JIRA: Clean orphaned stubs** deletes stubs for issues no longer referenced anywhere.
- New settings: **Stubs folder**, **Project prefixes**.

## 0.2 — Smart link insertion

- **JIRA: Insert issue link** — fuzzy-pick an issue (by key or text) and insert a markdown link using a configurable template.
- **JIRA: Link selection to issue** — wrap the current selection as a link to the chosen issue.
- **Link template setting** — customise the inserted text with the tokens `{key}`, `{summary}`, `{status}`, `{type}`, `{url}`. Default: `[{key} {summary}]({url})`. Unknown tokens are left as-is.

## 0.1 — Foundation

- JIRA Data Center connectivity (PAT auth, `safeStorage`-encrypted token).
- Base URL + PAT settings.
- **JIRA: Test connection** command.
