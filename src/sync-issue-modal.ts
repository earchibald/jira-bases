import { App, Modal, Notice, Setting } from "obsidian";
import { parseKeyOrUrl } from "./jira-key";

export class SyncIssueModal extends Modal {
  private input: string;

  constructor(
    app: App,
    prefilled: string,
    private readonly baseUrl: string,
    private readonly onConfirm: (key: string) => void,
  ) {
    super(app);
    this.input = prefilled;
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText("JIRA: Sync this issue");

    contentEl.createEl("p", {
      text: "Refresh the stub note for a single JIRA issue.",
    });

    new Setting(contentEl)
      .setName("Issue key or URL")
      .addText((t) => {
        t.setPlaceholder("ABC-123 or https://jira.example.com/browse/ABC-123")
          .setValue(this.input)
          .onChange((v) => (this.input = v));
        t.inputEl.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            this.submit();
          }
        });
      });

    new Setting(contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText("Sync")
          .setCta()
          .onClick(() => this.submit()),
      );
  }

  private submit(): void {
    const key = parseKeyOrUrl(this.input, this.baseUrl);
    if (!key) {
      new Notice(`Couldn't parse '${this.input}' as a JIRA key or URL.`);
      return;
    }
    this.close();
    this.onConfirm(key);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
