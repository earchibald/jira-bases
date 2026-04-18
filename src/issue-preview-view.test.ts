// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderIssue } from "./issue-preview-view";
import type { IssueDetails } from "./jira-fields";

const ISSUE: IssueDetails = {
  key: "ABC-1",
  summary: "A sample issue",
  status: "In Progress",
  type: "Task",
  priority: "High",
  assignee: "Alice",
  reporter: "Bob",
  labels: [],
  updated: "2026-04-15T10:00:00.000+0000",
  url: "https://jira.me.com/browse/ABC-1",
};

const CTX = { baseUrl: "https://jira.me.com" };

describe("renderIssue", () => {
  let el: HTMLElement;
  beforeEach(() => {
    el = document.createElement("div");
  });

  it("renders all seven fields on ok state", () => {
    renderIssue(el, { state: "ok", issue: ISSUE, refreshing: false }, CTX);
    expect(el.querySelector(".jb-key")?.textContent).toBe("ABC-1");
    const link = el.querySelector(".jb-key a") as HTMLAnchorElement | null;
    expect(link?.href).toBe("https://jira.me.com/browse/ABC-1");
    expect(el.querySelector(".jb-summary")?.textContent).toBe("A sample issue");
    expect(el.querySelector(".jb-status")?.textContent).toContain("In Progress");
    const meta = el.querySelector(".jb-meta")?.textContent ?? "";
    expect(meta).toContain("Task");
    expect(meta).toContain("High");
    expect(meta).toContain("Alice");
    expect(meta).toContain("Bob");
    expect(el.querySelector(".jb-updated")?.textContent).toMatch(/ago|Apr/);
  });

  it("renders 'Unassigned' when assignee is null", () => {
    renderIssue(
      el,
      { state: "ok", issue: { ...ISSUE, assignee: null }, refreshing: false },
      CTX,
    );
    expect(el.querySelector(".jb-meta")?.textContent ?? "").toContain("Unassigned");
  });

  it("renders refreshing indicator on stale state", () => {
    renderIssue(el, { state: "stale", issue: ISSUE, refreshing: true }, CTX);
    expect(el.querySelector(".jb-refreshing")).not.toBeNull();
    expect(el.querySelector(".jb-summary")?.textContent).toBe("A sample issue");
  });

  it("renders a loading state", () => {
    renderIssue(el, { state: "loading" }, CTX);
    expect(el.querySelector(".jb-loading")).not.toBeNull();
  });

  it("renders distinct error message per kind", () => {
    const cases: Array<[Parameters<typeof renderIssue>[1], RegExp]> = [
      [{ state: "error", error: { kind: "no-token" } }, /Personal Access Token/],
      [{ state: "error", error: { kind: "auth", status: 401, message: "" } }, /Authentication failed/],
      [{ state: "error", error: { kind: "not-found", key: "XYZ-9" } }, /XYZ-9 not found/],
      [{ state: "error", error: { kind: "network", message: "x" } }, /Couldn.?t reach JIRA/],
      [{ state: "error", error: { kind: "http", status: 500, message: "" } }, /HTTP 500/],
      [{ state: "error", error: { kind: "parse", message: "x" } }, /Unexpected response/],
    ];
    for (const [state, re] of cases) {
      const e = document.createElement("div");
      renderIssue(e, state, CTX);
      expect(e.querySelector(".jb-error")?.textContent ?? "").toMatch(re);
    }
  });

  it("is idempotent — re-rendering replaces content", () => {
    renderIssue(el, { state: "loading" }, CTX);
    renderIssue(el, { state: "ok", issue: ISSUE, refreshing: false }, CTX);
    expect(el.querySelector(".jb-loading")).toBeNull();
    expect(el.querySelector(".jb-summary")?.textContent).toBe("A sample issue");
  });
});
