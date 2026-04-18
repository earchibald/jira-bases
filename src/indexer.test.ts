import { describe, it, expect } from "vitest";
import {
  rescanFile,
  collectAllKeys,
  findOrphanedStubs,
  IndexerDeps,
} from "./indexer";

function deps(
  initial: Record<string, string>,
  settings = { baseUrl: "https://jira.me.com", prefixes: [] as string[] },
): IndexerDeps & { files: Map<string, string> } {
  const files = new Map(Object.entries(initial));
  return {
    files,
    async read(path) {
      return files.has(path) ? files.get(path)! : null;
    },
    async write(path, content) {
      files.set(path, content);
    },
    async listNotes() {
      return [...files.keys()].filter((p) => p.endsWith(".md"));
    },
    getSettings: () => settings,
  };
}

describe("rescanFile", () => {
  it("populates jira_issues from content", async () => {
    const d = deps({
      "daily.md":
        "today we looked at [a](https://jira.me.com/browse/ABC-1) and [b](https://jira.me.com/browse/ABC-2)\n",
    });
    await rescanFile(d, "daily.md");
    expect(d.files.get("daily.md")).toContain(
      "jira_issues:\n  - ABC-1\n  - ABC-2",
    );
  });

  it("is a no-op when keys are already present in the same order", async () => {
    const d = deps({
      "daily.md": `---\njira_issues:\n  - ABC-1\n---\nbody with [a](https://jira.me.com/browse/ABC-1)\n`,
    });
    const before = d.files.get("daily.md");
    await rescanFile(d, "daily.md");
    expect(d.files.get("daily.md")).toBe(before);
  });

  it("removes keys that are no longer referenced", async () => {
    const d = deps({
      "daily.md": `---\njira_issues:\n  - ABC-1\n  - ABC-2\n---\nbody only refs [a](https://jira.me.com/browse/ABC-1)\n`,
    });
    await rescanFile(d, "daily.md");
    expect(d.files.get("daily.md")).toContain("jira_issues:\n  - ABC-1\n");
    expect(d.files.get("daily.md")).not.toContain("ABC-2");
  });

  it("uses prefixes for bare-key matching", async () => {
    const d = deps(
      { "daily.md": "See ABC-5 today\n" },
      { baseUrl: "https://jira.me.com", prefixes: ["ABC"] },
    );
    await rescanFile(d, "daily.md");
    expect(d.files.get("daily.md")).toContain("jira_issues:\n  - ABC-5");
  });
});

describe("collectAllKeys", () => {
  it("unions jira_issues lists across notes, skipping the stubs folder", async () => {
    const d = deps({
      "a.md": `---\njira_issues:\n  - ABC-1\n  - ABC-2\n---\n`,
      "b.md": `---\njira_issues:\n  - ABC-2\n  - DEF-3\n---\n`,
      "JIRA/ABC-1.md": `---\njira_issues:\n  - SHOULD-NOT-COUNT\n---\n`,
    });
    const keys = await collectAllKeys(d, "JIRA");
    expect([...keys].sort()).toEqual(["ABC-1", "ABC-2", "DEF-3"]);
  });
});

describe("findOrphanedStubs", () => {
  it("returns stub KEYs not referenced by any note", async () => {
    const d = deps({
      "a.md": `---\njira_issues:\n  - ABC-1\n---\n`,
      "JIRA/ABC-1.md": `---\njira_key: ABC-1\n---\n`,
      "JIRA/ABC-2.md": `---\njira_key: ABC-2\n---\n`,
      "JIRA/DEF-9.md": `---\njira_key: DEF-9\n---\n`,
    });
    const orphans = await findOrphanedStubs(d, "JIRA");
    expect(orphans.sort()).toEqual(["ABC-2", "DEF-9"]);
  });
});
