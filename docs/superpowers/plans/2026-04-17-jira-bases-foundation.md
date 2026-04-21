# jira-bases Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Obsidian desktop plugin (`jira-bases`) that stores a JIRA Data Center base URL + PAT and verifies connectivity via a "Test connection" command. Foundation for future features.

**Architecture:** Three units with narrow interfaces: `SecretStore` (wraps `keytar`), `JiraClient` (typed `fetch` wrapper exposing `getCurrentUser()`), and `JiraBasesPlugin` (Obsidian entry: settings tab + command). Unit tests via `vitest` + `msw`; plugin entry smoke-tested manually.

**Tech Stack:** TypeScript (strict), esbuild, Obsidian plugin API, `keytar` (OS keychain), `vitest` + `msw` for tests.

---

## File Structure

**Create:**
- `package.json` — dependencies + scripts
- `tsconfig.json` — strict TS config
- `esbuild.config.mjs` — bundler config
- `manifest.json` — Obsidian plugin manifest
- `.gitignore`
- `src/main.ts` — plugin entry (`JiraBasesPlugin`)
- `src/settings.ts` — settings tab + types (`PluginSettings`)
- `src/secret-store.ts` — `SecretStore` interface + keytar implementation
- `src/jira-client.ts` — `JiraClient` interface + fetch implementation + `Result`/`JiraError` types
- `src/secret-store.test.ts` — unit tests for `SecretStore`
- `src/jira-client.test.ts` — unit tests for `JiraClient`
- `vitest.config.ts`
- `README.md` (augment existing with usage/install notes)

**Responsibilities:**
- `secret-store.ts` is the *only* module that imports `keytar`.
- `jira-client.ts` is network/auth logic — no Obsidian imports, fully portable for tests.
- `main.ts` + `settings.ts` are the Obsidian-facing glue.

---

## Task 1: Scaffold repo and toolchain

**Files:**
- Create: `/Users/earchibald/Projects/jira-bases/package.json`
- Create: `/Users/earchibald/Projects/jira-bases/tsconfig.json`
- Create: `/Users/earchibald/Projects/jira-bases/.gitignore`
- Create: `/Users/earchibald/Projects/jira-bases/manifest.json`
- Create: `/Users/earchibald/Projects/jira-bases/esbuild.config.mjs`
- Create: `/Users/earchibald/Projects/jira-bases/vitest.config.ts`

- [ ] **Step 1: Initialize git**

```bash
cd /Users/earchibald/Projects/jira-bases
git init
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
main.js
main.js.map
*.log
.DS_Store
dist/
coverage/
```

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "jira-bases",
  "version": "0.1.0",
  "description": "Obsidian plugin for JIRA Data Center: smart links, Bases metadata, issue lookup.",
  "main": "main.js",
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "node esbuild.config.mjs production",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "keywords": ["obsidian", "jira"],
  "license": "MIT",
  "devDependencies": {
    "@types/node": "^20.11.0",
    "builtin-modules": "^3.3.0",
    "esbuild": "^0.20.0",
    "msw": "^2.2.0",
    "obsidian": "latest",
    "typescript": "^5.4.0",
    "vitest": "^1.4.0"
  },
  "dependencies": {
    "keytar": "^7.9.0"
  }
}
```

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "inlineSourceMap": true,
    "inlineSources": true,
    "module": "ESNext",
    "target": "ES2022",
    "allowJs": true,
    "noImplicitAny": true,
    "moduleResolution": "node",
    "importHelpers": true,
    "isolatedModules": true,
    "strict": true,
    "lib": ["DOM", "ES2022"],
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 5: Create `manifest.json`**

```json
{
  "id": "jira-bases",
  "name": "JIRA Bases",
  "version": "0.1.0",
  "minAppVersion": "1.5.0",
  "description": "JIRA Data Center integration for smart links, Bases metadata, and issue lookup.",
  "author": "Eugene Archibald",
  "isDesktopOnly": true
}
```

- [ ] **Step 6: Create `esbuild.config.mjs`**

```js
import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "keytar", ...builtins],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  platform: "node",
});

if (prod) {
  await ctx.rebuild();
  await ctx.dispose();
} else {
  await ctx.watch();
}
```

- [ ] **Step 7: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 8: Install deps and verify typecheck runs**

Run: `npm install && npm run typecheck`
Expected: install succeeds; typecheck passes (no `src/` files yet so it's a no-op — exit 0).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json manifest.json esbuild.config.mjs vitest.config.ts .gitignore
git commit -m "chore: scaffold obsidian plugin toolchain"
```

---

## Task 2: `SecretStore` — failing test

**Files:**
- Create: `/Users/earchibald/Projects/jira-bases/src/secret-store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("keytar", () => ({
  default: {
    getPassword: vi.fn(),
    setPassword: vi.fn(),
    deletePassword: vi.fn(),
  },
}));

import keytar from "keytar";
import { createSecretStore, SERVICE_NAME } from "./secret-store";

describe("SecretStore", () => {
  beforeEach(() => {
    vi.mocked(keytar.getPassword).mockReset();
    vi.mocked(keytar.setPassword).mockReset();
    vi.mocked(keytar.deletePassword).mockReset();
  });

  it("get returns the token when keytar has one", async () => {
    vi.mocked(keytar.getPassword).mockResolvedValue("tok-abc");
    const store = createSecretStore();
    const result = await store.get("https://jira.me.com");
    expect(keytar.getPassword).toHaveBeenCalledWith(SERVICE_NAME, "https://jira.me.com");
    expect(result).toBe("tok-abc");
  });

  it("get returns null when keytar has nothing", async () => {
    vi.mocked(keytar.getPassword).mockResolvedValue(null);
    const store = createSecretStore();
    expect(await store.get("https://jira.me.com")).toBeNull();
  });

  it("set stores the token under the baseUrl account", async () => {
    vi.mocked(keytar.setPassword).mockResolvedValue(undefined);
    const store = createSecretStore();
    await store.set("https://jira.me.com", "tok-xyz");
    expect(keytar.setPassword).toHaveBeenCalledWith(SERVICE_NAME, "https://jira.me.com", "tok-xyz");
  });

  it("delete removes the token", async () => {
    vi.mocked(keytar.deletePassword).mockResolvedValue(true);
    const store = createSecretStore();
    await store.delete("https://jira.me.com");
    expect(keytar.deletePassword).toHaveBeenCalledWith(SERVICE_NAME, "https://jira.me.com");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/secret-store.test.ts`
Expected: FAIL — "Cannot find module './secret-store'".

- [ ] **Step 3: Commit (test only)**

```bash
git add src/secret-store.test.ts
git commit -m "test: failing tests for SecretStore"
```

---

## Task 3: `SecretStore` — implementation

**Files:**
- Create: `/Users/earchibald/Projects/jira-bases/src/secret-store.ts`

- [ ] **Step 1: Write the implementation**

```ts
import keytar from "keytar";

export const SERVICE_NAME = "obsidian-jira-bases";

export interface SecretStore {
  get(baseUrl: string): Promise<string | null>;
  set(baseUrl: string, token: string): Promise<void>;
  delete(baseUrl: string): Promise<void>;
}

export function createSecretStore(): SecretStore {
  return {
    async get(baseUrl) {
      return keytar.getPassword(SERVICE_NAME, baseUrl);
    },
    async set(baseUrl, token) {
      await keytar.setPassword(SERVICE_NAME, baseUrl, token);
    },
    async delete(baseUrl) {
      await keytar.deletePassword(SERVICE_NAME, baseUrl);
    },
  };
}
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `npm test -- src/secret-store.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 3: Commit**

```bash
git add src/secret-store.ts
git commit -m "feat: SecretStore keytar wrapper"
```

---

## Task 4: `JiraClient` types and failing tests

**Files:**
- Create: `/Users/earchibald/Projects/jira-bases/src/jira-client.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { createJiraClient } from "./jira-client";

const BASE = "https://jira.me.com";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function client(token: string | null) {
  return createJiraClient({ baseUrl: BASE, getToken: async () => token });
}

describe("JiraClient.getCurrentUser", () => {
  it("returns ok with user when auth succeeds", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/myself`, ({ request }) => {
        expect(request.headers.get("Authorization")).toBe("Bearer tok-abc");
        expect(request.headers.get("Accept")).toBe("application/json");
        return HttpResponse.json({
          displayName: "Eugene",
          accountId: "u-1",
          emailAddress: "e@me.com",
        });
      }),
    );
    const result = await client("tok-abc").getCurrentUser();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        displayName: "Eugene",
        accountId: "u-1",
        emailAddress: "e@me.com",
      });
    }
  });

  it("returns no-token error when getToken yields null", async () => {
    const result = await client(null).getCurrentUser();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("no-token");
  });

  it("returns auth error on 401", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/myself`, () =>
        HttpResponse.text("unauthorized", { status: 401 }),
      ),
    );
    const result = await client("bad").getCurrentUser();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("auth");
      if (result.error.kind === "auth") expect(result.error.status).toBe(401);
    }
  });

  it("returns auth error on 403", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/myself`, () =>
        HttpResponse.text("forbidden", { status: 403 }),
      ),
    );
    const result = await client("tok").getCurrentUser();
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "auth") {
      expect(result.error.status).toBe(403);
    } else {
      throw new Error("expected auth/403");
    }
  });

  it("returns http error on 500", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/myself`, () =>
        HttpResponse.text("boom", { status: 500 }),
      ),
    );
    const result = await client("tok").getCurrentUser();
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "http") {
      expect(result.error.status).toBe(500);
    } else {
      throw new Error("expected http/500");
    }
  });

  it("returns parse error on malformed JSON", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/myself`, () =>
        new HttpResponse("not json", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const result = await client("tok").getCurrentUser();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("parse");
  });

  it("returns network error when fetch throws", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/myself`, () => HttpResponse.error()),
    );
    const result = await client("tok").getCurrentUser();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("network");
  });

  it("strips trailing slash from baseUrl", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/myself`, () =>
        HttpResponse.json({ displayName: "E", accountId: "u" }),
      ),
    );
    const c = createJiraClient({
      baseUrl: `${BASE}/`,
      getToken: async () => "tok",
    });
    const result = await c.getCurrentUser();
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/jira-client.test.ts`
Expected: FAIL — "Cannot find module './jira-client'".

- [ ] **Step 3: Commit (test only)**

```bash
git add src/jira-client.test.ts
git commit -m "test: failing tests for JiraClient.getCurrentUser"
```

---

## Task 5: `JiraClient` — implementation

**Files:**
- Create: `/Users/earchibald/Projects/jira-bases/src/jira-client.ts`

- [ ] **Step 1: Write the implementation**

```ts
export type CurrentUser = {
  displayName: string;
  accountId: string;
  emailAddress?: string;
};

export type JiraError =
  | { kind: "no-token" }
  | { kind: "auth"; status: 401 | 403; message: string }
  | { kind: "http"; status: number; message: string }
  | { kind: "network"; message: string }
  | { kind: "parse"; message: string };

export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export interface JiraClient {
  getCurrentUser(): Promise<Result<CurrentUser, JiraError>>;
}

export interface JiraClientOptions {
  baseUrl: string;
  getToken: () => Promise<string | null>;
}

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, "");
}

export function createJiraClient(opts: JiraClientOptions): JiraClient {
  const base = normalizeBase(opts.baseUrl);

  return {
    async getCurrentUser() {
      const token = await opts.getToken();
      if (!token) return { ok: false, error: { kind: "no-token" } };

      let response: Response;
      try {
        response = await fetch(`${base}/rest/api/2/myself`, {
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

      if (!response.ok) {
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
        const body = (await response.json()) as Partial<CurrentUser>;
        if (typeof body.displayName !== "string" || typeof body.accountId !== "string") {
          return { ok: false, error: { kind: "parse", message: "missing fields" } };
        }
        return {
          ok: true,
          value: {
            displayName: body.displayName,
            accountId: body.accountId,
            emailAddress: body.emailAddress,
          },
        };
      } catch (e) {
        return { ok: false, error: { kind: "parse", message: (e as Error).message } };
      }
    },
  };
}

async function safeText(r: Response): Promise<string> {
  try {
    return await r.text();
  } catch {
    return "";
  }
}
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `npm test -- src/jira-client.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: PASS — all tests (4 + 8 = 12).

- [ ] **Step 4: Commit**

```bash
git add src/jira-client.ts
git commit -m "feat: JiraClient with getCurrentUser"
```

---

## Task 6: Plugin settings module

**Files:**
- Create: `/Users/earchibald/Projects/jira-bases/src/settings.ts`

- [ ] **Step 1: Write `settings.ts`**

```ts
import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type JiraBasesPlugin from "./main";

export interface PluginSettings {
  baseUrl: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  baseUrl: "",
};

export class JiraBasesSettingTab extends PluginSettingTab {
  private pendingToken = "";

  constructor(app: App, private plugin: JiraBasesPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "JIRA Bases" });

    new Setting(containerEl)
      .setName("JIRA base URL")
      .setDesc("e.g. https://jira.me.com (no trailing slash required)")
      .addText((text) =>
        text
          .setPlaceholder("https://jira.example.com")
          .setValue(this.plugin.settings.baseUrl)
          .onChange(async (value) => {
            this.plugin.settings.baseUrl = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Personal Access Token")
      .setDesc("Stored in your operating system's keychain, not in your vault.")
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("paste PAT, then click Save token")
          .onChange((value) => {
            this.pendingToken = value;
          });
      })
      .addButton((btn) =>
        btn
          .setButtonText("Save token")
          .setCta()
          .onClick(async () => {
            const url = this.plugin.settings.baseUrl;
            if (!url) {
              new Notice("Set your JIRA base URL first.");
              return;
            }
            if (!this.pendingToken) {
              new Notice("Enter a token before saving.");
              return;
            }
            await this.plugin.secrets.set(url, this.pendingToken);
            this.pendingToken = "";
            new Notice("Token saved to keychain.");
            this.display();
          }),
      )
      .addButton((btn) =>
        btn.setButtonText("Clear token").onClick(async () => {
          const url = this.plugin.settings.baseUrl;
          if (!url) return;
          await this.plugin.secrets.delete(url);
          new Notice("Token cleared.");
        }),
      );

    new Setting(containerEl)
      .setName("Test connection")
      .setDesc("Calls /rest/api/2/myself and shows the result.")
      .addButton((btn) =>
        btn
          .setButtonText("Test")
          .setCta()
          .onClick(() => this.plugin.testConnection()),
      );
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (note: `main.ts` not yet created; import is a type-only reference — if tsc complains, proceed to Task 7 which creates it, then re-run).

- [ ] **Step 3: Commit**

```bash
git add src/settings.ts
git commit -m "feat: settings tab for base URL and PAT"
```

---

## Task 7: Plugin entry point

**Files:**
- Create: `/Users/earchibald/Projects/jira-bases/src/main.ts`

- [ ] **Step 1: Write `main.ts`**

```ts
import { Plugin, Notice } from "obsidian";
import { createSecretStore, SecretStore } from "./secret-store";
import { createJiraClient, JiraError } from "./jira-client";
import {
  DEFAULT_SETTINGS,
  JiraBasesSettingTab,
  PluginSettings,
} from "./settings";

export default class JiraBasesPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  secrets: SecretStore = createSecretStore();

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new JiraBasesSettingTab(this.app, this));
    this.addCommand({
      id: "test-connection",
      name: "JIRA: Test connection",
      callback: () => this.testConnection(),
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
    const client = createJiraClient({
      baseUrl,
      getToken: () => this.secrets.get(baseUrl),
    });
    const result = await client.getCurrentUser();
    if (result.ok) {
      new Notice(`Connected as ${result.value.displayName}.`);
    } else {
      new Notice(errorMessage(result.error));
    }
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
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `main.js` emitted at repo root, no errors.

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: PASS — 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "feat: plugin entry with Test connection command"
```

---

## Task 8: Manual smoke test in a dev vault

**Files:** none (manual verification)

- [ ] **Step 1: Symlink plugin into a test vault**

```bash
# Replace <VAULT> with path to a real Obsidian vault you use for testing.
VAULT=~/ObsidianVaults/Scratch
mkdir -p "$VAULT/.obsidian/plugins/jira-bases"
ln -sf "$PWD/main.js" "$VAULT/.obsidian/plugins/jira-bases/main.js"
ln -sf "$PWD/manifest.json" "$VAULT/.obsidian/plugins/jira-bases/manifest.json"
```

- [ ] **Step 2: Enable plugin in Obsidian**

Open the vault in Obsidian → Settings → Community plugins → toggle "JIRA Bases" on.

- [ ] **Step 3: Verify empty-state error**

Open Settings → JIRA Bases → click "Test" with no URL set.
Expected Notice: "Set your JIRA base URL in plugin settings."

- [ ] **Step 4: Verify no-token error**

Enter a base URL (e.g. `https://jira.me.com`), do NOT save a token, click "Test".
Expected Notice: "Set your JIRA Personal Access Token in plugin settings."

- [ ] **Step 5: Verify bad-token error**

Enter a bogus token, click "Save token", then click "Test".
Expected Notice: "Authentication failed (HTTP 401). Check your PAT."

- [ ] **Step 6: Verify happy path**

Enter your real PAT, click "Save token", click "Test".
Expected Notice: "Connected as \<your display name\>."

- [ ] **Step 7: Verify command palette entry**

Open command palette → run "JIRA: Test connection" → same success notice.

- [ ] **Step 8: If all pass, tag a release candidate**

```bash
git tag v0.1.0-rc1
```

---

## Task 9: README update

**Files:**
- Modify: `/Users/earchibald/Projects/jira-bases/README.md`

- [ ] **Step 1: Append installation/usage section**

Add below the existing Summary:

```markdown
## Status

v0.1 (foundation slice): PAT auth + "Test connection" command. No features yet — this is the substrate.

## Install (dev)

1. `npm install && npm run build`
2. Symlink `main.js` and `manifest.json` into `<vault>/.obsidian/plugins/jira-bases/`
3. Enable "JIRA Bases" under Community plugins.

## Configure

- **JIRA base URL:** e.g. `https://jira.example.com`
- **PAT:** create one in your JIRA profile → Personal Access Tokens. Paste into settings and click "Save token". Stored in your OS keychain.

## Verify

Run the "JIRA: Test connection" command (or the Test button in settings). You should see "Connected as \<your name\>".

## Scope (v0.1)

Desktop only. PAT only (no OAuth). JIRA Data Center.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: v0.1 install and usage"
```
