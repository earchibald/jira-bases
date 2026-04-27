import { App, Modal, Setting } from "obsidian";

export interface OverwriteModalCallbacks {
  onOverwrite: () => void;
  onSaveAsNew: () => void;
  onCancel?: () => void;
}

export class OverwriteModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private existingPath: string,
    private alternatePath: string,
    private callbacks: OverwriteModalCallbacks,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText("File already exists");

    contentEl.createEl("p", {
      text: `A file already exists at "${this.existingPath}". What would you like to do?`,
    });
    contentEl.createEl("p", { text: "Overwrite: replace the existing file." });
    contentEl.createEl("p", {
      text: `Save as new: write to "${this.alternatePath}" instead.`,
    });
    contentEl.createEl("p", { text: "Cancel: do nothing." });

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => {
          this.resolved = true;
          this.close();
          this.callbacks.onCancel?.();
        }),
      )
      .addButton((btn) =>
        btn.setButtonText("Overwrite").onClick(() => {
          this.resolved = true;
          this.close();
          this.callbacks.onOverwrite();
        }),
      )
      .addButton((btn) =>
        btn
          .setButtonText("Save as new")
          .setCta()
          .onClick(() => {
            this.resolved = true;
            this.close();
            this.callbacks.onSaveAsNew();
          }),
      );
  }

  onClose(): void {
    if (!this.resolved) {
      this.resolved = true;
      this.callbacks.onCancel?.();
    }
    this.contentEl.empty();
  }
}
