import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Issue, JiraClient } from "./jira-client";
import type { Result } from "./jira-client";
import { CommentIssueSuggestModal } from "./comment-issue-modal";

function issue(key: string, summary = `Summary for ${key}`): Issue {
  return { key, summary, status: "Open", type: "Task" };
}

function ok<T>(value: T): Result<T, never> {
  return { ok: true, value } as Result<T, never>;
}

function mockClient(overrides: Partial<JiraClient> = {}): JiraClient {
  return {
    getCurrentUser: vi.fn(),
    getIssue: vi.fn(async (key: string) => ok(issue(key))),
    searchIssues: vi.fn(async () => ok([])),
    getIssueDetails: vi.fn(),
    addComment: vi.fn(),
    ...overrides,
  } as unknown as JiraClient;
}

function createModal(opts: { frontmatterKeys?: string[]; client?: JiraClient }) {
  const client = opts.client ?? mockClient();
  return new CommentIssueSuggestModal({
    app: {} as any,
    client,
    frontmatterKeys: opts.frontmatterKeys ?? [],
    onChoose: vi.fn(),
  });
}

describe("CommentIssueSuggestModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  describe("empty query returns frontmatter issues", () => {
    it("fetches and returns frontmatter issues in order", async () => {
      const modal = createModal({ frontmatterKeys: ["ABC-1", "DEF-2"] });
      const results = await modal.getSuggestions("");
      expect(results).toEqual([issue("ABC-1"), issue("DEF-2")]);
    });

    it("returns empty array when no frontmatter keys", async () => {
      const modal = createModal({ frontmatterKeys: [] });
      const results = await modal.getSuggestions("");
      expect(results).toEqual([]);
    });

    it("filters out issues that fail to fetch", async () => {
      const client = mockClient({
        getIssue: vi.fn(async (key: string) => {
          if (key === "BAD-1") {
            return { ok: false, error: { kind: "not-found", key: "BAD-1" } } as any;
          }
          return ok(issue(key));
        }),
      });
      const modal = createModal({ frontmatterKeys: ["ABC-1", "BAD-1", "DEF-2"], client });
      const results = await modal.getSuggestions("");
      expect(results).toEqual([issue("ABC-1"), issue("DEF-2")]);
    });
  });

  describe("elevation logic", () => {
    it("elevates frontmatter issues to the top of search results", async () => {
      const searchResults = [issue("OTHER-1"), issue("FM-1"), issue("OTHER-2"), issue("FM-2")];
      const client = mockClient({
        searchIssues: vi.fn(async () => ok(searchResults)),
      });
      const modal = createModal({ frontmatterKeys: ["FM-1", "FM-2"], client });

      const promise = modal.getSuggestions("some query");
      await vi.advanceTimersByTimeAsync(300);
      const results = await promise;

      expect(results.map((i) => i.key)).toEqual(["FM-1", "FM-2", "OTHER-1", "OTHER-2"]);
    });

    it("preserves original order within elevated group", async () => {
      const searchResults = [issue("Z-3"), issue("FM-B"), issue("A-1"), issue("FM-A")];
      const client = mockClient({
        searchIssues: vi.fn(async () => ok(searchResults)),
      });
      const modal = createModal({ frontmatterKeys: ["FM-A", "FM-B"], client });

      const promise = modal.getSuggestions("query");
      await vi.advanceTimersByTimeAsync(300);
      const results = await promise;

      // FM-B appears before FM-A in search results, so that order is preserved
      expect(results.map((i) => i.key)).toEqual(["FM-B", "FM-A", "Z-3", "A-1"]);
    });

    it("preserves original order within non-elevated group", async () => {
      const searchResults = [issue("C-1"), issue("FM-1"), issue("A-1"), issue("B-1")];
      const client = mockClient({
        searchIssues: vi.fn(async () => ok(searchResults)),
      });
      const modal = createModal({ frontmatterKeys: ["FM-1"], client });

      const promise = modal.getSuggestions("query");
      await vi.advanceTimersByTimeAsync(300);
      const results = await promise;

      expect(results.map((i) => i.key)).toEqual(["FM-1", "C-1", "A-1", "B-1"]);
    });

    it("returns results unchanged when no frontmatter keys match", async () => {
      const searchResults = [issue("A-1"), issue("B-2"), issue("C-3")];
      const client = mockClient({
        searchIssues: vi.fn(async () => ok(searchResults)),
      });
      const modal = createModal({ frontmatterKeys: ["NONE-1"], client });

      const promise = modal.getSuggestions("query");
      await vi.advanceTimersByTimeAsync(300);
      const results = await promise;

      expect(results.map((i) => i.key)).toEqual(["A-1", "B-2", "C-3"]);
    });

    it("returns results unchanged when frontmatter is empty", async () => {
      const searchResults = [issue("A-1"), issue("B-2")];
      const client = mockClient({
        searchIssues: vi.fn(async () => ok(searchResults)),
      });
      const modal = createModal({ frontmatterKeys: [], client });

      const promise = modal.getSuggestions("query");
      await vi.advanceTimersByTimeAsync(300);
      const results = await promise;

      expect(results.map((i) => i.key)).toEqual(["A-1", "B-2"]);
    });
  });

  describe("issue key query", () => {
    it("fetches single issue by key without debounce", async () => {
      const modal = createModal({});
      const results = await modal.getSuggestions("ABC-123");
      expect(results).toEqual([issue("ABC-123")]);
    });
  });
});
