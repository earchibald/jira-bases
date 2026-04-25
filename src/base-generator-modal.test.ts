import { describe, it, expect, vi, beforeEach } from "vitest";
import { BaseGeneratorModal } from "./base-generator-modal";

function createModal(opts: { onGenerate?: (columns: string[]) => void } = {}) {
  const onGenerate = opts.onGenerate ?? vi.fn();
  return new BaseGeneratorModal({ vault: {} } as any, onGenerate);
}

describe("BaseGeneratorModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initialization", () => {
    it("initializes with default checked columns", () => {
      const onGenerate = vi.fn();
      const modal = createModal({ onGenerate });

      // Trigger generate to see which columns are selected
      modal.onOpen();
      const generateButton = modal.contentEl.querySelector(
        'button[class*="mod-cta"]',
      ) as HTMLButtonElement;
      generateButton?.click();

      expect(onGenerate).toHaveBeenCalledWith(
        expect.arrayContaining(["key", "summary", "status", "type", "priority", "assignee"]),
      );
      expect(onGenerate).toHaveBeenCalledWith(
        expect.not.arrayContaining(["reporter", "labels", "updated"]),
      );
    });

    it("creates modal with onGenerate callback", () => {
      const onGenerate = vi.fn();
      const modal = createModal({ onGenerate });
      expect(modal).toBeDefined();
    });
  });

  describe("column selection", () => {
    it("includes all default columns when none are toggled off", () => {
      const onGenerate = vi.fn();
      const modal = createModal({ onGenerate });

      modal.onOpen();
      const generateButton = modal.contentEl.querySelector(
        'button[class*="mod-cta"]',
      ) as HTMLButtonElement;
      generateButton?.click();

      const selectedColumns = onGenerate.mock.calls[0][0];
      expect(selectedColumns).toContain("key");
      expect(selectedColumns).toContain("summary");
      expect(selectedColumns).toContain("status");
      expect(selectedColumns).toContain("type");
      expect(selectedColumns).toContain("priority");
      expect(selectedColumns).toContain("assignee");
      expect(selectedColumns.length).toBe(6);
    });

    it("adds non-default column when toggled on", () => {
      const onGenerate = vi.fn();
      const modal = createModal({ onGenerate });

      modal.onOpen();

      // Find and toggle the "Reporter" checkbox (not default checked)
      const toggles = modal.contentEl.querySelectorAll('input[type="checkbox"]');
      const reporterToggle = Array.from(toggles).find((toggle) => {
        const setting = toggle.closest(".setting-item");
        return setting?.querySelector(".setting-item-name")?.textContent === "Reporter";
      }) as HTMLInputElement;

      if (reporterToggle) {
        reporterToggle.checked = true;
        reporterToggle.dispatchEvent(new Event("change"));
      }

      const generateButton = modal.contentEl.querySelector(
        'button[class*="mod-cta"]',
      ) as HTMLButtonElement;
      generateButton?.click();

      const selectedColumns = onGenerate.mock.calls[0][0];
      expect(selectedColumns).toContain("reporter");
    });

    it("removes default column when toggled off", () => {
      const onGenerate = vi.fn();
      const modal = createModal({ onGenerate });

      modal.onOpen();

      // Find and toggle off the "Status" checkbox (default checked)
      const toggles = modal.contentEl.querySelectorAll('input[type="checkbox"]');
      const statusToggle = Array.from(toggles).find((toggle) => {
        const setting = toggle.closest(".setting-item");
        return setting?.querySelector(".setting-item-name")?.textContent === "Status";
      }) as HTMLInputElement;

      if (statusToggle) {
        statusToggle.checked = false;
        statusToggle.dispatchEvent(new Event("change"));
      }

      const generateButton = modal.contentEl.querySelector(
        'button[class*="mod-cta"]',
      ) as HTMLButtonElement;
      generateButton?.click();

      const selectedColumns = onGenerate.mock.calls[0][0];
      expect(selectedColumns).not.toContain("status");
    });
  });

  describe("generate button", () => {
    it("calls onGenerate with selected columns array", () => {
      const onGenerate = vi.fn();
      const modal = createModal({ onGenerate });

      modal.onOpen();
      const generateButton = modal.contentEl.querySelector(
        'button[class*="mod-cta"]',
      ) as HTMLButtonElement;
      generateButton?.click();

      expect(onGenerate).toHaveBeenCalledTimes(1);
      expect(onGenerate).toHaveBeenCalledWith(expect.any(Array));
    });

    it("closes modal when generate is clicked", () => {
      const onGenerate = vi.fn();
      const modal = createModal({ onGenerate });
      const closeSpy = vi.spyOn(modal, "close");

      modal.onOpen();
      const generateButton = modal.contentEl.querySelector(
        'button[class*="mod-cta"]',
      ) as HTMLButtonElement;
      generateButton?.click();

      expect(closeSpy).toHaveBeenCalled();
    });
  });

  describe("cancel button", () => {
    it("closes modal without calling onGenerate", () => {
      const onGenerate = vi.fn();
      const modal = createModal({ onGenerate });
      const closeSpy = vi.spyOn(modal, "close");

      modal.onOpen();
      const buttons = modal.contentEl.querySelectorAll("button");
      const cancelButton = Array.from(buttons).find(
        (btn) => btn.textContent === "Cancel",
      );
      cancelButton?.click();

      expect(closeSpy).toHaveBeenCalled();
      expect(onGenerate).not.toHaveBeenCalled();
    });
  });

  describe("modal lifecycle", () => {
    it("sets title on open", () => {
      const modal = createModal();
      modal.onOpen();

      expect(modal.titleEl.textContent).toBe("Generate JIRA Bases View");
    });

    it("creates description paragraph on open", () => {
      const modal = createModal();
      modal.onOpen();

      const paragraph = modal.contentEl.querySelector("p");
      expect(paragraph?.textContent).toBe(
        "Select which columns to include in your JIRA issues table:",
      );
    });

    it("clears content on close", () => {
      const modal = createModal();
      modal.onOpen();

      expect(modal.contentEl.children.length).toBeGreaterThan(0);

      modal.onClose();
      expect(modal.contentEl.children.length).toBe(0);
    });
  });

  describe("column options", () => {
    it("displays all available column options", () => {
      const modal = createModal();
      modal.onOpen();

      const expectedColumns = [
        "Issue Key",
        "Summary",
        "Status",
        "Type",
        "Priority",
        "Assignee",
        "Reporter",
        "Labels",
        "Updated",
      ];

      const settings = modal.contentEl.querySelectorAll(".setting-item-name");
      const displayedColumns = Array.from(settings)
        .map((el) => el.textContent)
        .filter((text) => expectedColumns.includes(text || ""));

      expect(displayedColumns.length).toBe(expectedColumns.length);
      expectedColumns.forEach((col) => {
        expect(displayedColumns).toContain(col);
      });
    });

    it("sets correct default states for toggles", () => {
      const modal = createModal();
      modal.onOpen();

      const toggles = modal.contentEl.querySelectorAll('input[type="checkbox"]');

      // Check that default columns are checked
      const defaultCheckedColumns = ["Issue Key", "Summary", "Status", "Type", "Priority", "Assignee"];
      defaultCheckedColumns.forEach((colName) => {
        const toggle = Array.from(toggles).find((t) => {
          const setting = t.closest(".setting-item");
          return setting?.querySelector(".setting-item-name")?.textContent === colName;
        }) as HTMLInputElement;
        expect(toggle?.checked).toBe(true);
      });

      // Check that non-default columns are unchecked
      const defaultUncheckedColumns = ["Reporter", "Labels", "Updated"];
      defaultUncheckedColumns.forEach((colName) => {
        const toggle = Array.from(toggles).find((t) => {
          const setting = t.closest(".setting-item");
          return setting?.querySelector(".setting-item-name")?.textContent === colName;
        }) as HTMLInputElement;
        expect(toggle?.checked).toBe(false);
      });
    });
  });
});
