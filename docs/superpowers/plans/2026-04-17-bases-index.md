# jira-bases v0.3 — Bases Index & Issue Stubs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v0.3 slice of `jira-bases`: scan notes for JIRA issue references, maintain a `jira_issues` frontmatter list on each note, and materialize a per-issue stub note under a configurable folder with live JIRA fields. Enables Obsidian Bases to correlate notes with issues both directions.

**Architecture:** Seven new units plus a small extension to `JiraClient` and `PluginSettings`. All non-Obsidian units are pure: `ref-scanner`, `frontmatter`, `jira-fields`, `indexer`. Obsidian-facing units (`stub-writer`, commands, save handler) use narrow injected adapters. Strict TDD for the pure units; manual verification for plugin glue.

**Tech Stack:** TypeScript (strict), vitest, Obsidian plugin API. No new dependencies — hand-rolled YAML frontmatter subset to avoid bundling `js-yaml`.

**Spec:** `docs/superpowers/specs/2026-04-17-bases-index-design.md`.

---

## File Structure

**Create:**
- `src/ref-scanner.ts` — regex-based reference scanner (pure).
- `src/ref-scanner.test.ts`
- `src/frontmatter.ts` — minimal YAML frontmatter reader/writer (pure).
- `src/frontmatter.test.ts`
- `src/jira-fields.ts` — `IssueDetails` type and parser (pure).
- `src/jira-fields.test.ts`
- `src/stub-writer.ts` — writes/refreshes stub notes (uses injected `VaultAdapter`).
- `src/stub-writer.test.ts`
- `src/indexer.ts` — orchestrates rescan, key collection, orphan detection (pure-ish, via injected deps).
- `src/indexer.test.ts`
- `src/confirm-modal.ts` — thin Obsidian `Modal` wrapper used only by `clean-orphaned-stubs` (no unit tests; manual verification).

**Modify:**
- `src/jira-client.ts` — add `getIssueDetails`, `not-found` error variant, `IssueDetails` import boundary.
- `src/jira-client.test.ts` — tests for `getIssueDetails`.
- `src/settings.ts` — add `stubsFolder`, `projectPrefixes` to `PluginSettings` + UI controls.
- `src/main.ts` — register three commands + debounced modify handler + vault adapter wiring.
- `README.md` — v0.3 usage section.

**Responsibility boundaries:**
- `ref-scanner`, `frontmatter`, `jira-fields`, `indexer` — no Obsidian imports, no network, no FS. All pure (indexer takes FS/settings via deps).
- `jira-client` — network only; `HttpRequest` injection already in place from v0.1.
- `stub-writer` — writes via injected `VaultAdapter`; no direct Obsidian imports (tests use an in-memory adapter).
- `main.ts` + `settings.ts` + `confirm-modal.ts` — Obsidian glue. Adapt Obsidian's `Vault` to `VaultAdapter`.

---

## Task 1: Extend `PluginSettings`

**Files:**
- Modify: `/Users/earchibald/Projects/jira-bases/src/settings.ts`

- [ ] **Step 1: Add fields to `PluginSettings` and `DEFAULT_SETTINGS`**

Replace the interface and default object (lines 4–12) with:

```ts
export interface PluginSettings {
  baseUrl: string;
  encryptedTokens: Record<string, string>;
  stubsFolder: string;
  projectPrefixes: string[];
}

export const DEFAULT_SETTINGS: PluginSettings = {
  baseUrl: "",
  encryptedTokens: {},
  stubsFolder: "JIRA",
  projectPrefixes: [],
};
```

- [ ] **Step 2: Add settings controls to `display()`**

Append these two `Setting` blocks after the "Test connection" setting (after line 95, inside `display()`):

```ts
    new Setting(containerEl)
      .setName("Stubs folder")
      .setDesc("Folder for per-issue stub notes (relative to vault root).")
      .addText((text) =>
        text
          .setPlaceholder("JIRA")
          .setValue(this.plugin.settings.stubsFolder)
          .onChange(async (value) => {
            const trimmed = value.trim().replace(/^\/+|\/+$/g, "");
            this.plugin.settings.stubsFolder = trimmed || "JIRA";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Project prefixes")
      .setDesc(
        "Comma-separated JIRA project prefixes (e.g. ABC, PROJ). Enables bare-key matching for these prefixes. Leave empty to match only explicit issue links.",
      )
      .addText((text) =>
        text
          .setPlaceholder("ABC, PROJ")
          .setValue(this.plugin.settings.projectPrefixes.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.projectPrefixes = value
              .split(",")
              .map((s) => s.trim().toUpperCase())
              .filter((s) => /^[A-Z][A-Z0-9]+$/.test(s));
            await this.plugin.saveSettings();
          }),
      );
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/settings.ts
git commit -m "feat: settings for stubsFolder and projectPrefixes"
```

---

## Task 2: `RefScanner` — failing tests

**Files:**
- Create: `/Users/earchibald/Projects/jira-bases/src/ref-scanner.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { findReferences } from "./ref-scanner";

const BASE = "https://jira.me.com";

describe("findReferences — link form", () => {
  it("captures keys from browse links matching baseUrl", () => {
    const content = "See [ABC-123 summary](https://jira.me.com/browse/ABC-123).";
    const refs = findReferences(content, BASE, []);
    expect([...refs]).toEqual(["ABC-123"]);
  });

  it("ignores links for a different host", () => {
    const content = "Old [X](https://other.example.com/browse/ABC-123)";
    expect(findReferences(content, BASE, []).size).toBe(0);
  });

  it("normalizes trailing slash on baseUrl", () => {
    const content = "[x](https://jira.me.com/browse/ABC-99)";
    const refs = findReferences(content, `${BASE}/`, []);
    expect([...refs]).toEqual(["ABC-99"]);
  });

  it("uppercases keys it captures", () => {
    const content = "[x](https://jira.me.com/browse/abc-5)";
    const refs = findReferences(content, BASE, []);
    expect([...refs]).toEqual(["ABC-5"]);
  });

  it("deduplicates repeated references", () => {
    const content = `
      [a](https://jira.me.com/browse/ABC-1)
      [b](https://jira.me.com/browse/ABC-1)
    `;
    const refs = findReferences(content, BASE, []);
    expect([...refs]).toEqual(["ABC-1"]);
  });
});

describe("findReferences — bare key form", () => {
  it("does nothing when no prefixes are configured", () => {
    const content = "Please look at ABC-10 today.";
    expect(findReferences(content, BASE, []).size).toBe(0);
  });

  it("matches bare keys for configured prefixes", () => {
    const content = "Please look at ABC-10 and PROJ-42 today.";
    const refs = findReferences(content, BASE, ["ABC", "PROJ"]);
    expect([...refs].sort()).toEqual(["ABC-10", "PROJ-42"]);
  });

  it("does not match prefixes that aren't configured", () => {
    const content = "NOPE-1 should not appear. ABC-2 should.";
    const refs = findReferences(content, BASE, ["ABC"]);
    expect([...refs]).toEqual(["ABC-2"]);
  });

  it("does not mistake UTF-8, HTTP-2, COVID-19 for keys", () => {
    const content = "Using UTF-8 over HTTP-2 (since COVID-19).";
    const refs = findReferences(content, BASE, ["UTF", "HTTP", "COVID"]);
    // These ARE technically matches if the user configured those prefixes.
    // The point is: when those prefixes are NOT configured, they must not match.
    const noPrefix = findReferences(content, BASE, []);
    expect(noPrefix.size).toBe(0);
    // And an unrelated prefix must not pick them up:
    expect(findReferences(content, BASE, ["ABC"]).size).toBe(0);
    // When configured they do match (user-stated intent):
    expect(refs.size).toBe(3);
  });

  it("requires a word boundary", () => {
    const content = "nonABC-1 does not count; ABC-1x also does not count";
    const refs = findReferences(content, BASE, ["ABC"]);
    expect(refs.size).toBe(0);
  });

  it("combines link and bare-key matches, deduplicating", () => {
    const content = `
      [a](https://jira.me.com/browse/ABC-1)
      Also ABC-1 and ABC-2 below.
    `;
    const refs = findReferences(content, BASE, ["ABC"]);
    expect([...refs].sort()).toEqual(["ABC-1", "ABC-2"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/ref-scanner.test.ts`
Expected: FAIL — "Cannot find module './ref-scanner'".

- [ ] **Step 3: Commit (test only)**

```bash
git add src/ref-scanner.test.ts
git commit -m "test: failing tests for RefScanner"
```

---

## Task 3: `RefScanner` — implementation

**Files:**
- Create: `/Users/earchibald/Projects/jira-bases/src/ref-scanner.ts`

- [ ] **Step 1: Write the implementation**

```ts
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, "");
}

export function findReferences(
  content: string,
  baseUrl: string,
  prefixes: string[],
): Set<string> {
  const found = new Set<string>();
  const base = normalizeBase(baseUrl);

  if (base.length > 0) {
    const linkRe = new RegExp(
      `${escapeRegex(base)}/browse/([A-Za-z][A-Za-z0-9]+-\\d+)`,
      "g",
    );
    for (const m of content.matchAll(linkRe)) {
      found.add(m[1].toUpperCase());
    }
  }

  const valid = prefixes.filter((p) => /^[A-Z][A-Z0-9]+$/.test(p));
  if (valid.length > 0) {
    const alt = valid.map(escapeRegex).join("|");
    const bareRe = new RegExp(`\\b(?:${alt})-\\d+\\b`, "g");
    for (const m of content.matchAll(bareRe)) {
      found.add(m[0]);
    }
  }

  return found;
}
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `npm test -- src/ref-scanner.test.ts`
Expected: PASS — all tests.

- [ ] **Step 3: Commit**

```bash
git add src/ref-scanner.ts
git commit -m "feat: RefScanner — link + bare-key reference detection"
```

---

## Task 4: `Frontmatter` — failing tests

**Files:**
- Create: `/Users/earchibald/Projects/jira-bases/src/frontmatter.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { readFrontmatter, writeFrontmatter } from "./frontmatter";

describe("readFrontmatter", () => {
  it("returns empty frontmatter and whole body when none present", () => {
    const { frontmatter, body } = readFrontmatter("hello world\n");
    expect(frontmatter).toEqual({});
    expect(body).toBe("hello world\n");
  });

  it("parses a simple frontmatter block", () => {
    const input = `---
jira_key: ABC-1
jira_status: "In Progress"
jira_labels:
  - frontend
  - auth
---
body here
`;
    const { frontmatter, body } = readFrontmatter(input);
    expect(frontmatter).toEqual({
      jira_key: "ABC-1",
      jira_status: "In Progress",
      jira_labels: ["frontend", "auth"],
    });
    expect(body).toBe("body here\n");
  });

  it("handles an empty frontmatter block", () => {
    const { frontmatter, body } = readFrontmatter(`---\n---\nhi\n`);
    expect(frontmatter).toEqual({});
    expect(body).toBe("hi\n");
  });
});

describe("writeFrontmatter", () => {
  it("adds a frontmatter block when the file has none", () => {
    const out = writeFrontmatter("hello\n", { jira_issues: ["ABC-1"] });
    expect(out).toBe(`---\njira_issues:\n  - ABC-1\n---\nhello\n`);
  });

  it("merges a patch into existing frontmatter, replacing list fields wholesale", () => {
    const input = `---
title: Daily
jira_issues:
  - OLD-1
---
body
`;
    const out = writeFrontmatter(input, { jira_issues: ["ABC-1", "ABC-2"] });
    expect(out).toBe(`---\ntitle: Daily\njira_issues:\n  - ABC-1\n  - ABC-2\n---\nbody\n`);
  });

  it("preserves body byte-for-byte", () => {
    const input = `---\ntitle: x\n---\nline1\n\nline2\n`;
    const out = writeFrontmatter(input, { title: "y" });
    expect(out).toBe(`---\ntitle: y\n---\nline1\n\nline2\n`);
  });

  it("is idempotent on repeated identical patches", () => {
    const input = `---\nk: v\n---\nbody\n`;
    const once = writeFrontmatter(input, { k: "v" });
    const twice = writeFrontmatter(once!, { k: "v" });
    expect(once).toBe(twice);
  });

  it("emits empty list as []", () => {
    const out = writeFrontmatter("hi\n", { jira_issues: [] });
    expect(out).toBe(`---\njira_issues: []\n---\nhi\n`);
  });

  it("quotes strings containing special characters", () => {
    const out = writeFrontmatter("x\n", { jira_summary: "Fix: the thing" });
    expect(out).toBe(`---\njira_summary: "Fix: the thing"\n---\nx\n`);
  });

  it("returns null when the existing frontmatter cannot be round-tripped", () => {
    const input = `---\nnested: { deeply: { a: 1 } }\n---\nbody\n`;
    expect(writeFrontmatter(input, { k: "v" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/frontmatter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Commit (test only)**

```bash
git add src/frontmatter.test.ts
git commit -m "test: failing tests for frontmatter reader/writer"
```

---

## Task 5: `Frontmatter` — implementation

**Files:**
- Create: `/Users/earchibald/Projects/jira-bases/src/frontmatter.ts`

- [ ] **Step 1: Write the implementation**

```ts
export type Frontmatter = Record<string, unknown>;

const FM_BOUND = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function readFrontmatter(content: string): {
  frontmatter: Frontmatter;
  body: string;
} {
  const match = content.match(FM_BOUND);
  if (!match) return { frontmatter: {}, body: content };
  const parsed = parseYamlSubset(match[1]);
  if (parsed === null) {
    return { frontmatter: {}, body: content.slice(match[0].length) };
  }
  return { frontmatter: parsed, body: content.slice(match[0].length) };
}

export function writeFrontmatter(
  content: string,
  patch: Frontmatter,
): string | null {
  const match = content.match(FM_BOUND);
  let base: Frontmatter = {};
  let body = content;
  if (match) {
    const parsed = parseYamlSubset(match[1]);
    if (parsed === null) return null;
    base = parsed;
    body = content.slice(match[0].length);
  }
  const merged: Frontmatter = { ...base, ...patch };
  const yaml = emitYamlSubset(merged);
  if (yaml === null) return null;
  if (yaml.length === 0) {
    return `---\n---\n${body}`;
  }
  return `---\n${yaml}---\n${body}`;
}

// --- YAML subset parser ---
// Supports: top-level scalar keys, string values (plain or quoted),
// and list-of-scalars values (either `[a, b]` inline or block `-` items).
// Returns null for any unsupported construct (nested maps, multi-line strings, etc.).

function parseYamlSubset(src: string): Frontmatter | null {
  const lines = src.split(/\r?\n/);
  const out: Frontmatter = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (/^\s/.test(line)) return null; // unexpected indent at top level
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!m) return null;
    const key = m[1];
    const rest = m[2];
    if (rest === "") {
      // Block list follows, or empty string value
      const items: string[] = [];
      let j = i + 1;
      while (j < lines.length && /^\s+-\s+/.test(lines[j])) {
        const itemMatch = lines[j].match(/^\s+-\s+(.*)$/);
        if (!itemMatch) return null;
        const v = parseScalar(itemMatch[1]);
        if (v === null) return null;
        items.push(v);
        j++;
      }
      if (j === i + 1) {
        out[key] = "";
      } else {
        out[key] = items;
      }
      i = j;
      continue;
    }
    if (rest.startsWith("[") && rest.endsWith("]")) {
      const inner = rest.slice(1, -1).trim();
      if (inner === "") {
        out[key] = [];
      } else {
        const parts = inner.split(",").map((s) => s.trim());
        const items: string[] = [];
        for (const p of parts) {
          const v = parseScalar(p);
          if (v === null) return null;
          items.push(v);
        }
        out[key] = items;
      }
      i++;
      continue;
    }
    const scalar = parseScalar(rest);
    if (scalar === null) return null;
    out[key] = scalar;
    i++;
  }
  return out;
}

function parseScalar(s: string): string | null {
  if (s.length === 0) return "";
  const first = s[0];
  if (first === '"' || first === "'") {
    if (s.length < 2 || s[s.length - 1] !== first) return null;
    const inner = s.slice(1, -1);
    if (first === '"') {
      // Minimal unescape: \" and \\
      return inner.replace(/\\(["\\])/g, "$1");
    }
    return inner;
  }
  if (s.startsWith("{") || s.includes(": ") || s.includes(" #")) return null;
  return s;
}

// --- YAML subset emitter ---

function emitYamlSubset(fm: Frontmatter): string | null {
  const keys = Object.keys(fm);
  if (keys.length === 0) return "";
  const lines: string[] = [];
  for (const k of keys) {
    const v = fm[k];
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) return null;
    if (v === null || v === undefined) {
      lines.push(`${k}: null`);
      continue;
    }
    if (Array.isArray(v)) {
      if (v.length === 0) {
        lines.push(`${k}: []`);
        continue;
      }
      lines.push(`${k}:`);
      for (const item of v) {
        if (typeof item !== "string") return null;
        lines.push(`  - ${emitScalar(item)}`);
      }
      continue;
    }
    if (typeof v === "string") {
      lines.push(`${k}: ${emitScalar(v)}`);
      continue;
    }
    if (typeof v === "number" || typeof v === "boolean") {
      lines.push(`${k}: ${String(v)}`);
      continue;
    }
    return null;
  }
  return lines.join("\n") + "\n";
}

function emitScalar(s: string): string {
  // Quote if contains any YAML-significant character or leading/trailing space.
  if (
    s.length === 0 ||
    /[:#\[\]{}&*!|>'"%@`,]/.test(s) ||
    /^\s|\s$/.test(s) ||
    /^(true|false|null|~|yes|no)$/i.test(s) ||
    /^-?\d/.test(s)
  ) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `npm test -- src/frontmatter.test.ts`
Expected: PASS — all tests.

- [ ] **Step 3: Commit**

```bash
git add src/frontmatter.ts
git commit -m "feat: frontmatter read/write — YAML subset for managed keys"
```

---

## Task 6: `IssueDetails` parser — failing tests

**Files:**
- Create: `/Users/earchibald/Projects/jira-bases/src/jira-fields.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { parseIssueDetails } from "./jira-fields";

const BASE = "https://jira.me.com";

const full = {
  key: "ABC-1",
  fields: {
    summary: "Fix login",
    status: { name: "In Progress" },
    issuetype: { name: "Bug" },
    priority: { name: "High" },
    assignee: { displayName: "Eugene" },
    reporter: { displayName: "Colleague" },
    labels: ["frontend", "auth"],
    updated: "2026-04-15T09:22:00.000+0000",
  },
};

describe("parseIssueDetails", () => {
  it("parses a full payload", () => {
    expect(parseIssueDetails(full, BASE)).toEqual({
      key: "ABC-1",
      summary: "Fix login",
      status: "In Progress",
      type: "Bug",
      priority: "High",
      assignee: "Eugene",
      reporter: "Colleague",
      labels: ["frontend", "auth"],
      updated: "2026-04-15T09:22:00.000+0000",
      url: "https://jira.me.com/browse/ABC-1",
    });
  });

  it("nulls missing optional fields", () => {
    const payload = JSON.parse(JSON.stringify(full));
    delete payload.fields.priority;
    delete payload.fields.assignee;
    delete payload.fields.reporter;
    payload.fields.labels = [];
    const result = parseIssueDetails(payload, BASE);
    expect(result).not.toBeNull();
    expect(result!.priority).toBeNull();
    expect(result!.assignee).toBeNull();
    expect(result!.reporter).toBeNull();
    expect(result!.labels).toEqual([]);
  });

  it("returns null when required fields missing", () => {
    const payload = JSON.parse(JSON.stringify(full));
    delete payload.fields.summary;
    expect(parseIssueDetails(payload, BASE)).toBeNull();
  });

  it("strips trailing slash in the derived URL", () => {
    const result = parseIssueDetails(full, `${BASE}/`);
    expect(result!.url).toBe(`${BASE}/browse/ABC-1`);
  });

  it("returns null when the key is not a string", () => {
    const payload = { ...full, key: 123 };
    expect(parseIssueDetails(payload, BASE)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/jira-fields.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Commit (test only)**

```bash
git add src/jira-fields.test.ts
git commit -m "test: failing tests for IssueDetails parser"
```

---

## Task 7: `IssueDetails` parser — implementation

**Files:**
- Create: `/Users/earchibald/Projects/jira-bases/src/jira-fields.ts`

- [ ] **Step 1: Write the implementation**

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
  updated: string;
  url: string;
}

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, "");
}

function stringOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function nestedName(obj: unknown): string | null {
  if (obj && typeof obj === "object" && "name" in obj) {
    const name = (obj as { name?: unknown }).name;
    return typeof name === "string" ? name : null;
  }
  return null;
}

function nestedDisplayName(obj: unknown): string | null {
  if (obj && typeof obj === "object" && "displayName" in obj) {
    const v = (obj as { displayName?: unknown }).displayName;
    return typeof v === "string" ? v : null;
  }
  return null;
}

export function parseIssueDetails(
  raw: unknown,
  baseUrl: string,
): IssueDetails | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const key = stringOrNull(obj.key);
  const fields = obj.fields;
  if (!key || !fields || typeof fields !== "object") return null;
  const f = fields as Record<string, unknown>;

  const summary = stringOrNull(f.summary);
  const status = nestedName(f.status);
  const type = nestedName(f.issuetype);
  const updated = stringOrNull(f.updated);
  if (!summary || !status || !type || !updated) return null;

  const labelsRaw = f.labels;
  const labels = Array.isArray(labelsRaw)
    ? labelsRaw.filter((l): l is string => typeof l === "string")
    : [];

  return {
    key,
    summary,
    status,
    type,
    priority: nestedName(f.priority),
    assignee: nestedDisplayName(f.assignee),
    reporter: nestedDisplayName(f.reporter),
    labels,
    updated,
    url: `${normalizeBase(baseUrl)}/browse/${key}`,
  };
}
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `npm test -- src/jira-fields.test.ts`
Expected: PASS — all tests.

- [ ] **Step 3: Commit**

```bash
git add src/jira-fields.ts
git commit -m "feat: parseIssueDetails for /rest/api/2/issue/{key} responses"
```

---

## Task 8: `JiraClient.getIssueDetails` — failing tests

**Files:**
- Modify: `/Users/earchibald/Projects/jira-bases/src/jira-client.test.ts`

- [ ] **Step 1: Append a new describe block**

Open `src/jira-client.test.ts`. Add to the top imports (merge with existing imports — do NOT duplicate):

```ts
import type { HttpRequest } from "./jira-client";
```

Append at the bottom of the file:

```ts
describe("JiraClient.getIssueDetails", () => {
  const BASE = "https://jira.me.com";

  function mkRequest(
    handler: (url: string, headers: Record<string, string>) => {
      status: number;
      body: unknown;
    },
  ): HttpRequest {
    return async ({ url, headers }) => {
      const res = handler(url, headers);
      return {
        status: res.status,
        text: async () =>
          typeof res.body === "string" ? res.body : JSON.stringify(res.body),
        json: async () => res.body,
      };
    };
  }

  const fullPayload = {
    key: "ABC-1",
    fields: {
      summary: "Fix login",
      status: { name: "In Progress" },
      issuetype: { name: "Bug" },
      priority: { name: "High" },
      assignee: { displayName: "Eugene" },
      reporter: { displayName: "Colleague" },
      labels: ["frontend"],
      updated: "2026-04-15T09:22:00.000+0000",
    },
  };

  it("returns ok with parsed details on 200", async () => {
    let sawUrl = "";
    const client = createJiraClient({
      baseUrl: BASE,
      getToken: async () => "tok",
      request: mkRequest((url) => {
        sawUrl = url;
        return { status: 200, body: fullPayload };
      }),
    });
    const r = await client.getIssueDetails("ABC-1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.key).toBe("ABC-1");
      expect(r.value.url).toBe("https://jira.me.com/browse/ABC-1");
    }
    expect(sawUrl).toContain(
      "/rest/api/2/issue/ABC-1?fields=summary,status,issuetype,priority,assignee,reporter,labels,updated",
    );
  });

  it("returns not-found on 404", async () => {
    const client = createJiraClient({
      baseUrl: BASE,
      getToken: async () => "tok",
      request: mkRequest(() => ({ status: 404, body: "no" })),
    });
    const r = await client.getIssueDetails("ABC-1");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("not-found");
      if (r.error.kind === "not-found") expect(r.error.key).toBe("ABC-1");
    }
  });

  it("returns auth on 401", async () => {
    const client = createJiraClient({
      baseUrl: BASE,
      getToken: async () => "tok",
      request: mkRequest(() => ({ status: 401, body: "no" })),
    });
    const r = await client.getIssueDetails("ABC-1");
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.kind === "auth") {
      expect(r.error.status).toBe(401);
    } else {
      throw new Error("expected auth/401");
    }
  });

  it("returns parse when fields are missing", async () => {
    const client = createJiraClient({
      baseUrl: BASE,
      getToken: async () => "tok",
      request: mkRequest(() => ({ status: 200, body: { key: "ABC-1" } })),
    });
    const r = await client.getIssueDetails("ABC-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("parse");
  });

  it("returns no-token when token is null", async () => {
    const client = createJiraClient({
      baseUrl: BASE,
      getToken: async () => null,
      request: mkRequest(() => ({ status: 200, body: fullPayload })),
    });
    const r = await client.getIssueDetails("ABC-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("no-token");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/jira-client.test.ts`
Expected: FAIL — `getIssueDetails` not on `JiraClient`.

- [ ] **Step 3: Commit (test only)**

```bash
git add src/jira-client.test.ts
git commit -m "test: failing tests for JiraClient.getIssueDetails"
```

---

## Task 9: `JiraClient.getIssueDetails` — implementation

**Files:**
- Modify: `/Users/earchibald/Projects/jira-bases/src/jira-client.ts`

- [ ] **Step 1: Add the `not-found` error variant**

Modify the `JiraError` union (currently lines 18–23) to:

```ts
export type JiraError =
  | { kind: "no-token" }
  | { kind: "auth"; status: 401 | 403; message: string }
  | { kind: "http"; status: number; message: string }
  | { kind: "network"; message: string }
  | { kind: "parse"; message: string }
  | { kind: "not-found"; key: string };
```

- [ ] **Step 2: Import `IssueDetails` and extend the interface**

Add near the top of the file:

```ts
import { parseIssueDetails, IssueDetails } from "./jira-fields";
```

Extend the `JiraClient` interface:

```ts
export interface JiraClient {
  getCurrentUser(): Promise<Result<CurrentUser, JiraError>>;
  getIssueDetails(key: string): Promise<Result<IssueDetails, JiraError>>;
}
```

- [ ] **Step 3: Add the method to `createJiraClient`**

Inside the returned object (after `getCurrentUser`), add:

```ts
    async getIssueDetails(key) {
      const token = await opts.getToken();
      if (!token) return { ok: false, error: { kind: "no-token" } };

      const fields =
        "summary,status,issuetype,priority,assignee,reporter,labels,updated";
      const url = `${base}/rest/api/2/issue/${encodeURIComponent(key)}?fields=${fields}`;

      let response: HttpResponseLike;
      try {
        response = await request({
          url,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });
      } catch (e) {
        return {
          ok: false,
          error: { kind: "network", message: (e as Error).message },
        };
      }

      if (response.status === 404) {
        return { ok: false, error: { kind: "not-found", key } };
      }
      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          error: {
            kind: "auth",
            status: response.status as 401 | 403,
            message: await safeText(response),
          },
        };
      }
      if (response.status < 200 || response.status >= 300) {
        return {
          ok: false,
          error: {
            kind: "http",
            status: response.status,
            message: await safeText(response),
          },
        };
      }

      try {
        const body = (await response.json()) as unknown;
        const details = parseIssueDetails(body, base);
        if (!details) {
          return {
            ok: false,
            error: { kind: "parse", message: "malformed issue payload" },
          };
        }
        return { ok: true, value: details };
      } catch (e) {
        return { ok: false, error: { kind: "parse", message: (e as Error).message } };
      }
    },
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS — previous tests plus the five new `getIssueDetails` tests.

- [ ] **Step 5: Commit**

```bash
git add src/jira-client.ts
git commit -m "feat: JiraClient.getIssueDetails + not-found error"
```

---

## Task 10: `StubWriter` — failing tests

**Files:**
- Create: `/Users/earchibald/Projects/jira-bases/src/stub-writer.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { writeStub, VaultAdapter } from "./stub-writer";
import type { IssueDetails } from "./jira-fields";

function inMemoryVault(initial: Record<string, string> = {}): VaultAdapter & {
  files: Map<string, string>;
  folders: Set<string>;
} {
  const files = new Map<string, string>(Object.entries(initial));
  const folders = new Set<string>();
  return {
    files,
    folders,
    async read(path) {
      return files.has(path) ? files.get(path)! : null;
    },
    async write(path, content) {
      files.set(path, content);
    },
    async exists(path) {
      return files.has(path);
    },
    async ensureFolder(path) {
      folders.add(path);
    },
  };
}

const details: IssueDetails = {
  key: "ABC-1",
  summary: "Fix login",
  status: "In Progress",
  type: "Bug",
  priority: "High",
  assignee: "Eugene",
  reporter: "Colleague",
  labels: ["frontend"],
  updated: "2026-04-15T09:22:00.000+0000",
  url: "https://jira.me.com/browse/ABC-1",
};

describe("writeStub", () => {
  it("creates a new stub with all managed frontmatter and a Notes section", async () => {
    const vault = inMemoryVault();
    await writeStub(vault, "JIRA", details);
    expect(vault.folders.has("JIRA")).toBe(true);
    const written = vault.files.get("JIRA/ABC-1.md")!;
    expect(written).toContain("jira_key: ABC-1");
    expect(written).toContain('jira_summary: "Fix login"');
    expect(written).toContain('jira_status: "In Progress"');
    expect(written).toContain("jira_type: Bug");
    expect(written).toContain("jira_priority: High");
    expect(written).toContain("jira_assignee: Eugene");
    expect(written).toContain("jira_reporter: Colleague");
    expect(written).toContain("jira_labels:\n  - frontend");
    expect(written).toContain("jira_url: https://jira.me.com/browse/ABC-1");
    expect(written).toContain("jira_synced_at:");
    expect(written).toContain("# ABC-1 — Fix login");
    expect(written).toContain("## Notes");
  });

  it("preserves user body below ## Notes on refresh", async () => {
    const vault = inMemoryVault({
      "JIRA/ABC-1.md": `---
jira_key: ABC-1
jira_summary: old
jira_status: To Do
jira_type: Bug
jira_priority: null
jira_assignee: null
jira_reporter: null
jira_labels: []
jira_updated: "2026-04-01T00:00:00.000+0000"
jira_url: https://jira.me.com/browse/ABC-1
jira_synced_at: "2026-04-01T00:00:00.000Z"
---
# ABC-1 — old

[Open in JIRA](https://jira.me.com/browse/ABC-1)

## Notes

my personal note about this issue
with multiple lines
`,
    });
    await writeStub(vault, "JIRA", details);
    const updated = vault.files.get("JIRA/ABC-1.md")!;
    expect(updated).toContain("my personal note about this issue");
    expect(updated).toContain("with multiple lines");
    expect(updated).toContain('jira_summary: "Fix login"');
  });

  it("preserves non-managed frontmatter keys", async () => {
    const vault = inMemoryVault({
      "JIRA/ABC-1.md": `---
jira_key: ABC-1
jira_summary: old
jira_status: To Do
jira_type: Bug
jira_priority: null
jira_assignee: null
jira_reporter: null
jira_labels: []
jira_updated: "2026-04-01T00:00:00.000+0000"
jira_url: https://jira.me.com/browse/ABC-1
jira_synced_at: "2026-04-01T00:00:00.000Z"
custom_tag: mine
---
body
`,
    });
    await writeStub(vault, "JIRA", details);
    const updated = vault.files.get("JIRA/ABC-1.md")!;
    expect(updated).toContain("custom_tag: mine");
  });

  it("updates jira_synced_at to a recent ISO timestamp", async () => {
    const vault = inMemoryVault();
    const before = Date.now();
    await writeStub(vault, "JIRA", details);
    const written = vault.files.get("JIRA/ABC-1.md")!;
    const match = written.match(/jira_synced_at: "([^"]+)"/);
    expect(match).not.toBeNull();
    const t = new Date(match![1]).getTime();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(Date.now() + 1000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/stub-writer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Commit (test only)**

```bash
git add src/stub-writer.test.ts
git commit -m "test: failing tests for StubWriter"
```

---

## Task 11: `StubWriter` — implementation

**Files:**
- Create: `/Users/earchibald/Projects/jira-bases/src/stub-writer.ts`

- [ ] **Step 1: Write the implementation**

```ts
import { readFrontmatter, writeFrontmatter, Frontmatter } from "./frontmatter";
import type { IssueDetails } from "./jira-fields";

export interface VaultAdapter {
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  ensureFolder(path: string): Promise<void>;
}

const MANAGED_KEYS = [
  "jira_key",
  "jira_summary",
  "jira_status",
  "jira_type",
  "jira_priority",
  "jira_assignee",
  "jira_reporter",
  "jira_labels",
  "jira_updated",
  "jira_url",
  "jira_synced_at",
] as const;

function managedPatch(details: IssueDetails): Frontmatter {
  return {
    jira_key: details.key,
    jira_summary: details.summary,
    jira_status: details.status,
    jira_type: details.type,
    jira_priority: details.priority,
    jira_assignee: details.assignee,
    jira_reporter: details.reporter,
    jira_labels: details.labels,
    jira_updated: details.updated,
    jira_url: details.url,
    jira_synced_at: new Date().toISOString(),
  };
}

function initialBody(details: IssueDetails): string {
  return `# ${details.key} — ${details.summary}

[Open in JIRA](${details.url})

## Notes

`;
}

export async function writeStub(
  vault: VaultAdapter,
  stubsFolder: string,
  details: IssueDetails,
): Promise<void> {
  const folder = stubsFolder.replace(/^\/+|\/+$/g, "");
  const path = `${folder}/${details.key}.md`;
  await vault.ensureFolder(folder);

  const existing = await vault.read(path);
  const patch = managedPatch(details);

  if (existing === null) {
    const withFm = writeFrontmatter(initialBody(details), patch);
    if (withFm === null) {
      throw new Error("Failed to emit frontmatter for new stub");
    }
    await vault.write(path, withFm);
    return;
  }

  const updated = writeFrontmatter(existing, patch);
  if (updated === null) {
    throw new Error(
      `Could not round-trip frontmatter in ${path}; stub skipped`,
    );
  }
  await vault.write(path, updated);
}

export { MANAGED_KEYS };
```

Null values for optional fields (`priority`, `assignee`, `reporter`) are emitted as YAML `null` by the frontmatter emitter. On re-read the parser surfaces them as the string `"null"`, which is harmless here because managed keys are always overwritten.

- [ ] **Step 2: Run the tests to verify they pass**

Run: `npm test -- src/stub-writer.test.ts`
Expected: PASS — all tests.

- [ ] **Step 3: Commit**

```bash
git add src/stub-writer.ts
git commit -m "feat: StubWriter — create/refresh per-issue stub notes"
```

---

## Task 12: `Indexer` — failing tests

**Files:**
- Create: `/Users/earchibald/Projects/jira-bases/src/indexer.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import {
  rescanFile,
  collectAllKeys,
  findOrphanedStubs,
  IndexerDeps,
} from "./indexer";

function deps(
  initial: Record<string, string>,
  settings = { baseUrl: "https://jira.me.com", prefixes: [] as string[] },
): IndexerDeps & { files: Map<string, string> } {
  const files = new Map(Object.entries(initial));
  return {
    files,
    async read(path) {
      return files.has(path) ? files.get(path)! : null;
    },
    async write(path, content) {
      files.set(path, content);
    },
    async listNotes() {
      return [...files.keys()].filter((p) => p.endsWith(".md"));
    },
    getSettings: () => settings,
  };
}

describe("rescanFile", () => {
  it("populates jira_issues from content", async () => {
    const d = deps({
      "daily.md":
        "today we looked at [a](https://jira.me.com/browse/ABC-1) and [b](https://jira.me.com/browse/ABC-2)\n",
    });
    await rescanFile(d, "daily.md");
    expect(d.files.get("daily.md")).toContain(
      "jira_issues:\n  - ABC-1\n  - ABC-2",
    );
  });

  it("is a no-op when keys are already present in the same order", async () => {
    const d = deps({
      "daily.md": `---\njira_issues:\n  - ABC-1\n---\nbody with [a](https://jira.me.com/browse/ABC-1)\n`,
    });
    const before = d.files.get("daily.md");
    await rescanFile(d, "daily.md");
    expect(d.files.get("daily.md")).toBe(before);
  });

  it("removes keys that are no longer referenced", async () => {
    const d = deps({
      "daily.md": `---\njira_issues:\n  - ABC-1\n  - ABC-2\n---\nbody only refs [a](https://jira.me.com/browse/ABC-1)\n`,
    });
    await rescanFile(d, "daily.md");
    expect(d.files.get("daily.md")).toContain("jira_issues:\n  - ABC-1\n");
    expect(d.files.get("daily.md")).not.toContain("ABC-2");
  });

  it("uses prefixes for bare-key matching", async () => {
    const d = deps(
      { "daily.md": "See ABC-5 today\n" },
      { baseUrl: "https://jira.me.com", prefixes: ["ABC"] },
    );
    await rescanFile(d, "daily.md");
    expect(d.files.get("daily.md")).toContain("jira_issues:\n  - ABC-5");
  });
});

describe("collectAllKeys", () => {
  it("unions jira_issues lists across notes, skipping the stubs folder", async () => {
    const d = deps({
      "a.md": `---\njira_issues:\n  - ABC-1\n  - ABC-2\n---\n`,
      "b.md": `---\njira_issues:\n  - ABC-2\n  - DEF-3\n---\n`,
      "JIRA/ABC-1.md": `---\njira_issues:\n  - SHOULD-NOT-COUNT\n---\n`,
    });
    const keys = await collectAllKeys(d, "JIRA");
    expect([...keys].sort()).toEqual(["ABC-1", "ABC-2", "DEF-3"]);
  });
});

describe("findOrphanedStubs", () => {
  it("returns stub KEYs not referenced by any note", async () => {
    const d = deps({
      "a.md": `---\njira_issues:\n  - ABC-1\n---\n`,
      "JIRA/ABC-1.md": `---\njira_key: ABC-1\n---\n`,
      "JIRA/ABC-2.md": `---\njira_key: ABC-2\n---\n`,
      "JIRA/DEF-9.md": `---\njira_key: DEF-9\n---\n`,
    });
    const orphans = await findOrphanedStubs(d, "JIRA");
    expect(orphans.sort()).toEqual(["ABC-2", "DEF-9"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/indexer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Commit (test only)**

```bash
git add src/indexer.test.ts
git commit -m "test: failing tests for Indexer"
```

---

## Task 13: `Indexer` — implementation

**Files:**
- Create: `/Users/earchibald/Projects/jira-bases/src/indexer.ts`

- [ ] **Step 1: Write the implementation**

```ts
import { findReferences } from "./ref-scanner";
import { readFrontmatter, writeFrontmatter } from "./frontmatter";

export interface IndexerDeps {
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;
  listNotes(): Promise<string[]>;
  getSettings(): { baseUrl: string; prefixes: string[] };
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
  return true;
}

function asStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

export async function rescanFile(
  deps: IndexerDeps,
  path: string,
): Promise<void> {
  const content = await deps.read(path);
  if (content === null) return;
  const { baseUrl, prefixes } = deps.getSettings();
  const found = [...findReferences(content, baseUrl, prefixes)].sort();

  const { frontmatter } = readFrontmatter(content);
  const existing = asStringList(frontmatter.jira_issues);
  if (found.length === 0 && existing.length === 0) return;
  if (sameSet(found, existing)) return;

  const updated = writeFrontmatter(content, { jira_issues: found });
  if (updated === null) return; // unparseable frontmatter — skip silently
  await deps.write(path, updated);
}

export async function collectAllKeys(
  deps: IndexerDeps,
  stubsFolder: string,
): Promise<Set<string>> {
  const keys = new Set<string>();
  const notes = await deps.listNotes();
  const prefix = stubsFolder.replace(/\/+$/, "") + "/";
  for (const path of notes) {
    if (path.startsWith(prefix)) continue;
    const content = await deps.read(path);
    if (content === null) continue;
    const { frontmatter } = readFrontmatter(content);
    for (const k of asStringList(frontmatter.jira_issues)) keys.add(k);
  }
  return keys;
}

export async function findOrphanedStubs(
  deps: IndexerDeps,
  stubsFolder: string,
): Promise<string[]> {
  const referenced = await collectAllKeys(deps, stubsFolder);
  const prefix = stubsFolder.replace(/\/+$/, "") + "/";
  const notes = await deps.listNotes();
  const orphans: string[] = [];
  for (const path of notes) {
    if (!path.startsWith(prefix)) continue;
    const name = path.slice(prefix.length).replace(/\.md$/, "");
    if (!referenced.has(name)) orphans.push(name);
  }
  return orphans;
}
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `npm test -- src/indexer.test.ts`
Expected: PASS — all tests.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS — all tests from Tasks 2–13.

- [ ] **Step 4: Commit**

```bash
git add src/indexer.ts
git commit -m "feat: Indexer — rescan, collectAllKeys, findOrphanedStubs"
```

---

## Task 14: Confirm modal for orphan cleanup

**Files:**
- Create: `/Users/earchibald/Projects/jira-bases/src/confirm-modal.ts`

- [ ] **Step 1: Write the modal**

```ts
import { App, Modal, Setting } from "obsidian";

export class ConfirmModal extends Modal {
  constructor(
    app: App,
    private title: string,
    private lines: string[],
    private confirmLabel: string,
    private onConfirm: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: this.title });
    const listEl = contentEl.createEl("ul");
    for (const line of this.lines) {
      listEl.createEl("li", { text: line });
    }
    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Cancel").onClick(() => this.close()),
      )
      .addButton((b) =>
        b
          .setButtonText(this.confirmLabel)
          .setWarning()
          .onClick(() => {
            this.close();
            this.onConfirm();
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/confirm-modal.ts
git commit -m "feat: ConfirmModal for orphan stub cleanup"
```

---

## Task 15: Plugin wiring — commands, save handler, vault adapter

**Files:**
- Modify: `/Users/earchibald/Projects/jira-bases/src/main.ts`

- [ ] **Step 1: Replace the entire `main.ts`**

Overwrite the file contents with:

```ts
import {
  Plugin,
  Notice,
  TFile,
  TFolder,
  debounce,
  requestUrl,
} from "obsidian";
import { createSecretStore, SecretStore } from "./secret-store";
import type { HttpRequest } from "./jira-client";
import { createJiraClient, JiraError, JiraClient } from "./jira-client";
import {
  DEFAULT_SETTINGS,
  JiraBasesSettingTab,
  PluginSettings,
} from "./settings";
import {
  collectAllKeys,
  findOrphanedStubs,
  rescanFile,
  IndexerDeps,
} from "./indexer";
import { writeStub, VaultAdapter } from "./stub-writer";
import { ConfirmModal } from "./confirm-modal";

const obsidianRequest: HttpRequest = async ({ url, headers }) => {
  const r = await requestUrl({ url, headers, method: "GET", throw: false });
  return {
    status: r.status,
    text: async () => r.text,
    json: async () => r.json,
  };
};

function getSafeStorage() {
  const electron = require("electron");
  const ss =
    electron?.remote?.safeStorage ??
    (() => {
      try {
        return require("@electron/remote").safeStorage;
      } catch {
        return undefined;
      }
    })();
  if (!ss) {
    throw new Error(
      "Electron safeStorage is unavailable in this Obsidian build.",
    );
  }
  return ss;
}

export default class JiraBasesPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  secrets!: SecretStore;
  private debouncedRescan: Map<string, () => void> = new Map();

  async onload() {
    await this.loadSettings();
    this.secrets = createSecretStore({
      safeStorage: getSafeStorage(),
      load: async () => this.settings.encryptedTokens,
      save: async (tokens) => {
        this.settings.encryptedTokens = tokens;
        await this.saveSettings();
      },
    });
    this.addSettingTab(new JiraBasesSettingTab(this.app, this));

    this.addCommand({
      id: "test-connection",
      name: "JIRA: Test connection",
      callback: () => this.testConnection(),
    });

    this.addCommand({
      id: "rescan-note",
      name: "JIRA: Rescan this note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) {
          rescanFile(this.makeIndexerDeps(), file.path).catch((e) =>
            new Notice(`Rescan failed: ${(e as Error).message}`),
          );
        }
        return true;
      },
    });

    this.addCommand({
      id: "sync-issue-stubs",
      name: "JIRA: Sync issue stubs",
      callback: () => this.syncIssueStubs(),
    });

    this.addCommand({
      id: "clean-orphaned-stubs",
      name: "JIRA: Clean orphaned stubs",
      callback: () => this.cleanOrphanedStubs(),
    });

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (!(file instanceof TFile)) return;
        if (file.extension !== "md") return;
        const stubPrefix = this.settings.stubsFolder.replace(/\/+$/, "") + "/";
        if (file.path.startsWith(stubPrefix)) return;
        this.scheduleRescan(file.path);
      }),
    );
  }

  private scheduleRescan(path: string): void {
    let fn = this.debouncedRescan.get(path);
    if (!fn) {
      fn = debounce(
        () => {
          rescanFile(this.makeIndexerDeps(), path).catch((e) =>
            console.warn("jira-bases rescan failed", path, e),
          );
        },
        500,
        true,
      );
      this.debouncedRescan.set(path, fn);
    }
    fn();
  }

  private makeIndexerDeps(): IndexerDeps {
    return {
      read: async (path) => {
        const f = this.app.vault.getAbstractFileByPath(path);
        if (!(f instanceof TFile)) return null;
        return this.app.vault.read(f);
      },
      write: async (path, content) => {
        const f = this.app.vault.getAbstractFileByPath(path);
        if (f instanceof TFile) {
          await this.app.vault.modify(f, content);
        } else {
          await this.app.vault.create(path, content);
        }
      },
      listNotes: async () => {
        const out: string[] = [];
        const files = this.app.vault.getMarkdownFiles();
        for (const f of files) out.push(f.path);
        return out;
      },
      getSettings: () => ({
        baseUrl: this.settings.baseUrl,
        prefixes: this.settings.projectPrefixes,
      }),
    };
  }

  private makeVaultAdapter(): VaultAdapter {
    return {
      read: async (path) => {
        const f = this.app.vault.getAbstractFileByPath(path);
        if (!(f instanceof TFile)) return null;
        return this.app.vault.read(f);
      },
      write: async (path, content) => {
        const f = this.app.vault.getAbstractFileByPath(path);
        if (f instanceof TFile) {
          await this.app.vault.modify(f, content);
        } else {
          await this.app.vault.create(path, content);
        }
      },
      exists: async (path) => {
        return this.app.vault.getAbstractFileByPath(path) instanceof TFile;
      },
      ensureFolder: async (path) => {
        const existing = this.app.vault.getAbstractFileByPath(path);
        if (existing instanceof TFolder) return;
        await this.app.vault.createFolder(path).catch((e) => {
          if (!String(e).includes("already exists")) throw e;
        });
      },
    };
  }

  private makeClient(): JiraClient {
    return createJiraClient({
      baseUrl: this.settings.baseUrl,
      getToken: () => this.secrets.get(this.settings.baseUrl),
      request: obsidianRequest,
    });
  }

  async loadSettings() {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async testConnection(): Promise<void> {
    const baseUrl = this.settings.baseUrl;
    if (!baseUrl) {
      new Notice("Set your JIRA base URL in plugin settings.");
      return;
    }
    const result = await this.makeClient().getCurrentUser();
    if (result.ok) {
      new Notice(`Connected as ${result.value.displayName}.`);
    } else {
      new Notice(errorMessage(result.error));
    }
  }

  async syncIssueStubs(): Promise<void> {
    if (!this.settings.baseUrl) {
      new Notice("Set your JIRA base URL in plugin settings.");
      return;
    }
    const deps = this.makeIndexerDeps();
    const vault = this.makeVaultAdapter();
    const client = this.makeClient();
    const keys = [...(await collectAllKeys(deps, this.settings.stubsFolder))];
    if (keys.length === 0) {
      new Notice("No JIRA references found in vault.");
      return;
    }
    let synced = 0;
    let failed = 0;
    for (const key of keys) {
      const r = await client.getIssueDetails(key);
      if (!r.ok) {
        failed++;
        console.warn(`jira-bases: ${key} — ${r.error.kind}`);
        continue;
      }
      try {
        await writeStub(vault, this.settings.stubsFolder, r.value);
        synced++;
      } catch (e) {
        failed++;
        console.warn(`jira-bases: ${key} — write failed`, e);
      }
    }
    new Notice(`Synced ${synced} stubs (${failed} failed).`);
  }

  async cleanOrphanedStubs(): Promise<void> {
    const deps = this.makeIndexerDeps();
    const orphans = await findOrphanedStubs(deps, this.settings.stubsFolder);
    if (orphans.length === 0) {
      new Notice("No orphaned stubs.");
      return;
    }
    new ConfirmModal(
      this.app,
      `Delete ${orphans.length} orphaned stub${orphans.length === 1 ? "" : "s"}?`,
      orphans,
      "Delete",
      async () => {
        let deleted = 0;
        let failed = 0;
        const prefix = this.settings.stubsFolder.replace(/\/+$/, "") + "/";
        for (const key of orphans) {
          const path = `${prefix}${key}.md`;
          const f = this.app.vault.getAbstractFileByPath(path);
          if (!(f instanceof TFile)) {
            failed++;
            continue;
          }
          try {
            await this.app.vault.delete(f);
            deleted++;
          } catch {
            failed++;
          }
        }
        new Notice(`Deleted ${deleted} orphaned stubs${failed ? ` (${failed} failed)` : ""}.`);
      },
    ).open();
  }
}

function errorMessage(err: JiraError): string {
  switch (err.kind) {
    case "no-token":
      return "Set your JIRA Personal Access Token in plugin settings.";
    case "auth":
      return `Authentication failed (HTTP ${err.status}). Check your PAT.`;
    case "network":
      return `Could not reach JIRA: ${err.message}.`;
    case "http":
      return `JIRA returned HTTP ${err.status}: ${err.message}.`;
    case "parse":
      return "Unexpected response from JIRA.";
    case "not-found":
      return `Issue ${err.key} not found.`;
  }
}
```

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS; `main.js` emitted.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: PASS — all unit tests.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: commands, save handler, and adapters for v0.3 Bases index"
```

---

## Task 16: Manual smoke test in dev vault

**Files:** none (manual verification)

- [ ] **Step 1: Build and symlink**

```bash
npm run build
VAULT=~/ObsidianVaults/Scratch
mkdir -p "$VAULT/.obsidian/plugins/jira-bases"
ln -sf "$PWD/main.js" "$VAULT/.obsidian/plugins/jira-bases/main.js"
ln -sf "$PWD/manifest.json" "$VAULT/.obsidian/plugins/jira-bases/manifest.json"
```

- [ ] **Step 2: Reload plugin in Obsidian**

Settings → Community plugins → toggle "JIRA Bases" off then on.

- [ ] **Step 3: Verify link-based scan on save**

Create a note `test-link.md` with:

```markdown
Today I reviewed [ABC-1 fix login](https://jira.me.com/browse/ABC-1).
```

(Replace with your real base URL.) Save. Open frontmatter — verify `jira_issues: [ABC-1]` appears within ~1 second.

- [ ] **Step 4: Verify bare-key scan with prefixes**

In settings, set **Project prefixes** to `ABC`. Edit `test-link.md` to add `Also saw ABC-2.` and save. Verify `jira_issues` now contains `[ABC-1, ABC-2]`.

- [ ] **Step 5: Verify bare-key scan does NOT fire without prefixes**

In settings, clear Project prefixes. Create `test-bare.md` with `Only ABC-9 here.`, save. Verify `jira_issues` is absent or empty.

- [ ] **Step 6: Verify `sync-issue-stubs`**

Restore prefixes `ABC`. Run command palette → "JIRA: Sync issue stubs". Verify `JIRA/ABC-1.md` and `JIRA/ABC-2.md` are created with frontmatter populated.

- [ ] **Step 7: Verify `## Notes` preservation on refresh**

Edit `JIRA/ABC-1.md`, add `my private note` below `## Notes`. Re-run "JIRA: Sync issue stubs". Verify the text is preserved and `jira_synced_at` updated.

- [ ] **Step 8: Verify `clean-orphaned-stubs`**

Edit `test-link.md` to remove all ABC-2 references, save. Run "JIRA: Clean orphaned stubs". Verify the modal lists `ABC-2`. Confirm. Verify `JIRA/ABC-2.md` is deleted; `JIRA/ABC-1.md` remains.

- [ ] **Step 9: Verify stubs-folder exclusion**

Confirm that editing a stub file (e.g. adding text below `## Notes`) does NOT cause the save handler to add a `jira_issues` frontmatter to the stub itself.

- [ ] **Step 10: Verify an authored `.base` over stubs works**

Create `JIRA-issues.base` in the vault root:

```yaml
filters:
  and:
    - file.inFolder("JIRA")
views:
  - type: table
    name: "Issues"
    order:
      - file.name
      - jira_status
      - jira_priority
      - jira_assignee
      - jira_updated
```

Open it. Verify each stub appears as a row with its live fields.

- [ ] **Step 11: Tag a release candidate**

```bash
git tag v0.3.0-rc1
```

---

## Task 17: README update

**Files:**
- Modify: `/Users/earchibald/Projects/jira-bases/README.md`

- [ ] **Step 1: Add the v0.3 section**

Append after the existing "Scope (v0.1)" section:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: v0.3 Bases index usage"
```
