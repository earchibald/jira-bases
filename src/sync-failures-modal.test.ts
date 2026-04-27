// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { SyncFailuresModal, SyncSummary } from "./sync-failures-modal";

function summary(over: Partial<SyncSummary> = {}): SyncSummary {
  return {
    scope: "vault",
    synced: 4,
    failures: [],
    timestamp: Date.parse("2026-01-15T10:00:00Z"),
    ...over,
  };
}

function buttonByText(modal: SyncFailuresModal, text: string): HTMLButtonElement {
  const btns = modal.contentEl.querySelectorAll("button");
  const match = Array.from(btns).find((b) => b.textContent === text);
  if (!match) throw new Error(`No button with text "${text}"`);
  return match as HTMLButtonElement;
}

describe("SyncFailuresModal", () => {
  it("renders an empty-state message when there are no failures", () => {
    const modal = new SyncFailuresModal({} as any, summary({ failures: [] }));
    modal.onOpen();
    expect(modal.titleEl.textContent).toBe("JIRA sync — last run");
    expect(modal.contentEl.textContent).toContain("No failures in the last sync.");
  });

  it("lists every failure with its key, kind, and message", () => {
    const modal = new SyncFailuresModal(
      {} as any,
      summary({
        failures: [
          { key: "ABC-1", kind: "auth", message: "Authentication failed (HTTP 401)." },
          { key: "ABC-2", kind: "not-found", message: "Issue ABC-2 not found." },
          { key: "ABC-3", kind: "write", message: "write failed — disk full" },
        ],
      }),
    );
    modal.onOpen();
    const text = modal.contentEl.textContent ?? "";
    expect(text).toContain("ABC-1");
    expect(text).toContain("[auth]");
    expect(text).toContain("Authentication failed");
    expect(text).toContain("ABC-2");
    expect(text).toContain("[not-found]");
    expect(text).toContain("Issue ABC-2 not found.");
    expect(text).toContain("ABC-3");
    expect(text).toContain("[write]");
    expect(text).toContain("write failed — disk full");
  });

  it("titles itself with the failure count", () => {
    const one = new SyncFailuresModal(
      {} as any,
      summary({ failures: [{ key: "X-1", kind: "auth", message: "m" }] }),
    );
    one.onOpen();
    expect(one.titleEl.textContent).toBe("JIRA sync — 1 failure");

    const many = new SyncFailuresModal(
      {} as any,
      summary({
        failures: [
          { key: "X-1", kind: "auth", message: "m" },
          { key: "X-2", kind: "auth", message: "m" },
        ],
      }),
    );
    many.onOpen();
    expect(many.titleEl.textContent).toBe("JIRA sync — 2 failures");
  });

  it("renders the scope and synced count in the meta line", () => {
    const modal = new SyncFailuresModal(
      {} as any,
      summary({ scope: "issue ABC-1", synced: 1 }),
    );
    modal.onOpen();
    const meta = modal.contentEl.querySelector("p.jb-sync-summary-meta");
    expect(meta?.textContent).toContain("Scope: issue ABC-1");
    expect(meta?.textContent).toContain("Synced: 1");
  });

  it("closes when the Close button is clicked", () => {
    const modal = new SyncFailuresModal({} as any, summary());
    const closeSpy = vi.spyOn(modal, "close");
    modal.onOpen();
    buttonByText(modal, "Close").click();
    expect(closeSpy).toHaveBeenCalled();
  });

  it("clears its content on close", () => {
    const modal = new SyncFailuresModal({} as any, summary());
    modal.onOpen();
    expect(modal.contentEl.children.length).toBeGreaterThan(0);
    modal.onClose();
    expect(modal.contentEl.children.length).toBe(0);
  });
});
