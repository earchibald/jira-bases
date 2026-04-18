import { App, Modal, Setting } from "obsidian";

export class ConfirmModal extends Modal {
  constructor(
    app: App,
    private title: string,
    private lines: string[],
    private confirmLabel: string,
    private onConfirm: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: this.title });
    const listEl = contentEl.createEl("ul");
    for (const line of this.lines) {
      listEl.createEl("li", { text: line });
    }
    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Cancel").onClick(() => this.close()),
      )
      .addButton((b) =>
        b
          .setButtonText(this.confirmLabel)
          .setWarning()
          .onClick(() => {
            this.close();
            this.onConfirm();
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
