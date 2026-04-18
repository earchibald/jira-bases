import {
  Plugin,
  Notice,
  TFile,
  TFolder,
  debounce,
  requestUrl,
} from "obsidian";
import { createSecretStore, SecretStore } from "./secret-store";
import type { HttpRequest, Issue } from "./jira-client";
import { createJiraClient, JiraError, JiraClient } from "./jira-client";
import { renderTemplate } from "./template";
import { IssueSuggestModal } from "./issue-suggest-modal";
import {
  DEFAULT_SETTINGS,
  JiraBasesSettingTab,
  PluginSettings,
} from "./settings";
import {
  collectAllKeys,
  findOrphanedStubs,
  listStubPaths,
  rescanFile,
  IndexerDeps,
} from "./indexer";
import { writeStub, VaultAdapter } from "./stub-writer";
import { ConfirmModal } from "./confirm-modal";
import { createIssueCache } from "./issue-cache";
import { createIssueService, IssueService } from "./issue-service";
import { registerHoverPreview } from "./hover-preview";
import { LookupModal } from "./lookup-modal";
import { findKeyAtCol, findKeyInText } from "./jira-key";
import type { Editor } from "obsidian";

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
  private issueCache = createIssueCache();
  private issueService!: IssueService;

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
      id: "insert-issue-link",
      name: "JIRA: Insert issue link",
      editorCallback: (editor) => this.insertIssueLink(editor),
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

    this.issueService = createIssueService(
      {
        getCurrentUser: async () => {
          throw new Error("not used by hover/lookup");
        },
        getIssue: async () => {
          throw new Error("not used by hover/lookup");
        },
        searchIssues: async () => {
          throw new Error("not used by hover/lookup");
        },
        getIssueDetails: (key) => this.makeClient().getIssueDetails(key),
      },
      this.issueCache,
    );

    registerHoverPreview(this, this.issueService, () => this.settings.baseUrl ?? "");

    this.addCommand({
      id: "lookup-issue",
      name: "JIRA: Look up issue…",
      callback: () => {
        if (!this.settings.baseUrl) {
          new Notice("Set your JIRA base URL in plugin settings.");
          return;
        }
        new LookupModal(this.app, this.issueService, this.settings.baseUrl).open();
      },
    });
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
      listNotes: async () => {
        const out: string[] = [];
        const files = this.app.vault.getMarkdownFiles();
        for (const f of files) out.push(f.path);
        return out;
      },
      getSettings: () => ({
        baseUrl: this.settings.baseUrl,
        prefixes: this.settings.projectPrefixes,
        stubsFolder: this.settings.stubsFolder,
      }),
      setReferences: async (path, keys, links) => {
        const f = this.app.vault.getAbstractFileByPath(path);
        if (!(f instanceof TFile)) return;
        await this.app.fileManager.processFrontMatter(f, (fm) => {
          const existingKeys = Array.isArray(fm.jira_issues)
            ? fm.jira_issues.filter(
                (x: unknown): x is string => typeof x === "string",
              )
            : [];
          const existingLinks = Array.isArray(fm.jira_links)
            ? fm.jira_links.filter(
                (x: unknown): x is string => typeof x === "string",
              )
            : [];
          const keysSame = sameStringSet(existingKeys, keys);
          const linksSame = sameStringSet(existingLinks, links);
          if (keysSame && linksSame) return;
          if (keys.length === 0) delete fm.jira_issues;
          else fm.jira_issues = keys;
          if (links.length === 0) delete fm.jira_links;
          else fm.jira_links = links;
        });
      },
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

  async insertIssueLink(editor: Editor): Promise<void> {
    const baseUrl = this.settings.baseUrl;
    if (!baseUrl) {
      new Notice("Set your JIRA base URL in plugin settings.");
      return;
    }

    // Establish the effective selection. If the editor has a real selection,
    // honor it; otherwise, if the cursor is on a JIRA key, expand to that key.
    let selection = editor.getSelection();
    if (!selection) {
      const cursor = editor.getCursor();
      const line = editor.getLine(cursor.line);
      const hit = findKeyAtCol(line, cursor.ch);
      if (hit) {
        editor.setSelection(
          { line: cursor.line, ch: hit.start },
          { line: cursor.line, ch: hit.end },
        );
        selection = hit.key;
      }
    }

    const detectedKey = selection ? findKeyInText(selection) : null;
    const baseStripped = baseUrl.replace(/\/+$/, "");
    const client = this.makeClient();

    // Case A: we know the key. If the selection is just the bare key, render
    // the configured linkTemplate (we need the issue's summary etc.).
    // Otherwise, the selection has surrounding text — preserve it as the
    // anchor and only build the URL from the detected key.
    if (detectedKey && selection) {
      const url = `${baseStripped}/browse/${detectedKey}`;
      if (selection.trim() === detectedKey) {
        const r = await client.getIssue(detectedKey);
        if (!r.ok) {
          new Notice(errorMessage(r.error));
          return;
        }
        editor.replaceSelection(
          renderTemplate(this.settings.linkTemplate, {
            key: r.value.key,
            summary: r.value.summary,
            status: r.value.status,
            type: r.value.type,
            url,
          }),
        );
      } else {
        editor.replaceSelection(`[${selection}](${url})`);
      }
      return;
    }

    // Case B/C: open picker. With selection → wrap; without → render template.
    const wrapText = selection;
    const modal = new IssueSuggestModal({
      app: this.app,
      client,
      onChoose: (issue: Issue) => {
        const url = `${baseStripped}/browse/${issue.key}`;
        if (wrapText) {
          editor.replaceSelection(`[${wrapText}](${url})`);
        } else {
          editor.replaceSelection(
            renderTemplate(this.settings.linkTemplate, {
              key: issue.key,
              summary: issue.summary,
              status: issue.status,
              type: issue.type,
              url,
            }),
          );
        }
      },
    });
    modal.open();
  }

  async testConnection(): Promise<void> {
    if (!this.settings.baseUrl) {
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
    const existingByKey = await listStubPaths(deps, this.settings.stubsFolder);
    let synced = 0;
    const failures: string[] = [];
    for (const key of keys) {
      const r = await client.getIssueDetails(key);
      if (!r.ok) {
        const detail = errorMessage(r.error);
        failures.push(`${key}: ${detail}`);
        console.warn(`jira-bases: ${key} — ${r.error.kind}`, r.error);
        continue;
      }
      try {
        await writeStub(
          vault,
          this.settings.stubsFolder,
          r.value,
          existingByKey.get(key) ?? null,
        );
        synced++;
      } catch (e) {
        const msg = (e as Error).message;
        failures.push(`${key}: write failed — ${msg}`);
        console.warn(`jira-bases: ${key} — write failed`, e);
      }
    }
    if (synced > 0) {
      const prefix = this.settings.stubsFolder.replace(/\/+$/, "") + "/";
      for (const path of await deps.listNotes()) {
        if (path.startsWith(prefix)) continue;
        const content = await deps.read(path);
        if (content === null) continue;
        if (content.includes("jira_issues")) await rescanFile(deps, path);
      }
    }
    if (failures.length === 0) {
      new Notice(`Synced ${synced} stubs.`);
    } else {
      new Notice(
        `Synced ${synced} stubs (${failures.length} failed).\nFirst: ${failures[0]}`,
        10000,
      );
    }
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
      orphans.map((o) => `${o.key} — ${o.path}`),
      "Delete",
      async () => {
        let deleted = 0;
        let failed = 0;
        for (const orphan of orphans) {
          const f = this.app.vault.getAbstractFileByPath(orphan.path);
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

function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
  return true;
}

function errorMessage(err: JiraError): string {
  switch (err.kind) {
    case "no-token":
      return "Set your JIRA Personal Access Token in plugin settings.";
    case "auth":
      return `Authentication failed (HTTP ${err.status}). Check your PAT.`;
    case "not-found":
      return `Issue ${err.key} not found.`;
    case "network":
      return `Could not reach JIRA: ${err.message}.`;
    case "http":
      return `JIRA returned HTTP ${err.status}: ${err.message}.`;
    case "parse":
      return "Unexpected response from JIRA.";
  }
}
