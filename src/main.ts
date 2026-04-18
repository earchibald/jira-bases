import { Plugin, Notice } from "obsidian";
import { safeStorage } from "electron";
import { createSecretStore, SecretStore } from "./secret-store";
import { createJiraClient, JiraError } from "./jira-client";
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
      safeStorage,
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
    case "not-found":
      return `Issue ${err.key} not found.`;
  }
}
