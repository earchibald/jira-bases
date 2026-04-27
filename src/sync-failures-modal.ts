import { App, Modal, Setting } from "obsidian";

export type SyncFailureKind =
  | "no-token"
  | "auth"
  | "not-found"
  | "network"
  | "http"
  | "parse"
  | "write";

export interface SyncFailure {
  key: string;
  kind: SyncFailureKind;
  message: string;
}

export interface SyncSummary {
  scope: string;
  synced: number;
  failures: SyncFailure[];
  timestamp: number;
}

function formatTimestamp(ms: number): string {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return new Date(ms).toISOString();
  }
}

export class SyncFailuresModal extends Modal {
  constructor(app: App, private readonly summary: SyncSummary) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    const { scope, synced, failures, timestamp } = this.summary;

    titleEl.setText(
      failures.length === 0
        ? "JIRA sync — last run"
        : `JIRA sync — ${failures.length} failure${failures.length === 1 ? "" : "s"}`,
    );

    const meta = contentEl.createEl("p", { cls: "jb-sync-summary-meta" });
    meta.setText(
      `Scope: ${scope} · Synced: ${synced} · At: ${formatTimestamp(timestamp)}`,
    );

    if (failures.length === 0) {
      contentEl.createEl("p", { text: "No failures in the last sync." });
    } else {
      const list = contentEl.createEl("ul", { cls: "jb-sync-failures-list" });
      for (const f of failures) {
        const li = list.createEl("li");
        li.createEl("strong", { text: f.key });
        li.createEl("span", { text: ` [${f.kind}] ` });
        li.createEl("span", { text: f.message });
      }
    }

    new Setting(contentEl).addButton((b) =>
      b
        .setButtonText("Close")
        .setCta()
        .onClick(() => this.close()),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
