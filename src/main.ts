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
      getJiraIssues: async (path) => {
        const f = this.app.vault.getAbstractFileByPath(path);
        if (!(f instanceof TFile)) return [];
        const cache = this.app.metadataCache.getFileCache(f);
        const raw = cache?.frontmatter?.jira_issues;
        if (!Array.isArray(raw)) return [];
        return raw.filter((x): x is string => typeof x === "string");
      },
      setJiraIssues: async (path, keys) => {
        const f = this.app.vault.getAbstractFileByPath(path);
        if (!(f instanceof TFile)) return;
        await this.app.fileManager.processFrontMatter(f, (fm) => {
          if (keys.length === 0) {
            delete fm.jira_issues;
          } else {
            fm.jira_issues = keys;
          }
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
