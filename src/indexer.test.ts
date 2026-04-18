import { describe, it, expect } from "vitest";
import {
  rescanFile,
  collectAllKeys,
  findOrphanedStubs,
  IndexerDeps,
} from "./indexer";
import { readFrontmatter } from "./frontmatter";

function deps(
  initial: Record<string, string>,
  settings: { baseUrl: string; prefixes: string[]; stubsFolder: string } = {
    baseUrl: "https://jira.me.com",
    prefixes: [],
    stubsFolder: "JIRA",
  },
): IndexerDeps & {
  files: Map<string, string>;
  issues: Map<string, string[]>;
  links: Map<string, string[]>;
} {
  const files = new Map(Object.entries(initial));
  const issues = new Map<string, string[]>();
  const links = new Map<string, string[]>();
  for (const [path, content] of files) {
    const { frontmatter } = readFrontmatter(content);
    if (Array.isArray(frontmatter.jira_issues)) {
      issues.set(
        path,
        (frontmatter.jira_issues as unknown[]).filter(
          (x): x is string => typeof x === "string",
        ),
      );
    }
  }
  return {
    files,
    issues,
    links,
    async read(path) {
      return files.has(path) ? files.get(path)! : null;
    },
    async listNotes() {
      return [...files.keys()].filter((p) => p.endsWith(".md"));
    },
    getSettings: () => settings,
    async setReferences(path, keys, ls) {
      if (keys.length === 0) issues.delete(path);
      else issues.set(path, keys);
      if (ls.length === 0) links.delete(path);
      else links.set(path, ls);
    },
  };
}

describe("rescanFile", () => {
  it("populates jira_issues from content", async () => {
    const d = deps({
      "daily.md":
        "today we looked at [a](https://jira.me.com/browse/ABC-1) and [b](https://jira.me.com/browse/ABC-2)\n",
    });
    await rescanFile(d, "daily.md");
    expect(d.issues.get("daily.md")).toEqual(["ABC-1", "ABC-2"]);
  });

  it("calls setJiraIssues with current scan result (idempotency handled at sink)", async () => {
    const d = deps({
      "daily.md": `---\njira_issues:\n  - ABC-1\n---\nbody with [a](https://jira.me.com/browse/ABC-1)\n`,
    });
    await rescanFile(d, "daily.md");
    expect(d.issues.get("daily.md")).toEqual(["ABC-1"]);
  });

  it("removes keys that are no longer referenced", async () => {
    const d = deps({
      "daily.md": `---\njira_issues:\n  - ABC-1\n  - ABC-2\n---\nbody only refs [a](https://jira.me.com/browse/ABC-1)\n`,
    });
    await rescanFile(d, "daily.md");
    expect(d.issues.get("daily.md")).toEqual(["ABC-1"]);
  });

  it("clears jira_issues when no references remain", async () => {
    const d = deps({
      "daily.md": `---\njira_issues:\n  - ABC-1\n---\nno links now\n`,
    });
    await rescanFile(d, "daily.md");
    expect(d.issues.has("daily.md")).toBe(false);
  });

  it("does not re-match keys already in frontmatter (prunes stale)", async () => {
    const d = deps(
      {
        "daily.md": `---\njira_issues:\n  - SRE-12334\n  - SRE-1234\n  - SRE-1334\n---\nOnly [link](https://jira.me.com/browse/SRE-12334) here.\n`,
      },
      { baseUrl: "https://jira.me.com", prefixes: ["SRE"], stubsFolder: "JIRA" },
    );
    await rescanFile(d, "daily.md");
    expect(d.issues.get("daily.md")).toEqual(["SRE-12334"]);
  });

  it("uses prefixes for bare-key matching", async () => {
    const d = deps(
      { "daily.md": "See ABC-5 today\n" },
      { baseUrl: "https://jira.me.com", prefixes: ["ABC"], stubsFolder: "JIRA" },
    );
    await rescanFile(d, "daily.md");
    expect(d.issues.get("daily.md")).toEqual(["ABC-5"]);
  });

  it("emits jira_links wikilinks when stubs exist for found keys", async () => {
    const d = deps({
      "daily.md":
        "today [a](https://jira.me.com/browse/ABC-1) and [b](https://jira.me.com/browse/ABC-2)\n",
      "JIRA/ABC-1 Fix login.md": `---\njira_key: ABC-1\n---\n`,
    });
    await rescanFile(d, "daily.md");
    expect(d.issues.get("daily.md")).toEqual(["ABC-1", "ABC-2"]);
    expect(d.links.get("daily.md")).toEqual(["[[JIRA/ABC-1 Fix login]]"]);
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
  it("returns orphan {key, path} derived from frontmatter jira_key", async () => {
    const d = deps({
      "a.md": `---\njira_issues:\n  - ABC-1\n---\n`,
      "JIRA/ABC-1 Fix login.md": `---\njira_key: ABC-1\n---\n`,
      "JIRA/ABC-2 Old thing.md": `---\njira_key: ABC-2\n---\n`,
      "JIRA/DEF-9.md": `---\njira_key: DEF-9\n---\n`,
    });
    const orphans = await findOrphanedStubs(d, "JIRA");
    const sorted = orphans.map((o) => o.key).sort();
    expect(sorted).toEqual(["ABC-2", "DEF-9"]);
    const map = new Map(orphans.map((o) => [o.key, o.path]));
    expect(map.get("ABC-2")).toBe("JIRA/ABC-2 Old thing.md");
    expect(map.get("DEF-9")).toBe("JIRA/DEF-9.md");
  });
});
