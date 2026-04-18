# jira-bases

## Summary
There are other Obsidian plugins for JIRA. Some do link helper work. Others give read summaries of issues. Still others are kitchen-sink approaches with full read/write and sychronization with JIRA issues.

None of them do quite what I want, which is:

- Simplify including JIRA links. Currently I am in the habit of manually copying the JIRA Issue ID and the Summary, then grabbing the URL and making it all into a link: like so [ABC-123 A Sample Issue](https://jira.me.com/browse/ABC-123)
	- I would like for this to be configurable. Some people would just want the issue ID as the anchor text, or some other field order or combination. Sometimes we would like the short representation (just ID), in other places the long link with summary (or as otherwise configured. Maybe people want issue status.
	- This (among other functionality) will require user authentication in order to be smart about searching for and inserting data.
- Handle dynamic configuration of note metadata for use with Obsidian Bases.
- Handle lookup of issue information (all readonly!)
- Auth: We can allow JIRA PAT but I would *prefer* to use human-in-the-middle OAuth for this where available (as in my case)
- Combining the metadata, bases and plugin capabilities we should be able to design bases with rich information from JIRA

## Status

v0.2: Smart link insertion on top of v0.1 foundation.

- **JIRA: Insert issue link** — fuzzy-pick an issue (by key or text) and insert a markdown link using a configurable template.
- **JIRA: Link selection to issue** — wrap the current selection as a link to the chosen issue.
- **Link template setting** — customise the inserted text with the tokens `{key}`, `{summary}`, `{status}`, `{type}`, `{url}`. Default: `[{key} {summary}]({url})`. Unknown tokens are left as-is.

## Install (dev)

1. `npm install && npm run build`
2. Symlink `main.js` and `manifest.json` into `<vault>/.obsidian/plugins/jira-bases/`
3. Enable "JIRA Bases" under Community plugins.

## Configure

- **JIRA base URL:** e.g. `https://jira.example.com`
- **PAT:** create one in your JIRA profile → Personal Access Tokens. Paste into settings and click "Save token". Stored in your OS keychain.

## Verify

Run the "JIRA: Test connection" command (or the Test button in settings). You should see "Connected as \<your name\>".

## Scope

Desktop only. PAT only (no OAuth). JIRA Data Center.

## v0.3 — Bases index & issue stubs

Lets Obsidian Bases correlate notes and JIRA issues.

### How it works

- On save, the plugin scans the active note for JIRA references — both `[…](<baseUrl>/browse/KEY)` links and (optionally) bare keys like `ABC-1` for project prefixes you've configured — and writes `jira_issues: [KEY, …]` to the note's frontmatter.
- The command "JIRA: Sync issue stubs" walks every referenced key, fetches current fields from JIRA, and maintains one note per issue under your configured stubs folder (default `JIRA/`). Each stub has a managed frontmatter block plus a `## Notes` section you can edit freely — the plugin never touches content below `## Notes`.
- "JIRA: Clean orphaned stubs" deletes stubs for issues no longer referenced anywhere.

### Settings

- **Stubs folder** (default `JIRA`) — where issue stubs live.
- **Project prefixes** (default empty) — comma-separated project prefixes (e.g. `ABC, PROJ`). Required for bare-key matching; link-based matching always works.

### Example `.base`

```yaml
filters:
  and:
    - file.inFolder("JIRA")
views:
  - type: table
    name: "All issues"
    order:
      - file.name
      - jira_status
      - jira_priority
      - jira_assignee
      - jira_updated
```

### Non-goals (still)

No writing back to JIRA, no scheduled refresh, no starter `.base` files, no mobile.