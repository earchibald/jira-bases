# Changelog

All notable changes to **JIRA Bases** are recorded here. Releases follow [semver](https://semver.org/) and are auto-published to GitHub Releases when `manifest.json` / `package.json` versions change on `main`.

## 1.1.0 — Test connection dedupe + dynamic token status (JB-16)

- **Dedupe.** The standalone "Test connection" setting row is gone; the inline `Test` button next to Save/Clear (added in JB-8) is the single entry point. Behavior is unchanged — same `/rest/api/2/myself` call, same Notice text.
- **Auto-test on Save token.** Saving a PAT now runs an implicit connection test against the saved token without a separate click, so "Save token. Test." collapses into one action.
- **Dynamic token status on the PAT row.** The static `✓ Token saved.` description is replaced by a status that reflects the most recent verification:
  - `✓ Saved token verified` — last test returned 2xx.
  - `⏳ Saved token — pending test` — JIRA host unreachable (network / timeout / DNS / 5xx) so the PAT couldn't be conclusively verified.
  - `❌ Saved token failed (HTTP <status>)` — last test returned 4xx (most often 401/403).
- **Persisted across reloads.** The verification record (state, timestamp, base URL it was tested against, optional HTTP status) lives on `PluginSettings.lastTokenVerification`. Settings tab open uses the cached record only — no implicit network call. A base-URL change invalidates the cached status until the next deliberate Save/Test.
- **Plays nicely with JB-15.** Save and Test now update the description in place instead of rebuilding the settings tab, so a mid-edit URL field keeps focus and its debounced auto-fix timer is undisturbed.

## 1.0.1 — Settings URL field bug fixes (JB-15)

- **Fix — focus stealing.** The JIRA base URL field in Settings no longer rebuilds the entire settings tab on each keystroke, so typing is uninterrupted instead of one-letter-at-a-time.
- **Fix — `https://` double-injection.** URL validation and the `https://` auto-fix are now debounced (~600 ms after the last keystroke), so a fix never races with in-flight typing and the prefix is applied at most once per pause.
- Internals: validation message rendering and timer cleanup extracted into helpers; existing URL validation regex and behavior preserved.

## 1.0.0 — Stable release (JB-13)

Promotes the plugin out of the 0.x pre-stable line. No new behavior vs 0.10.0 — the major bump signals a stability commitment for the public surface (commands, settings, stub frontmatter, link templates, `.base` generator, hover preview, sync). The polish arc that landed across 0.6.3 → 0.10.0 is now considered the 1.0 baseline:

- **0.6.3 / 0.7.0** — install path docs (BRAT, JB-9), Generate Bases overwrite confirm (JB-14).
- **0.8.0** — sync UX: failure-log modal, scoped sync (note / folder / single issue), clickable status bar (JB-11).
- **0.9.0** — settings polish (paragraph intros, ms→seconds, inline validation, inline Test connection) and plugin lifecycle hygiene via `onunload()` (JB-8).
- **0.10.0** — three new palette commands: open in browser, copy URL, refresh stub (JB-10).

See the per-version blocks below for the detail in each release. No breaking changes vs 0.10.0; existing settings, frontmatter shape, and command IDs are preserved.

## 0.10.0 — Command palette additions (JB-10)

- **Three new palette commands**, all sharing one cursor-aware key resolver (selection → cursor → active note's `jira_key` frontmatter):
  - **JIRA: Open issue in browser** — resolves the current key and opens `<base>/browse/<KEY>` in the default browser.
  - **JIRA: Copy issue URL** — same resolution; copies `<base>/browse/<KEY>` to the clipboard.
  - **JIRA: Refresh this stub** — when the active note has a `jira_key` frontmatter field, re-fetches from JIRA and rewrites the managed `jira_*` frontmatter in place. Notice no-op otherwise.
- **Palette grouping pass.** The `JIRA: …` commands are now registered in `onload()` grouped by intent (connection · single-issue actions · stub maintenance · sync · view generation) so future readers can map them back to UI flows.

## 0.9.0 — Settings polish and plugin lifecycle hygiene (JB-8)

- **Settings copy.** Each section now has a paragraph-level intro instead of just a heading. The PAT row's storage description matches reality — encrypted at rest using Electron `safeStorage` with the ciphertext written to this vault's plugin-data file (the OS keychain holds only the derived key, not the token itself).
- **Human units.** The auto-lookup idle delay is now entered in seconds (with the ms range called out inline) instead of raw milliseconds. The auto-refresh interval description also documents the `document.hidden` skip — refresh ticks are no-ops while the Obsidian window is hidden and resume on the next scheduled tick after it becomes visible.
- **Inline validation.**
  - Project prefixes that fail the `[A-Z][A-Z0-9]+` shape are still filtered out, but rejected entries are now listed below the input as a warning instead of being silently dropped.
  - Link-template and custom auto-lookup-template inputs warn inline when they reference unknown tokens (e.g. `{keys}` typo). Templates still render unknown tokens as-is — the warning is a diagnostic, not a hard error.
- **Inline Test connection.** A `Test` button now sits right next to the Save/Clear token buttons so connection verification follows the natural URL → PAT → Test flow. The standalone "Test connection" setting row is unchanged.
- **Plugin lifecycle hygiene.** A new `onunload()` cancels the auto-lookup idle scheduler's raw `setTimeout`, defensively detaches the status-bar item, and clears the tracked auto-refresh / status-bar update interval ids. The `registerInterval`-wrapped intervals were already reclaimed by Obsidian's `Component` lifecycle — this just makes that explicit and closes the one resource (the raw timer) Obsidian doesn't track for us.

## 0.8.0 — Sync UX: failure log, scoped sync, status-bar interaction (JB-11)

- **Inspectable failure log.** When a sync ends with failures, the Notice now invites a click that opens a modal listing every failure (key, error kind, full message) plus the synced count and timestamp. Replaces the prior "Synced N stubs (M failed). First: …" Notice that only surfaced one failure.
- **Scoped sync commands.** Three new commands let you refresh stubs without re-scanning the whole vault:
  - **JIRA: Sync this note's references** — scans the active file only.
  - **JIRA: Sync this folder's references** — scans every `.md` under the active note's folder (recursive).
  - **JIRA: Sync this issue** — single-key prompt; auto-fills from the cursor when a JIRA key is under it.
- **Clickable status bar.** The "JIRA: Last synced …" status-bar item is now interactive — click to reopen the last sync's failure log. Same surface is also available as the **JIRA: Show last sync summary** command for keyboard-only users.

## 0.7.0 — Generate Bases overwrite confirm (JB-14)

- **JIRA: Generate Bases view** now prompts for confirmation before overwriting an existing `JIRA Issues.base` in the stubs folder, instead of silently replacing it. Choosing *Cancel* leaves the existing file untouched.

## 0.6.3 — BRAT install path in README (JB-9)

- README's Quick Start now leads with the BRAT install path (recommended), with the from-source path retained for plugin developers. No code change.

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
