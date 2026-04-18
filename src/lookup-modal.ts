import { App, Modal, Notice, Setting } from "obsidian";
import type { IssueService } from "./issue-service";
import { renderIssue, errorMessage } from "./issue-preview-view";
import { parseKeyOrUrl } from "./jira-key";

export class LookupModal extends Modal {
  private input = "";
  constructor(
    app: App,
    private readonly service: IssueService,
    private readonly baseUrl: string,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText("JIRA: Look up issue");

    new Setting(contentEl)
      .setName("Issue key or URL")
      .addText((t) =>
        t
          .setPlaceholder("ABC-123 or https://jira.me.com/browse/ABC-123")
          .onChange((v) => (this.input = v)),
      );

    const resultEl = contentEl.createDiv({ cls: "jb-lookup-result" });

    new Setting(contentEl).addButton((b) =>
      b
        .setButtonText("Look up")
        .setCta()
        .onClick(() => this.runLookup(resultEl)),
    );
  }

  private runLookup(resultEl: HTMLElement): void {
    const key = parseKeyOrUrl(this.input, this.baseUrl);
    if (!key) {
      new Notice(`Couldn't parse '${this.input}' as a JIRA key or URL.`);
      return;
    }
    this.service.lookup(key, (state) => {
      renderIssue(resultEl, state, { baseUrl: this.baseUrl });
      if (state.state === "error") {
        new Notice(errorMessage(state.error));
      }
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
