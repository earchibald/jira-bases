import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type JiraBasesPlugin from "./main";

export type AutoLookupMode = "minimal" | "primary" | "custom";

export interface PluginSettings {
  baseUrl: string;
  encryptedTokens: Record<string, string>;
  linkTemplate: string;
  stubsFolder: string;
  projectPrefixes: string[];
  autoLookupEnabled: boolean;
  autoLookupIdleMs: number;
  autoLookupMode: AutoLookupMode;
  autoLookupTemplate: string;
  autoLookupFailedKeysTTLMs: number;
  autoLookupFailedKeysMaxSize: number;
}

export const DEFAULT_LINK_TEMPLATE = "[{key} {summary}]({url})";
export const MINIMAL_LINK_TEMPLATE = "[{key}]({url})";

export const DEFAULT_SETTINGS: PluginSettings = {
  baseUrl: "",
  encryptedTokens: {},
  linkTemplate: DEFAULT_LINK_TEMPLATE,
  stubsFolder: "JIRA",
  projectPrefixes: [],
  autoLookupEnabled: false,
  autoLookupIdleMs: 2000,
  autoLookupMode: "minimal",
  autoLookupTemplate: MINIMAL_LINK_TEMPLATE,
  autoLookupFailedKeysTTLMs: 300000,
  autoLookupFailedKeysMaxSize: 100,
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

    containerEl.createEl("h3", { text: "Auto-lookup on type" });

    new Setting(containerEl)
      .setName("Enable auto-lookup")
      .setDesc(
        "Detect bare JIRA keys (matching configured prefixes) as you type and replace them with a link after an idle pause.",
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.autoLookupEnabled).onChange(async (v) => {
          this.plugin.settings.autoLookupEnabled = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Idle delay (ms)")
      .setDesc("How long to wait after the last keystroke before applying queued lookups.")
      .addText((t) =>
        t
          .setPlaceholder("2000")
          .setValue(String(this.plugin.settings.autoLookupIdleMs))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            if (Number.isFinite(n) && n >= 100 && n <= 60000) {
              this.plugin.settings.autoLookupIdleMs = n;
              await this.plugin.saveSettings();
            }
          }),
      );

    let templateTextSetValue: ((v: string) => void) | null = null;
    let modeDropdownSetValue: ((v: string) => void) | null = null;

    new Setting(containerEl)
      .setName("Auto-lookup link style")
      .setDesc(
        "Minimal = [KEY](url). Primary = your Link template above. Custom = the template below.",
      )
      .addDropdown((d) => {
        modeDropdownSetValue = (v) => d.setValue(v);
        d.addOption("minimal", "Minimal")
          .addOption("primary", "Use primary template")
          .addOption("custom", "Custom template")
          .setValue(this.plugin.settings.autoLookupMode)
          .onChange(async (v) => {
            const mode = v as AutoLookupMode;
            this.plugin.settings.autoLookupMode = mode;
            if (mode === "minimal") {
              this.plugin.settings.autoLookupTemplate = MINIMAL_LINK_TEMPLATE;
              templateTextSetValue?.(MINIMAL_LINK_TEMPLATE);
            } else if (mode === "primary") {
              this.plugin.settings.autoLookupTemplate =
                this.plugin.settings.linkTemplate;
              templateTextSetValue?.(this.plugin.settings.linkTemplate);
            }
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Custom auto-lookup template")
      .setDesc(
        "Reflects the current style. Editing this flips the style to Custom. Tokens match Link template.",
      )
      .addText((t) => {
        templateTextSetValue = (v) => t.setValue(v);
        t.setPlaceholder("[{key}]({url})")
          .setValue(this.plugin.settings.autoLookupTemplate)
          .onChange(async (v) => {
            this.plugin.settings.autoLookupTemplate = v;
            if (this.plugin.settings.autoLookupMode !== "custom") {
              this.plugin.settings.autoLookupMode = "custom";
              modeDropdownSetValue?.("custom");
            }
            await this.plugin.saveSettings();
          });
      });

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

    new Setting(containerEl)
      .setName("Failed keys cache TTL (ms)")
      .setDesc(
        "How long to remember failed JIRA key lookups before retrying. Prevents repeated API calls for invalid keys.",
      )
      .addText((t) =>
        t
          .setPlaceholder("300000")
          .setValue(String(this.plugin.settings.autoLookupFailedKeysTTLMs))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            if (Number.isFinite(n) && n >= 0 && n <= 3600000) {
              this.plugin.settings.autoLookupFailedKeysTTLMs = n;
              await this.plugin.saveSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Failed keys max cache size")
      .setDesc(
        "Maximum number of failed JIRA keys to remember. Older entries are evicted when this limit is reached.",
      )
      .addText((t) =>
        t
          .setPlaceholder("100")
          .setValue(String(this.plugin.settings.autoLookupFailedKeysMaxSize))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            if (Number.isFinite(n) && n >= 1 && n <= 1000) {
              this.plugin.settings.autoLookupFailedKeysMaxSize = n;
              await this.plugin.saveSettings();
            }
          }),
      );
  }
}
