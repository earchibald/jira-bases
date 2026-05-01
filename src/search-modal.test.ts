// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { Issue, JiraClient, Result } from "./jira-client";
import { SearchModal } from "./search-modal";

function issue(key: string, summary = `Summary for ${key}`): Issue {
  return { key, summary, status: "Open", type: "Task" };
}

function ok<T>(value: T): Result<T, never> {
  return { ok: true, value } as Result<T, never>;
}

function createClient(overrides: Partial<JiraClient> = {}): JiraClient {
  return {
    getCurrentUser: vi.fn(),
    getIssue: vi.fn(async (key: string) => ok(issue(key, `Server ${key}`))),
    searchIssues: vi.fn(async () => ok([issue("SRV-1", "Server result")])),
    getIssueDetails: vi.fn(),
    addComment: vi.fn(),
    ...overrides,
  } as unknown as JiraClient;
}

function createModal(opts: Partial<{
  client: JiraClient;
  localIssues: Issue[];
  onInsert: (issue: Issue) => void | Promise<void>;
  onOpenIssue: (issue: Issue) => void | Promise<void>;
}> = {}) {
  const modal = new SearchModal({
    app: {} as any,
    client: opts.client ?? createClient(),
    loadLocalIssues: () => opts.localIssues ?? [issue("LOC-1", "Local match")],
    onInsert: opts.onInsert ?? vi.fn(),
    onOpenIssue: opts.onOpenIssue ?? vi.fn(),
  });
  return modal;
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("SearchModal", () => {
  it("renders title, helper text, and server-search button", () => {
    const modal = createModal();
    modal.onOpen();
    expect(modal.titleEl.textContent).toBe("JIRA: Search issues");
    expect(modal.contentEl.textContent).toContain(
      "Search local stubs instantly.",
    );
    expect(
      Array.from(modal.contentEl.querySelectorAll("button")).some(
        (button) => button.textContent === "Search on server",
      ),
    ).toBe(true);
  });

  it("shows local results and the server hint while typing", () => {
    const modal = createModal({
      localIssues: [issue("LOC-1", "Fix login locally"), issue("OTHER-1", "Nothing here")],
    });
    modal.onOpen();

    const input = modal.contentEl.querySelector("input") as HTMLInputElement;
    input.value = "login";
    input.dispatchEvent(new Event("input"));

    expect(modal.contentEl.textContent).toContain("Cmd-Enter to search on server");
    expect(modal.contentEl.textContent).toContain("LOC-1 — Fix login locally");
    expect(modal.contentEl.textContent).not.toContain("OTHER-1 — Nothing here");
  });

  it("replaces local matches with server results when searching on server", async () => {
    const modal = createModal({
      localIssues: [issue("LOC-1", "Local match")],
      client: createClient({
        searchIssues: vi.fn(async () => ok([issue("SRV-2", "Server-only match")])),
      }),
    });
    modal.onOpen();

    const input = modal.contentEl.querySelector("input") as HTMLInputElement;
    input.value = "server";
    input.dispatchEvent(new Event("input"));

    const button = Array.from(modal.contentEl.querySelectorAll("button")).find(
      (el) => el.textContent === "Search on server",
    ) as HTMLButtonElement;
    button.click();
    await flush();

    expect(modal.contentEl.textContent).not.toContain("LOC-1 — Local match");
    expect(modal.contentEl.textContent).toContain("SRV-2 — Server-only match");
    expect(modal.contentEl.textContent).toContain("Showing live JIRA server results.");
  });

  it("uses Cmd-Enter in the input to trigger server search", async () => {
    const searchIssues = vi.fn(async () => ok([issue("SRV-3", "Keyboard result")]));
    const modal = createModal({ client: createClient({ searchIssues }) });
    modal.onOpen();

    const input = modal.contentEl.querySelector("input") as HTMLInputElement;
    input.value = "server";
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true }));
    await flush();

    expect(searchIssues).toHaveBeenCalledWith("server", 20);
    expect(modal.contentEl.textContent).toContain("SRV-3 — Keyboard result");
  });

  it("inserts the first selected result on Enter from the input", async () => {
    const onInsert = vi.fn();
    const modal = createModal({
      localIssues: [issue("LOC-1", "Fix login locally")],
      onInsert,
    });
    const closeSpy = vi.spyOn(modal, "close");
    modal.onOpen();

    const input = modal.contentEl.querySelector("input") as HTMLInputElement;
    input.value = "login";
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await flush();

    expect(onInsert).toHaveBeenCalledWith(issue("LOC-1", "Fix login locally"));
    expect(closeSpy).toHaveBeenCalled();
  });

  it("opens the selected result in browser on Cmd-Enter from the results list", async () => {
    const onOpenIssue = vi.fn();
    const modal = createModal({
      localIssues: [issue("LOC-1", "Fix login locally")],
      onOpenIssue,
    });
    const closeSpy = vi.spyOn(modal, "close");
    modal.onOpen();

    const input = modal.contentEl.querySelector("input") as HTMLInputElement;
    input.value = "login";
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));

    const resultButton = Array.from(modal.contentEl.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("LOC-1"),
    ) as HTMLButtonElement;
    resultButton.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true }));
    await flush();

    expect(onOpenIssue).toHaveBeenCalledWith(issue("LOC-1", "Fix login locally"));
    expect(closeSpy).toHaveBeenCalled();
  });

  it("returns focus to the input and selects the text on Escape from the results list", () => {
    const modal = createModal({
      localIssues: [issue("LOC-1", "Fix login locally")],
    });
    modal.onOpen();

    const input = modal.contentEl.querySelector("input") as HTMLInputElement;
    const focusSpy = vi.spyOn(input, "focus");
    const selectSpy = vi.spyOn(input, "select");
    input.value = "login";
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));

    const resultButton = Array.from(modal.contentEl.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("LOC-1"),
    ) as HTMLButtonElement;
    resultButton.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(focusSpy).toHaveBeenCalled();
    expect(selectSpy).toHaveBeenCalled();
  });
});
