import { describe, it, expect } from "vitest";
import { resolveIssueKey, CursorEditor } from "./resolve-issue-key";

const BASE = "https://jira.me.com";

function fakeEditor(opts: {
  selection?: string;
  cursor?: { line: number; ch: number };
  lines?: string[];
}): CursorEditor {
  const lines = opts.lines ?? [""];
  return {
    getSelection: () => opts.selection ?? "",
    getCursor: () => opts.cursor ?? { line: 0, ch: 0 },
    getLine: (n: number) => lines[n] ?? "",
  };
}

describe("resolveIssueKey", () => {
  it("returns null when nothing resolves", () => {
    expect(
      resolveIssueKey({
        editor: fakeEditor({ lines: ["plain text"] }),
        activeFileFrontmatter: null,
        baseUrl: BASE,
      }),
    ).toBeNull();
  });

  it("resolves a bare key from the selection", () => {
    const r = resolveIssueKey({
      editor: fakeEditor({ selection: "ABC-123" }),
      activeFileFrontmatter: null,
      baseUrl: BASE,
    });
    expect(r).toBe("ABC-123");
  });

  it("resolves a browse URL from the selection", () => {
    const r = resolveIssueKey({
      editor: fakeEditor({ selection: `${BASE}/browse/PROJ-9?x=1` }),
      activeFileFrontmatter: null,
      baseUrl: BASE,
    });
    expect(r).toBe("PROJ-9");
  });

  it("resolves a key embedded in selected prose", () => {
    const r = resolveIssueKey({
      editor: fakeEditor({ selection: "see ABC-1 today" }),
      activeFileFrontmatter: null,
      baseUrl: BASE,
    });
    expect(r).toBe("ABC-1");
  });

  it("resolves a key from a markdown link under the cursor", () => {
    const line = `text [SRE-1](${BASE}/browse/SRE-1) more`;
    const r = resolveIssueKey({
      editor: fakeEditor({ cursor: { line: 0, ch: 10 }, lines: [line] }),
      activeFileFrontmatter: null,
      baseUrl: BASE,
    });
    expect(r).toBe("SRE-1");
  });

  it("falls back to anchor text when href host doesn't match", () => {
    const line = `[ABC-2](https://elsewhere.com/x)`;
    const r = resolveIssueKey({
      editor: fakeEditor({ cursor: { line: 0, ch: 3 }, lines: [line] }),
      activeFileFrontmatter: null,
      baseUrl: BASE,
    });
    expect(r).toBe("ABC-2");
  });

  it("resolves a bare key under the cursor", () => {
    const line = "fix SRE-1235 today";
    const r = resolveIssueKey({
      editor: fakeEditor({ cursor: { line: 0, ch: 7 }, lines: [line] }),
      activeFileFrontmatter: null,
      baseUrl: BASE,
    });
    expect(r).toBe("SRE-1235");
  });

  it("ignores cursor when no key is under it", () => {
    const line = "fix the thing today";
    const r = resolveIssueKey({
      editor: fakeEditor({ cursor: { line: 0, ch: 4 }, lines: [line] }),
      activeFileFrontmatter: null,
      baseUrl: BASE,
    });
    expect(r).toBeNull();
  });

  it("falls back to active-file frontmatter jira_key", () => {
    const r = resolveIssueKey({
      editor: fakeEditor({ lines: ["irrelevant"] }),
      activeFileFrontmatter: { jira_key: "ABC-77" },
      baseUrl: BASE,
    });
    expect(r).toBe("ABC-77");
  });

  it("rejects an invalid frontmatter jira_key", () => {
    const r = resolveIssueKey({
      editor: fakeEditor({ lines: ["irrelevant"] }),
      activeFileFrontmatter: { jira_key: "abc-1" },
      baseUrl: BASE,
    });
    expect(r).toBeNull();
  });

  it("ignores non-string frontmatter jira_key", () => {
    const r = resolveIssueKey({
      editor: fakeEditor({ lines: ["irrelevant"] }),
      activeFileFrontmatter: { jira_key: 42 as unknown as string },
      baseUrl: BASE,
    });
    expect(r).toBeNull();
  });

  it("works with no editor (palette invoked outside an editor)", () => {
    const r = resolveIssueKey({
      editor: null,
      activeFileFrontmatter: { jira_key: "ABC-77" },
      baseUrl: BASE,
    });
    expect(r).toBe("ABC-77");
  });

  it("prefers selection over cursor over frontmatter", () => {
    const line = `[KEY-1](${BASE}/browse/KEY-1)`;
    const r = resolveIssueKey({
      editor: fakeEditor({
        selection: "ABC-1",
        cursor: { line: 0, ch: 3 },
        lines: [line],
      }),
      activeFileFrontmatter: { jira_key: "ZZZ-9" },
      baseUrl: BASE,
    });
    expect(r).toBe("ABC-1");
  });
});
