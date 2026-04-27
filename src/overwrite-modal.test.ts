// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { OverwriteModal } from "./overwrite-modal";

function makeModal(opts: Partial<{
  onOverwrite: () => void;
  onSaveAsNew: () => void;
  onCancel: () => void;
  existingPath: string;
  alternatePath: string;
}> = {}) {
  const onOverwrite = opts.onOverwrite ?? vi.fn();
  const onSaveAsNew = opts.onSaveAsNew ?? vi.fn();
  const onCancel = opts.onCancel ?? vi.fn();
  const modal = new OverwriteModal(
    {} as any,
    opts.existingPath ?? "JIRA/JIRA Issues.base",
    opts.alternatePath ?? "JIRA/JIRA Issues (1).base",
    { onOverwrite, onSaveAsNew, onCancel },
  );
  return { modal, onOverwrite, onSaveAsNew, onCancel };
}

function buttonByText(modal: OverwriteModal, text: string): HTMLButtonElement {
  const btns = modal.contentEl.querySelectorAll("button");
  const match = Array.from(btns).find((b) => b.textContent === text);
  if (!match) throw new Error(`No button with text "${text}"`);
  return match as HTMLButtonElement;
}

describe("OverwriteModal", () => {
  it("renders the existing path and the alternate path in the body", () => {
    const { modal } = makeModal({
      existingPath: "Foo/JIRA Issues.base",
      alternatePath: "Foo/JIRA Issues (3).base",
    });
    modal.onOpen();
    const text = modal.contentEl.textContent ?? "";
    expect(text).toContain("Foo/JIRA Issues.base");
    expect(text).toContain("Foo/JIRA Issues (3).base");
  });

  it("sets the title", () => {
    const { modal } = makeModal();
    modal.onOpen();
    expect(modal.titleEl.textContent).toBe("File already exists");
  });

  it("renders three buttons: Cancel, Overwrite, Save as new", () => {
    const { modal } = makeModal();
    modal.onOpen();
    const labels = Array.from(modal.contentEl.querySelectorAll("button")).map(
      (b) => b.textContent,
    );
    expect(labels).toEqual(["Cancel", "Overwrite", "Save as new"]);
  });

  it("calls onOverwrite and closes when Overwrite is clicked", () => {
    const { modal, onOverwrite, onSaveAsNew, onCancel } = makeModal();
    const closeSpy = vi.spyOn(modal, "close");
    modal.onOpen();
    buttonByText(modal, "Overwrite").click();
    expect(onOverwrite).toHaveBeenCalledTimes(1);
    expect(onSaveAsNew).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();
  });

  it("calls onSaveAsNew and closes when Save as new is clicked", () => {
    const { modal, onOverwrite, onSaveAsNew, onCancel } = makeModal();
    const closeSpy = vi.spyOn(modal, "close");
    modal.onOpen();
    buttonByText(modal, "Save as new").click();
    expect(onSaveAsNew).toHaveBeenCalledTimes(1);
    expect(onOverwrite).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();
  });

  it("calls onCancel and closes when Cancel is clicked", () => {
    const { modal, onOverwrite, onSaveAsNew, onCancel } = makeModal();
    const closeSpy = vi.spyOn(modal, "close");
    modal.onOpen();
    buttonByText(modal, "Cancel").click();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onOverwrite).not.toHaveBeenCalled();
    expect(onSaveAsNew).not.toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();
  });

  it("tolerates a missing onCancel callback", () => {
    const modal = new OverwriteModal({} as any, "a.base", "a (1).base", {
      onOverwrite: vi.fn(),
      onSaveAsNew: vi.fn(),
    });
    modal.onOpen();
    expect(() => buttonByText(modal, "Cancel").click()).not.toThrow();
  });

  it("Save as new is the CTA button", () => {
    const { modal } = makeModal();
    modal.onOpen();
    const cta = modal.contentEl.querySelector('button[class*="mod-cta"]');
    expect(cta?.textContent).toBe("Save as new");
  });

  it("clears content on close", () => {
    const { modal } = makeModal();
    modal.onOpen();
    expect(modal.contentEl.children.length).toBeGreaterThan(0);
    modal.onClose();
    expect(modal.contentEl.children.length).toBe(0);
  });

  it("calls onCancel when closed without clicking a button (e.g., ESC key)", () => {
    const { modal, onCancel } = makeModal();
    modal.onOpen();
    modal.onClose();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel only once even if onClose is invoked twice", () => {
    const { modal, onCancel } = makeModal();
    modal.onOpen();
    modal.onClose();
    modal.onClose();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
