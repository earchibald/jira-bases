import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type JiraBasesPlugin from "./main";

export interface PluginSettings {
  baseUrl: string;
  encryptedTokens: Record<string, string>;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  baseUrl: "",
  encryptedTokens: {},
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
            try {
              await this.plugin.secrets.set(url, this.pendingToken);
              this.pendingToken = "";
              new Notice("Token saved (encrypted).");
              this.display();
            } catch (e) {
              new Notice((e as Error).message);
            }
          }),
      )
      .addButton((btn) =>
        btn.setButtonText("Clear token").onClick(async () => {
          const url = this.plugin.settings.baseUrl;
          if (!url) {
            new Notice("Set your JIRA base URL first.");
            return;
          }
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
