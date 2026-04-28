import { App, PluginSettingTab, Setting, Notice, TextComponent } from "obsidian";
import type JiraBasesPlugin from "./main";
import { findUnknownTemplateTokens } from "./template";

export type AutoLookupMode = "minimal" | "primary" | "custom";

const PROJECT_PREFIX_RE = /^[A-Z][A-Z0-9]+$/;

/**
 * Split a comma-separated string into accepted and rejected JIRA project
 * prefixes. Whitespace is trimmed, entries are uppercased, empty entries are
 * dropped silently, and anything that fails {@link PROJECT_PREFIX_RE} (e.g.
 * single-letter, contains punctuation) is reported as rejected so the
 * settings tab can surface it instead of silently dropping it.
 */
/**
 * Render an internal millisecond value as a human-friendly seconds string for
 * sub-minute timings. Whole seconds → integer; otherwise one or two decimals
 * trimmed of trailing zeros (e.g. 2000 → "2", 1500 → "1.5", 100 → "0.1").
 */
export function formatMsAsSeconds(ms: number): string {
  if (!Number.isFinite(ms)) return "";
  const seconds = ms / 1000;
  if (Number.isInteger(seconds)) return String(seconds);
  return seconds.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Parse a user-entered "seconds" string into milliseconds. Returns null on
 * empty/invalid input so callers can ignore the change rather than save 0.
 * Accepts integers and decimals; rejects negatives and non-numeric junk.
 */
export function parseSecondsToMs(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const seconds = Number(trimmed);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.round(seconds * 1000);
}

export function splitProjectPrefixes(input: string): {
  accepted: string[];
  rejected: string[];
} {
  const accepted: string[] = [];
  const rejected: string[] = [];
  for (const raw of input.split(",")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const upper = trimmed.toUpperCase();
    if (PROJECT_PREFIX_RE.test(upper)) {
      accepted.push(upper);
    } else {
      rejected.push(trimmed);
    }
  }
  return { accepted, rejected };
}

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
  autoRefreshEnabled: boolean;
  autoRefreshIntervalMinutes: number;
  autoRefreshOnStartup: boolean;
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
  autoLookupFailedKeysTTLMs: 600000,
  autoLookupFailedKeysMaxSize: 500,
  autoRefreshEnabled: false,
  autoRefreshIntervalMinutes: 60,
  autoRefreshOnStartup: false,
};

// Idle delay before the URL field re-runs validation and applies the
// `https://` / trailing-slash auto-fix. Long enough that a user typing a
// host like "jira.example.com" finishes before the validator sees a
// half-edited protocol prefix; short enough that a paste or genuine pause
// still gets feedback within a beat. See JB-15.
export const URL_VALIDATION_DEBOUNCE_MS = 600;

export class JiraBasesSettingTab extends PluginSettingTab {
  private pendingToken = "";
  private urlValidationEl: HTMLElement | null = null;
  private prefixFeedbackEl: HTMLElement | null = null;
  private linkTemplateFeedbackEl: HTMLElement | null = null;
  private autoLookupTemplateFeedbackEl: HTMLElement | null = null;
  private urlValidationTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(app: App, private plugin: JiraBasesPlugin) {
    super(app, plugin);
  }

  private renderTemplateWarning(
    el: HTMLElement | null,
    template: string,
  ): void {
    if (!el) return;
    el.empty();
    const unknown = findUnknownTemplateTokens(template);
    if (unknown.length === 0) return;
    el.createEl("div", {
      text: `⚠️ Unknown token${unknown.length === 1 ? "" : "s"}: ${unknown
        .map((t) => `{${t}}`)
        .join(", ")}. Left as-is when rendered — check for typos.`,
      cls: "setting-item-description mod-warning",
    });
  }

  private renderPrefixFeedback(rejected: string[]): void {
    const el = this.prefixFeedbackEl;
    if (!el) return;
    el.empty();
    if (rejected.length === 0) return;
    el.createEl("div", {
      text: `⚠️ Ignored: ${rejected.join(", ")}. Prefixes must be 2+ characters, start with a letter, and contain only letters/digits.`,
      cls: "setting-item-description mod-warning",
    });
  }

  /**
   * Debounced trigger for URL validation + auto-fix. Resets on every
   * keystroke; only the latest value is validated. Public for tests.
   */
  scheduleUrlValidation(text: TextComponent): void {
    if (this.urlValidationTimer !== null) {
      clearTimeout(this.urlValidationTimer);
    }
    this.urlValidationTimer = setTimeout(() => {
      this.urlValidationTimer = null;
      void this.runUrlValidation(text);
    }, URL_VALIDATION_DEBOUNCE_MS);
  }

  private async runUrlValidation(text: TextComponent): Promise<void> {
    const current = text.getValue();
    const validation = this.validateUrl(current);

    if (validation.fixed && validation.fixed !== current) {
      this.plugin.settings.baseUrl = validation.fixed;
      text.setValue(validation.fixed);
      await this.plugin.saveSettings();
    }

    this.renderUrlValidationMessage(validation);
  }

  private renderUrlValidationMessage(validation: {
    valid: boolean;
    message: string;
  }): void {
    if (!this.urlValidationEl) return;
    this.urlValidationEl.empty();
    this.urlValidationEl.createEl("div", {
      text: validation.message,
      cls: validation.valid
        ? "setting-item-description"
        : "setting-item-description mod-warning",
    });
  }

  hide(): void {
    if (this.urlValidationTimer !== null) {
      clearTimeout(this.urlValidationTimer);
      this.urlValidationTimer = null;
    }
    super.hide?.();
  }

  private validateUrl(url: string): { valid: boolean; message: string; fixed?: string } {
    const trimmed = url.trim();

    if (!trimmed) {
      return { valid: false, message: "URL is required" };
    }

    // Mid-typing a protocol prefix — anything from "http" through
    // "https://". Without this guard, deleting one slash from
    // "https://" leaves "https:/", which the missing-protocol branch
    // below would naively prepend to as "https://https:/" (JB-15 bug).
    if (/^https?(:\/?\/?)?$/i.test(trimmed)) {
      return { valid: false, message: "Continue typing — URL incomplete." };
    }

    // Check if protocol is missing
    if (!trimmed.match(/^https?:\/\//i)) {
      // The value already starts with "http"/"https" but doesn't have a
      // complete "://" — it's a half-edited protocol (e.g. "https:/jira.com"
      // with one slash). Don't auto-prepend; surface a hint and wait for
      // the user to finish.
      if (/^https?/i.test(trimmed)) {
        return {
          valid: false,
          message: "⚠️ Incomplete URL. Finish typing the protocol (https://...).",
        };
      }
      return {
        valid: false,
        message: "⚠️ Missing protocol. Auto-fixed to use https://",
        fixed: `https://${trimmed.replace(/^\/+/, "")}`,
      };
    }

    // Check for trailing slash — only strip if there's a host before it,
    // so we never reduce "https://" to a bare "https:".
    if (trimmed.endsWith("/")) {
      const stripped = trimmed.replace(/\/+$/, "");
      if (/^https?:\/\/.+/i.test(stripped)) {
        return {
          valid: false,
          message: "⚠️ Trailing slash detected. Auto-fixed.",
          fixed: stripped,
        };
      }
      // else fall through — URL constructor will reject as invalid.
    }

    // Basic URL validation
    try {
      const urlObj = new URL(trimmed);
      if (!urlObj.hostname) {
        return { valid: false, message: "❌ Invalid URL: missing hostname" };
      }
      return { valid: true, message: "✓ Valid URL" };
    } catch {
      return { valid: false, message: "❌ Invalid URL format" };
    }
  }

  display(): void {
    // Cancel any pending URL validation timer before rebuilding the tab,
    // since display() will create a new text element and the old timer
    // would reference a now-detached element.
    if (this.urlValidationTimer !== null) {
      clearTimeout(this.urlValidationTimer);
      this.urlValidationTimer = null;
    }
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "JIRA Bases" });

    const scopeNote = containerEl.createEl("p", { cls: "setting-item-description" });
    scopeNote.setText(
      "Scope: JIRA Data Center only (no Cloud), PAT auth (no OAuth), desktop only. " +
        "One JIRA instance per vault. No telemetry.",
    );

    containerEl.createEl("h3", { text: "Connection & links" });
    containerEl
      .createEl("p", { cls: "setting-item-description" })
      .setText(
        "Point the plugin at your JIRA instance and paste a PAT, then choose how inserted issue links and stub notes are shaped.",
      );

    const urlSetting = new Setting(containerEl)
      .setName("JIRA base URL")
      .setDesc("e.g. https://jira.me.com (no trailing slash required)");

    this.urlValidationEl = urlSetting.descEl;

    urlSetting.addText((text) =>
      text
        .setPlaceholder("https://jira.example.com")
        .setValue(this.plugin.settings.baseUrl)
        .onChange(async (value) => {
          // Persist what the user typed verbatim so the value isn't lost if
          // they close the settings tab before debounce fires. The
          // validator and auto-fix run on a timer (see
          // scheduleUrlValidation) — running them here used to call
          // this.display() on every keystroke, which rebuilt the input
          // element and stole focus, and let mid-edit protocol fragments
          // (e.g. "ttps://jira.com") get a second "https://" prepended.
          this.plugin.settings.baseUrl = value.trim();
          await this.plugin.saveSettings();
          this.scheduleUrlValidation(text);
        }),
    );

    // Show initial validation state if URL exists
    if (this.plugin.settings.baseUrl) {
      this.renderUrlValidationMessage(
        this.validateUrl(this.plugin.settings.baseUrl),
      );
    }

    // Check if a token is already saved for the current base URL
    const hasToken = this.plugin.settings.baseUrl &&
      this.plugin.settings.encryptedTokens[this.plugin.settings.baseUrl];
    const storageDesc =
      "Encrypted at rest using Electron safeStorage (key derived from your OS keychain). " +
      "Ciphertext lives in this vault's plugin-data file, not in the OS keychain itself.";
    const tokenDesc = hasToken ? `✓ Token saved. ${storageDesc}` : storageDesc;

    new Setting(containerEl)
      .setName("Personal Access Token")
      .setDesc(tokenDesc)
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
          this.display();
        }),
      )
      .addButton((btn) =>
        btn
          .setButtonText("Test")
          .setTooltip("Calls /rest/api/2/myself and shows the result.")
          .onClick(() => this.plugin.testConnection()),
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

    const linkTemplateSetting = new Setting(containerEl)
      .setName("Link template")
      .setDesc(
        "Tokens: {key}, {summary}, {status}, {type}, {priority}, {assignee}, {reporter}, {labels}, {updated}, {url}. Unknown tokens are left as-is.",
      )
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_LINK_TEMPLATE)
          .setValue(this.plugin.settings.linkTemplate)
          .onChange(async (value) => {
            this.plugin.settings.linkTemplate = value;
            await this.plugin.saveSettings();
            this.renderTemplateWarning(this.linkTemplateFeedbackEl, value);
          }),
      )
      .addButton((btn) =>
        btn.setButtonText("Reset to default").onClick(async () => {
          this.plugin.settings.linkTemplate = DEFAULT_LINK_TEMPLATE;
          await this.plugin.saveSettings();
          this.display();
        }),
      );

    this.linkTemplateFeedbackEl = linkTemplateSetting.descEl.createEl("div");
    this.renderTemplateWarning(
      this.linkTemplateFeedbackEl,
      this.plugin.settings.linkTemplate,
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
    containerEl
      .createEl("p", { cls: "setting-item-description" })
      .setText(
        "Watches the active editor for bare JIRA keys matching the configured prefixes and turns them into links after a brief idle pause. Failed lookups are remembered for a while to avoid hammering the API.",
      );

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
      .setName("Idle delay (seconds)")
      .setDesc(
        "How long to wait after the last keystroke before applying queued lookups. Range 0.1–60 s (stored as ms internally).",
      )
      .addText((t) =>
        t
          .setPlaceholder("2")
          .setValue(formatMsAsSeconds(this.plugin.settings.autoLookupIdleMs))
          .onChange(async (v) => {
            const ms = parseSecondsToMs(v);
            if (ms !== null && ms >= 100 && ms <= 60000) {
              this.plugin.settings.autoLookupIdleMs = ms;
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

    const autoLookupTemplateSetting = new Setting(containerEl)
      .setName("Custom auto-lookup template")
      .setDesc(
        "Reflects the current style. Editing this flips the style to Custom. Tokens match Link template.",
      )
      .addText((t) => {
        templateTextSetValue = (v) => {
          t.setValue(v);
          this.renderTemplateWarning(this.autoLookupTemplateFeedbackEl, v);
        };
        t.setPlaceholder("[{key}]({url})")
          .setValue(this.plugin.settings.autoLookupTemplate)
          .onChange(async (v) => {
            this.plugin.settings.autoLookupTemplate = v;
            if (this.plugin.settings.autoLookupMode !== "custom") {
              this.plugin.settings.autoLookupMode = "custom";
              modeDropdownSetValue?.("custom");
            }
            await this.plugin.saveSettings();
            this.renderTemplateWarning(this.autoLookupTemplateFeedbackEl, v);
          });
      });

    this.autoLookupTemplateFeedbackEl =
      autoLookupTemplateSetting.descEl.createEl("div");
    this.renderTemplateWarning(
      this.autoLookupTemplateFeedbackEl,
      this.plugin.settings.autoLookupTemplate,
    );

    const prefixSetting = new Setting(containerEl)
      .setName("Project prefixes")
      .setDesc(
        "Comma-separated JIRA project prefixes (e.g. ABC, PROJ). Enables bare-key matching for these prefixes. Leave empty to match only explicit issue links.",
      )
      .addText((text) =>
        text
          .setPlaceholder("ABC, PROJ")
          .setValue(this.plugin.settings.projectPrefixes.join(", "))
          .onChange(async (value) => {
            const { accepted, rejected } = splitProjectPrefixes(value);
            this.plugin.settings.projectPrefixes = accepted;
            await this.plugin.saveSettings();
            this.renderPrefixFeedback(rejected);
          }),
      );

    this.prefixFeedbackEl = prefixSetting.descEl.createEl("div");
    // No initial feedback — saved settings are by definition all accepted.

    new Setting(containerEl)
      .setName("Failed keys cache TTL (ms)")
      .setDesc(
        "How long to remember failed JIRA key lookups before retrying. Prevents repeated API calls for invalid keys.",
      )
      .addText((t) =>
        t
          .setPlaceholder("600000")
          .setValue(String(this.plugin.settings.autoLookupFailedKeysTTLMs))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            if (Number.isFinite(n) && n >= 0 && n <= 3600000) {
              this.plugin.settings.autoLookupFailedKeysTTLMs = n;
              await this.plugin.saveSettings();
              this.plugin.recreateFailedKeysTracker();
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
          .setPlaceholder("500")
          .setValue(String(this.plugin.settings.autoLookupFailedKeysMaxSize))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            if (Number.isFinite(n) && n >= 1 && n <= 1000) {
              this.plugin.settings.autoLookupFailedKeysMaxSize = n;
              await this.plugin.saveSettings();
              this.plugin.recreateFailedKeysTracker();
            }
          }),
      );

    containerEl.createEl("h3", { text: "Auto-refresh stubs" });
    containerEl
      .createEl("p", { cls: "setting-item-description" })
      .setText(
        "Re-pulls every stub file in the configured folder on a timer, so JIRA-side changes appear in your vault without a manual sync.",
      );

    new Setting(containerEl)
      .setName("Enable auto-refresh")
      .setDesc(
        "Automatically refresh all stub files at a regular interval to keep issue data up-to-date.",
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.autoRefreshEnabled).onChange(async (v) => {
          this.plugin.settings.autoRefreshEnabled = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Refresh interval (minutes)")
      .setDesc(
        "How often to automatically refresh all stub files (minimum 1 minute). Skipped while the Obsidian window is hidden — refresh resumes on the next scheduled tick after the window becomes visible again.",
      )
      .addText((t) =>
        t
          .setPlaceholder("60")
          .setValue(String(this.plugin.settings.autoRefreshIntervalMinutes))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            if (Number.isFinite(n) && n >= 1) {
              this.plugin.settings.autoRefreshIntervalMinutes = n;
              await this.plugin.saveSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Refresh on startup")
      .setDesc("Automatically refresh all stub files when Obsidian starts.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.autoRefreshOnStartup).onChange(async (v) => {
          this.plugin.settings.autoRefreshOnStartup = v;
          await this.plugin.saveSettings();
        }),
      );
  }
}
