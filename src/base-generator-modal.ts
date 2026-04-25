import { App, Modal, Setting } from "obsidian";

export interface ColumnOption {
  id: string;
  label: string;
  defaultChecked: boolean;
}

const AVAILABLE_COLUMNS: ColumnOption[] = [
  { id: "key", label: "Issue Key", defaultChecked: true },
  { id: "summary", label: "Summary", defaultChecked: true },
  { id: "status", label: "Status", defaultChecked: true },
  { id: "type", label: "Type", defaultChecked: true },
  { id: "priority", label: "Priority", defaultChecked: true },
  { id: "assignee", label: "Assignee", defaultChecked: true },
  { id: "reporter", label: "Reporter", defaultChecked: false },
  { id: "labels", label: "Labels", defaultChecked: false },
  { id: "updated", label: "Updated", defaultChecked: false },
];

export class BaseGeneratorModal extends Modal {
  private selectedColumns: Set<string>;

  constructor(
    app: App,
    private onGenerate: (columns: string[]) => void,
  ) {
    super(app);
    this.selectedColumns = new Set(
      AVAILABLE_COLUMNS.filter((c) => c.defaultChecked).map((c) => c.id),
    );
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText("Generate JIRA Bases View");

    contentEl.createEl("p", {
      text: "Select which columns to include in your JIRA issues table:",
    });

    for (const column of AVAILABLE_COLUMNS) {
      new Setting(contentEl).setName(column.label).addToggle((toggle) =>
        toggle.setValue(column.defaultChecked).onChange((value) => {
          if (value) {
            this.selectedColumns.add(column.id);
          } else {
            this.selectedColumns.delete(column.id);
          }
        }),
      );
    }

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => this.close()),
      )
      .addButton((btn) =>
        btn
          .setButtonText("Generate")
          .setCta()
          .onClick(() => {
            this.close();
            this.onGenerate(Array.from(this.selectedColumns));
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
