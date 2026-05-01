import { describe, expect, it } from "vitest";
import {
  analyzeSearchQuery,
  buildSearchJql,
  extractLocalSearchTerms,
  getInputKeyAction,
  getResultKeyAction,
  looksLikeJql,
  searchLocalIssues,
  type SearchIssue,
} from "./search-helpers";

const ISSUES: SearchIssue[] = [
  {
    key: "ABC-123",
    summary: "Fix login bug",
    status: "Open",
    type: "Bug",
    priority: "High",
    assignee: "Eugene",
    reporter: "Colleague",
    labels: ["frontend", "auth"],
    updated: "2026-05-01T10:00:00.000Z",
  },
  { key: "ABC-456", summary: "Improve login screen", status: "In Progress", type: "Task" },
  { key: "OPS-1", summary: "Investigate flaky sync", status: "Open", type: "Spike" },
];

function keyEvent(
  key: string,
  mods: { metaKey?: boolean; ctrlKey?: boolean } = {},
): KeyboardEvent {
  return {
    key,
    metaKey: mods.metaKey ?? false,
    ctrlKey: mods.ctrlKey ?? false,
  } as KeyboardEvent;
}

describe("search query helpers", () => {
  it("detects JQL-looking queries", () => {
    expect(looksLikeJql('project = ABC AND text ~ "login"')).toBe(true);
    expect(looksLikeJql("status in (Open, Closed)")).toBe(true);
    expect(looksLikeJql("fix login")).toBe(false);
  });

  it("extracts local search terms from text and JQL", () => {
    expect(extractLocalSearchTerms("fix login")).toEqual(["fix", "login"]);
    expect(extractLocalSearchTerms('project = ABC AND text ~ "fix login"')).toEqual([
      "abc",
      "fix",
      "login",
    ]);
  });

  it("classifies empty, text, and jql queries", () => {
    expect(analyzeSearchQuery("  ").mode).toBe("empty");
    expect(analyzeSearchQuery("fix login").mode).toBe("text");
    expect(analyzeSearchQuery("status = Open").mode).toBe("jql");
  });

  it("builds plain-text JQL and passes JQL through", () => {
    expect(buildSearchJql('he said "hi"')).toBe(
      'text ~ "he said \\"hi\\"" ORDER BY updated DESC',
    );
    expect(buildSearchJql("project = ABC")).toBe("project = ABC ORDER BY updated DESC");
    expect(buildSearchJql("project = ABC ORDER BY created ASC")).toBe(
      "project = ABC ORDER BY created ASC",
    );
  });
});

describe("searchLocalIssues", () => {
  it("prefers exact key matches over summary-only matches", () => {
    const results = searchLocalIssues(ISSUES, "ABC-123", 20);
    expect(results.map((issue) => issue.key)).toEqual(["ABC-123"]);
  });

  it("returns fuzzy local matches ordered by relevance", () => {
    const results = searchLocalIssues(ISSUES, "login", 20);
    expect(results.map((issue) => issue.key)).toEqual(["ABC-123", "ABC-456"]);
  });

  it("extracts JQL terms before matching local issues", () => {
    const results = searchLocalIssues(ISSUES, 'project = ABC AND text ~ "login"', 20);
    expect(results.map((issue) => issue.key)).toEqual(["ABC-123", "ABC-456"]);
  });

  it("matches on sidebar/preview metadata fields too", () => {
    expect(searchLocalIssues(ISSUES, "Eugene", 20).map((issue) => issue.key)).toEqual([
      "ABC-123",
    ]);
    expect(searchLocalIssues(ISSUES, "Colleague", 20).map((issue) => issue.key)).toEqual([
      "ABC-123",
    ]);
    expect(searchLocalIssues(ISSUES, "frontend", 20).map((issue) => issue.key)).toEqual([
      "ABC-123",
    ]);
    expect(searchLocalIssues(ISSUES, "High", 20).map((issue) => issue.key)).toEqual([
      "ABC-123",
    ]);
    expect(searchLocalIssues(ISSUES, "2026-05-01", 20).map((issue) => issue.key)).toEqual([
      "ABC-123",
    ]);
  });
});

describe("keyboard actions", () => {
  it("maps input keys to modal actions", () => {
    expect(getInputKeyAction(keyEvent("Escape"), { hasResults: true })).toBe("close");
    expect(getInputKeyAction(keyEvent("Enter", { metaKey: true }), { hasResults: false })).toBe(
      "search-server",
    );
    expect(getInputKeyAction(keyEvent("ArrowDown"), { hasResults: true })).toBe("select-first");
    expect(getInputKeyAction(keyEvent("ArrowUp"), { hasResults: true })).toBe("select-last");
    expect(getInputKeyAction(keyEvent("Enter"), { hasResults: true })).toBe("insert-first");
  });

  it("maps result-list keys to navigation and actions", () => {
    expect(getResultKeyAction(keyEvent("Escape"))).toBe("focus-input");
    expect(getResultKeyAction(keyEvent("ArrowDown"))).toBe("move-next");
    expect(getResultKeyAction(keyEvent("ArrowUp"))).toBe("move-prev");
    expect(getResultKeyAction(keyEvent("Enter"))).toBe("insert");
    expect(getResultKeyAction(keyEvent("Enter", { ctrlKey: true }))).toBe("open");
  });
});
