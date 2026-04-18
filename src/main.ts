import { Plugin, Notice, requestUrl } from "obsidian";
import { createSecretStore, SecretStore } from "./secret-store";
import { createJiraClient, JiraError } from "./jira-client";
import type { HttpRequest } from "./jira-client";

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
import { renderTemplate } from "./template";
import { IssueSuggestModal } from "./issue-suggest-modal";
import type { Issue } from "./jira-client";
import {
  DEFAULT_SETTINGS,
  JiraBasesSettingTab,
  PluginSettings,
} from "./settings";

export default class JiraBasesPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  secrets!: SecretStore;

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
  }

  async loadSettings() {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

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
}

const obsidianRequest: HttpRequest = async ({ url, headers }) => {
  const r = await requestUrl({ url, headers, method: "GET", throw: false });
  return {
    status: r.status,
    text: async () => r.text,
    json: async () => r.json,
  };
};

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
