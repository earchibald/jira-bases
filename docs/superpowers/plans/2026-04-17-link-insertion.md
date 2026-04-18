# v0.2 Smart Link Insertion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two Obsidian commands that let a user pick a JIRA issue in a modal and insert a markdown link using a configurable template.

**Architecture:** Three new files (`template.ts`, `issue-suggest-modal.ts`, and test siblings), plus extensions to `jira-client.ts`, `settings.ts`, and `main.ts`. Pure template rendering and JQL escaping are extracted so they're unit-testable; the SuggestModal subclass stays thin.

**Tech Stack:** TypeScript (strict), Obsidian plugin API (`SuggestModal`, `Editor`), `vitest` + `msw` for HTTP tests.

**Prerequisite:** `src/jira-client.ts` already has an unstaged change adding `HttpRequest` injection (visible in `git diff`). That change must be staged/committed before starting — the tests here assume it.

---

## File Structure

- **Create:** `src/template.ts` — `renderTemplate(template, fields)` pure function.
- **Create:** `src/template.test.ts`
- **Create:** `src/issue-suggest-modal.ts` — `IssueSuggestModal` + pure helpers `isIssueKey` and `escapeJqlText`.
- **Create:** `src/issue-suggest-modal.test.ts` — tests for the pure helpers only.
- **Modify:** `src/jira-client.ts` — add `Issue`, `getIssue`, `searchIssues`, `not-found` error variant.
- **Modify:** `src/jira-client.test.ts` — add coverage for new methods.
- **Modify:** `src/settings.ts` — add `linkTemplate` setting + UI row with reset.
- **Modify:** `src/main.ts` — register two new commands, pass settings.linkTemplate through.

---

## Task 1: Commit the pre-existing `HttpRequest` injection change

**Files:**
- Modify: (working-tree change already present in `src/jira-client.ts`)

- [ ] **Step 1: Inspect the diff**

Run: `git diff src/jira-client.ts`
Expected: the diff adds `HttpResponseLike`, `HttpRequest`, `defaultRequest`, a `request` option on `JiraClientOptions`, and rewrites `getCurrentUser` to call `request(...)` instead of `fetch(...)` directly.

- [ ] **Step 2: Run the existing tests against the change**

Run: `npm test -- src/jira-client.test.ts`
Expected: all `JiraClient.getCurrentUser` cases pass.

- [ ] **Step 3: Commit**

```bash
git add src/jira-client.ts
git commit -m "refactor(jira-client): inject HttpRequest for test override"
```

---

## Task 2: `renderTemplate` pure function (TDD)

**Files:**
- Create: `src/template.ts`
- Create: `src/template.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/template.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderTemplate, IssueFields } from "./template";

const fields: IssueFields = {
  key: "ABC-123",
  summary: "Fix login",
  status: "In Progress",
  type: "Bug",
  url: "https://jira.me.com/browse/ABC-123",
};

describe("renderTemplate", () => {
  it("substitutes all known tokens", () => {
    expect(
      renderTemplate("[{key} {summary}]({url})", fields),
    ).toBe("[ABC-123 Fix login](https://jira.me.com/browse/ABC-123)");
  });

  it("supports status and type tokens", () => {
    expect(renderTemplate("{type}/{status}: {key}", fields)).toBe(
      "Bug/In Progress: ABC-123",
    );
  });

  it("repeats a token as many times as it appears", () => {
    expect(renderTemplate("{key} {key}", fields)).toBe("ABC-123 ABC-123");
  });

  it("leaves unknown tokens as-is", () => {
    expect(renderTemplate("{key} {bogus}", fields)).toBe("ABC-123 {bogus}");
  });

  it("renders missing fields as empty string", () => {
    const partial = { ...fields, status: "" };
    expect(renderTemplate("[{status}] {key}", partial)).toBe("[] ABC-123");
  });

  it("handles an empty template", () => {
    expect(renderTemplate("", fields)).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/template.test.ts`
Expected: FAIL — cannot resolve `./template`.

- [ ] **Step 3: Write minimal implementation**

Create `src/template.ts`:

```ts
export interface IssueFields {
  key: string;
  summary: string;
  status: string;
  type: string;
  url: string;
}

const KNOWN_TOKENS: ReadonlyArray<keyof IssueFields> = [
  "key",
  "summary",
  "status",
  "type",
  "url",
];

export function renderTemplate(template: string, fields: IssueFields): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (match, name: string) => {
    if ((KNOWN_TOKENS as readonly string[]).includes(name)) {
      return fields[name as keyof IssueFields] ?? "";
    }
    return match;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/template.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/template.ts src/template.test.ts
git commit -m "feat(template): render link templates with issue fields"
```

---

## Task 3: `JiraClient.getIssue` (TDD)

**Files:**
- Modify: `src/jira-client.ts`
- Modify: `src/jira-client.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/jira-client.test.ts`:

```ts
describe("JiraClient.getIssue", () => {
  it("returns ok with issue fields on 200", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/issue/ABC-123`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("fields")).toBe(
          "summary,status,issuetype",
        );
        return HttpResponse.json({
          key: "ABC-123",
          fields: {
            summary: "Fix login",
            status: { name: "In Progress" },
            issuetype: { name: "Bug" },
          },
        });
      }),
    );
    const result = await client("tok").getIssue("ABC-123");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        key: "ABC-123",
        summary: "Fix login",
        status: "In Progress",
        type: "Bug",
      });
    }
  });

  it("returns not-found error on 404", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/issue/NOPE-1`, () =>
        HttpResponse.text("missing", { status: 404 }),
      ),
    );
    const result = await client("tok").getIssue("NOPE-1");
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "not-found") {
      expect(result.error.key).toBe("NOPE-1");
    } else {
      throw new Error("expected not-found");
    }
  });

  it("returns auth error on 401", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/issue/ABC-1`, () =>
        HttpResponse.text("nope", { status: 401 }),
      ),
    );
    const result = await client("tok").getIssue("ABC-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("auth");
  });

  it("returns parse error when summary is missing", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/issue/ABC-2`, () =>
        HttpResponse.json({ key: "ABC-2", fields: {} }),
      ),
    );
    const result = await client("tok").getIssue("ABC-2");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("parse");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/jira-client.test.ts`
Expected: FAIL — `getIssue` does not exist.

- [ ] **Step 3: Add `Issue` type, `not-found` error variant, and `getIssue`**

In `src/jira-client.ts`, replace the `CurrentUser` export block with:

```ts
export type CurrentUser = {
  displayName: string;
  accountId: string;
  emailAddress?: string;
};

export interface Issue {
  key: string;
  summary: string;
  status: string;
  type: string;
}
```

Replace the `JiraError` union with:

```ts
export type JiraError =
  | { kind: "no-token" }
  | { kind: "auth"; status: 401 | 403; message: string }
  | { kind: "http"; status: number; message: string }
  | { kind: "network"; message: string }
  | { kind: "parse"; message: string }
  | { kind: "not-found"; key: string };
```

Replace the `JiraClient` interface with:

```ts
export interface JiraClient {
  getCurrentUser(): Promise<Result<CurrentUser, JiraError>>;
  getIssue(key: string): Promise<Result<Issue, JiraError>>;
}
```

Inside the object returned by `createJiraClient`, after `getCurrentUser`, add:

```ts
    async getIssue(key) {
      const token = await opts.getToken();
      if (!token) return { ok: false, error: { kind: "no-token" } };

      let response: HttpResponseLike;
      try {
        response = await request({
          url: `${base}/rest/api/2/issue/${encodeURIComponent(
            key,
          )}?fields=summary,status,issuetype`,
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
            status: response.status,
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
        const body = (await response.json()) as {
          key?: string;
          fields?: {
            summary?: string;
            status?: { name?: string };
            issuetype?: { name?: string };
          };
        };
        const issueKey = body.key ?? key;
        const summary = body.fields?.summary;
        const status = body.fields?.status?.name ?? "";
        const type = body.fields?.issuetype?.name ?? "";
        if (typeof summary !== "string") {
          return {
            ok: false,
            error: { kind: "parse", message: "missing summary" },
          };
        }
        return {
          ok: true,
          value: { key: issueKey, summary, status, type },
        };
      } catch (e) {
        return {
          ok: false,
          error: { kind: "parse", message: (e as Error).message },
        };
      }
    },
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/jira-client.test.ts`
Expected: all `JiraClient.getCurrentUser` and `JiraClient.getIssue` cases PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/jira-client.ts src/jira-client.test.ts
git commit -m "feat(jira-client): add getIssue with not-found handling"
```

---

## Task 4: `JiraClient.searchIssues` + `escapeJqlText` helper (TDD)

**Files:**
- Modify: `src/jira-client.ts`
- Modify: `src/jira-client.test.ts`
- Create: `src/issue-suggest-modal.ts` (helper-only at this point)
- Create: `src/issue-suggest-modal.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `src/issue-suggest-modal.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isIssueKey, escapeJqlText } from "./issue-suggest-modal";

describe("isIssueKey", () => {
  it("accepts standard keys", () => {
    expect(isIssueKey("ABC-123")).toBe(true);
    expect(isIssueKey("abc-1")).toBe(true);
    expect(isIssueKey("AB2-99")).toBe(true);
  });

  it("rejects non-keys", () => {
    expect(isIssueKey("fix login")).toBe(false);
    expect(isIssueKey("ABC")).toBe(false);
    expect(isIssueKey("123")).toBe(false);
    expect(isIssueKey("ABC-")).toBe(false);
    expect(isIssueKey("ABC 123")).toBe(false);
  });
});

describe("escapeJqlText", () => {
  it("escapes backslashes and double quotes", () => {
    expect(escapeJqlText(`he said "hi" \\ there`)).toBe(
      `he said \\"hi\\" \\\\ there`,
    );
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeJqlText("fix login")).toBe("fix login");
  });
});
```

- [ ] **Step 2: Write failing searchIssues test**

Append to `src/jira-client.test.ts`:

```ts
describe("JiraClient.searchIssues", () => {
  it("returns ok with mapped issues on 200", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/search`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("jql")).toBe(
          'text ~ "fix login" ORDER BY updated DESC',
        );
        expect(url.searchParams.get("fields")).toBe(
          "summary,status,issuetype",
        );
        expect(url.searchParams.get("maxResults")).toBe("20");
        return HttpResponse.json({
          issues: [
            {
              key: "ABC-1",
              fields: {
                summary: "Fix login",
                status: { name: "Open" },
                issuetype: { name: "Bug" },
              },
            },
          ],
        });
      }),
    );
    const result = await client("tok").searchIssues("fix login", 20);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([
        { key: "ABC-1", summary: "Fix login", status: "Open", type: "Bug" },
      ]);
    }
  });

  it("returns ok with empty list when no issues", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/search`, () =>
        HttpResponse.json({ issues: [] }),
      ),
    );
    const result = await client("tok").searchIssues("none", 20);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it("returns http error on 400", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/search`, () =>
        HttpResponse.text("bad jql", { status: 400 }),
      ),
    );
    const result = await client("tok").searchIssues("x", 20);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "http") {
      expect(result.error.status).toBe(400);
    } else {
      throw new Error("expected http/400");
    }
  });

  it("escapes quotes and backslashes in the JQL", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/search`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("jql")).toBe(
          'text ~ "he said \\"hi\\" \\\\ bye" ORDER BY updated DESC',
        );
        return HttpResponse.json({ issues: [] });
      }),
    );
    const result = await client("tok").searchIssues(
      'he said "hi" \\ bye',
      20,
    );
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `./issue-suggest-modal` missing; `searchIssues` not implemented.

- [ ] **Step 4: Create helpers-only `issue-suggest-modal.ts`**

Create `src/issue-suggest-modal.ts`:

```ts
export function isIssueKey(input: string): boolean {
  return /^[A-Za-z][A-Za-z0-9]+-\d+$/.test(input);
}

export function escapeJqlText(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
```

- [ ] **Step 5: Add `searchIssues` to `JiraClient`**

In `src/jira-client.ts`, add an import at the top:

```ts
import { escapeJqlText } from "./issue-suggest-modal";
```

Extend the `JiraClient` interface:

```ts
export interface JiraClient {
  getCurrentUser(): Promise<Result<CurrentUser, JiraError>>;
  getIssue(key: string): Promise<Result<Issue, JiraError>>;
  searchIssues(query: string, limit: number): Promise<Result<Issue[], JiraError>>;
}
```

Inside the object returned by `createJiraClient`, after `getIssue`, add:

```ts
    async searchIssues(query, limit) {
      const token = await opts.getToken();
      if (!token) return { ok: false, error: { kind: "no-token" } };

      const jql = `text ~ "${escapeJqlText(query)}" ORDER BY updated DESC`;
      const url =
        `${base}/rest/api/2/search` +
        `?jql=${encodeURIComponent(jql)}` +
        `&fields=${encodeURIComponent("summary,status,issuetype")}` +
        `&maxResults=${limit}`;

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

      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          error: {
            kind: "auth",
            status: response.status,
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
        const body = (await response.json()) as {
          issues?: Array<{
            key?: string;
            fields?: {
              summary?: string;
              status?: { name?: string };
              issuetype?: { name?: string };
            };
          }>;
        };
        const issues: Issue[] = (body.issues ?? []).flatMap((raw) => {
          if (typeof raw.key !== "string") return [];
          const summary = raw.fields?.summary;
          if (typeof summary !== "string") return [];
          return [{
            key: raw.key,
            summary,
            status: raw.fields?.status?.name ?? "",
            type: raw.fields?.issuetype?.name ?? "",
          }];
        });
        return { ok: true, value: issues };
      } catch (e) {
        return {
          ok: false,
          error: { kind: "parse", message: (e as Error).message },
        };
      }
    },
```

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: all pass (template, client getCurrentUser/getIssue/searchIssues, suggest-modal helpers).

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/jira-client.ts src/jira-client.test.ts src/issue-suggest-modal.ts src/issue-suggest-modal.test.ts
git commit -m "feat(jira-client): add searchIssues with JQL escaping"
```

---

## Task 5: Settings — add `linkTemplate`

**Files:**
- Modify: `src/settings.ts`

- [ ] **Step 1: Extend `PluginSettings` and defaults**

In `src/settings.ts`, replace the `PluginSettings`/`DEFAULT_SETTINGS` block with:

```ts
export interface PluginSettings {
  baseUrl: string;
  encryptedTokens: Record<string, string>;
  linkTemplate: string;
}

export const DEFAULT_LINK_TEMPLATE = "[{key} {summary}]({url})";

export const DEFAULT_SETTINGS: PluginSettings = {
  baseUrl: "",
  encryptedTokens: {},
  linkTemplate: DEFAULT_LINK_TEMPLATE,
};
```

- [ ] **Step 2: Add the settings-tab row**

In `JiraBasesSettingTab.display`, after the "Test connection" `Setting` block, append:

```ts
    new Setting(containerEl)
      .setName("Link template")
      .setDesc(
        "Tokens: {key}, {summary}, {status}, {type}, {url}. Unknown tokens are left as-is.",
      )
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_LINK_TEMPLATE)
          .setValue(this.plugin.settings.linkTemplate)
          .onChange(async (value) => {
            this.plugin.settings.linkTemplate = value;
            await this.plugin.saveSettings();
          }),
      )
      .addButton((btn) =>
        btn.setButtonText("Reset to default").onClick(async () => {
          this.plugin.settings.linkTemplate = DEFAULT_LINK_TEMPLATE;
          await this.plugin.saveSettings();
          this.display();
        }),
      );
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Run existing tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/settings.ts
git commit -m "feat(settings): add configurable link template"
```

---

## Task 6: `IssueSuggestModal` class

**Files:**
- Modify: `src/issue-suggest-modal.ts`

- [ ] **Step 1: Add the class**

Append to `src/issue-suggest-modal.ts`:

```ts
import { App, SuggestModal, Notice } from "obsidian";
import type { Issue, JiraClient, JiraError } from "./jira-client";

const DEBOUNCE_MS = 250;
const RESULT_LIMIT = 20;

export interface IssueSuggestModalOptions {
  app: App;
  client: JiraClient;
  onChoose: (issue: Issue) => void;
}

export class IssueSuggestModal extends SuggestModal<Issue> {
  private readonly client: JiraClient;
  private readonly onChooseIssue: (issue: Issue) => void;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private requestSeq = 0;

  constructor(opts: IssueSuggestModalOptions) {
    super(opts.app);
    this.client = opts.client;
    this.onChooseIssue = opts.onChoose;
    this.setPlaceholder("Type an issue key or text to search");
    this.emptyStateText = "No results.";
  }

  getSuggestions(query: string): Promise<Issue[]> {
    if (!query.trim()) return Promise.resolve([]);
    const seq = ++this.requestSeq;

    if (isIssueKey(query.trim())) {
      return this.fetchByKey(query.trim(), seq);
    }
    return this.fetchByText(query, seq);
  }

  private async fetchByKey(key: string, seq: number): Promise<Issue[]> {
    const result = await this.client.getIssue(key);
    if (seq !== this.requestSeq) return [];
    if (result.ok) return [result.value];
    this.reportError(result.error);
    return [];
  }

  private fetchByText(query: string, seq: number): Promise<Issue[]> {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    return new Promise((resolve) => {
      this.debounceTimer = setTimeout(async () => {
        if (seq !== this.requestSeq) return resolve([]);
        const result = await this.client.searchIssues(query, RESULT_LIMIT);
        if (seq !== this.requestSeq) return resolve([]);
        if (result.ok) return resolve(result.value);
        this.reportError(result.error);
        resolve([]);
      }, DEBOUNCE_MS);
    });
  }

  renderSuggestion(issue: Issue, el: HTMLElement): void {
    el.createEl("div", { text: `${issue.key} — ${issue.summary}` });
    const meta = [issue.type, issue.status].filter(Boolean).join(" · ");
    if (meta) {
      el.createEl("small", { text: meta });
    }
  }

  onChooseSuggestion(issue: Issue): void {
    this.onChooseIssue(issue);
  }

  private reportError(err: JiraError): void {
    switch (err.kind) {
      case "no-token":
        new Notice("Set your JIRA Personal Access Token in plugin settings.");
        return;
      case "auth":
        new Notice(`Authentication failed (HTTP ${err.status}). Check your PAT.`);
        return;
      case "network":
        new Notice(`Could not reach JIRA: ${err.message}.`);
        return;
      case "not-found":
        new Notice(`Issue ${err.key} not found.`);
        return;
      case "http":
        if (err.status === 400) {
          new Notice("JIRA search failed (HTTP 400). Check that your query is valid.");
        } else {
          new Notice(`JIRA returned HTTP ${err.status}: ${err.message}.`);
        }
        return;
      case "parse":
        new Notice("Unexpected response from JIRA.");
        return;
    }
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: all pass (helper tests still cover `isIssueKey` / `escapeJqlText`).

- [ ] **Step 4: Commit**

```bash
git add src/issue-suggest-modal.ts
git commit -m "feat(modal): add IssueSuggestModal for issue picking"
```

---

## Task 7: Wire up the two commands in `main.ts`

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add imports**

At the top of `src/main.ts`, alongside the existing imports, add:

```ts
import { renderTemplate } from "./template";
import { IssueSuggestModal } from "./issue-suggest-modal";
import type { Issue } from "./jira-client";
```

- [ ] **Step 2: Extract a `makeClient()` helper**

Inside `JiraBasesPlugin`, add a private helper (place it below `testConnection`):

```ts
  private makeClient() {
    const baseUrl = this.settings.baseUrl;
    if (!baseUrl) {
      new Notice("Set your JIRA base URL in plugin settings.");
      return null;
    }
    return {
      baseUrl,
      client: createJiraClient({
        baseUrl,
        getToken: () => this.secrets.get(baseUrl),
        request: obsidianRequest,
      }),
    };
  }
```

Refactor `testConnection` to reuse it:

```ts
  async testConnection(): Promise<void> {
    const made = this.makeClient();
    if (!made) return;
    const result = await made.client.getCurrentUser();
    if (result.ok) {
      new Notice(`Connected as ${result.value.displayName}.`);
    } else {
      new Notice(errorMessage(result.error));
    }
  }
```

- [ ] **Step 3: Register the two commands**

In `onload`, after the existing `this.addCommand({ id: "test-connection", ... })`, add:

```ts
    this.addCommand({
      id: "insert-issue-link",
      name: "JIRA: Insert issue link",
      editorCallback: (editor) => {
        const made = this.makeClient();
        if (!made) return;
        const modal = new IssueSuggestModal({
          app: this.app,
          client: made.client,
          onChoose: (issue: Issue) => {
            const url = `${made.baseUrl.replace(/\/+$/, "")}/browse/${issue.key}`;
            const text = renderTemplate(this.settings.linkTemplate, {
              key: issue.key,
              summary: issue.summary,
              status: issue.status,
              type: issue.type,
              url,
            });
            editor.replaceSelection(text);
          },
        });
        modal.open();
      },
    });

    this.addCommand({
      id: "link-selection-to-issue",
      name: "JIRA: Link selection to issue",
      editorCallback: (editor) => {
        const selection = editor.getSelection();
        if (!selection) {
          new Notice("Select text first, or use 'Insert issue link'.");
          return;
        }
        const made = this.makeClient();
        if (!made) return;
        const modal = new IssueSuggestModal({
          app: this.app,
          client: made.client,
          onChoose: (issue: Issue) => {
            const url = `${made.baseUrl.replace(/\/+$/, "")}/browse/${issue.key}`;
            editor.replaceSelection(`[${selection}](${url})`);
          },
        });
        modal.open();
      },
    });
```

- [ ] **Step 4: Typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: clean typecheck, all tests pass.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: `main.js` produced with no esbuild errors.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "feat(plugin): register insert-issue-link and link-selection commands"
```

---

## Task 8: Manual verification in a dev vault

**Files:** none (manual)

- [ ] **Step 1: Install the build**

Symlink or copy `main.js` and `manifest.json` into `<vault>/.obsidian/plugins/jira-bases/`. Reload Obsidian and enable the plugin.

- [ ] **Step 2: Configure**

In settings, ensure base URL + PAT are set. Confirm the "Link template" field appears with the default `[{key} {summary}]({url})`, and the "Reset to default" button works.

- [ ] **Step 3: Test "Insert issue link" — key path**

Open a note. Run the command. Type a known issue key. Confirm the suggestion renders as `KEY — Summary` with `Type · Status` underneath. Press Enter. Confirm the rendered template is inserted at the cursor.

- [ ] **Step 4: Test "Insert issue link" — text search path**

Run the command again. Type a summary fragment. Wait ~250 ms. Confirm up to 20 results appear, ordered by recency. Pick one. Confirm insertion.

- [ ] **Step 5: Test "Insert issue link" — replacement**

Select some text and run the command. Confirm the selected text is replaced with the rendered template.

- [ ] **Step 6: Test "Link selection to issue"**

Select a word. Run the command. Pick an issue. Confirm the output is `[<selected>](<issue-url>)`.

With no selection, run the command. Confirm a Notice: `"Select text first, or use 'Insert issue link'."`

- [ ] **Step 7: Test error paths**

With a bogus key (`FAKE-9999999`), run insert → type the key → Enter. Confirm `"Issue FAKE-9999999 not found."` Notice, modal stays open.

Temporarily clear the PAT; run the command. Confirm the no-token Notice.

- [ ] **Step 8: Update the README**

Update `README.md` — change the Status section from "v0.1 (foundation slice)" to describe v0.2: two insertion commands and the link template setting. Commit:

```bash
git add README.md
git commit -m "docs: document v0.2 link insertion commands"
```

---

## Self-Review

**Spec coverage:**
- Two commands → Task 7.
- SuggestModal with key/text detection, debounce, 20-limit, result line format → Tasks 4, 6.
- Template setting + default + reset button → Task 5.
- `JiraClient` additions (`getIssue`, `searchIssues`, `not-found` variant) → Tasks 3, 4.
- Template renderer → Task 2.
- Error messages including `"Issue {key} not found."`, 400 search, no-selection → Tasks 6, 7.
- `data.json` gains `linkTemplate` — via `DEFAULT_SETTINGS` spread in existing `loadSettings` (Task 5, no new code needed).
- Testing coverage (template, client additions, modal helpers) → Tasks 2, 3, 4; manual integration for modal UI → Task 8.

**Placeholder scan:** none — every code step shows complete code, every command has an expected outcome.

**Type consistency:** `Issue` is defined in Task 3 and re-used in Tasks 4, 6, 7. `IssueFields` (template) and `Issue` (client) are distinct on purpose: `IssueFields` adds `url`, which the client doesn't own. `escapeJqlText` / `isIssueKey` signatures match between helper definition (Task 4 Step 4) and usage (Tasks 4, 6).
