import { describe, it, expect } from "vitest";
import {
  collectAllKeys,
  findOrphanedStubs,
  IndexerDeps,
} from "./indexer";

function deps(
  initial: Record<string, string>,
  settings: { baseUrl: string; prefixes: string[]; stubsFolder: string } = {
    baseUrl: "https://jira.me.com",
    prefixes: [],
    stubsFolder: "JIRA",
  },
): IndexerDeps & { files: Map<string, string> } {
  const files = new Map(Object.entries(initial));
  return {
    files,
    async read(path) {
      return files.has(path) ? files.get(path)! : null;
    },
    async listNotes() {
      return [...files.keys()].filter((p) => p.endsWith(".md"));
    },
    getSettings: () => settings,
  };
}

describe("collectAllKeys", () => {
  it("scans note bodies for browse links across the vault", async () => {
    const d = deps({
      "a.md":
        "see [t1](https://jira.me.com/browse/ABC-1) and [t2](https://jira.me.com/browse/ABC-2)\n",
      "b.md": "ref [t3](https://jira.me.com/browse/DEF-3)\n",
    });
    const keys = await collectAllKeys(d, "JIRA");
    expect([...keys].sort()).toEqual(["ABC-1", "ABC-2", "DEF-3"]);
  });

  it("matches bare keys when configured prefixes are present", async () => {
    const d = deps(
      { "a.md": "Today touched ABC-5 and DEF-7 in the body\n" },
      { baseUrl: "https://jira.me.com", prefixes: ["ABC", "DEF"], stubsFolder: "JIRA" },
    );
    const keys = await collectAllKeys(d, "JIRA");
    expect([...keys].sort()).toEqual(["ABC-5", "DEF-7"]);
  });

  it("skips notes inside the stubs folder", async () => {
    const d = deps({
      "a.md": "body [t](https://jira.me.com/browse/ABC-1)\n",
      "JIRA/ABC-99 stub.md":
        "body [t](https://jira.me.com/browse/SHOULD-NOT-COUNT-1)\n",
    });
    const keys = await collectAllKeys(d, "JIRA");
    expect([...keys].sort()).toEqual(["ABC-1"]);
  });

  it("ignores issue-key-shaped strings inside frontmatter", async () => {
    // The body has no JIRA references; frontmatter has values that look like
    // issue keys. The plugin must not pick those up — it owns nothing in user
    // frontmatter and must not surface user-authored values as references.
    const d = deps(
      {
        "a.md":
          '---\nrelated: ABC-99\nlabels:\n  - "DEF-42"\n---\nNothing in the body references JIRA.\n',
      },
      { baseUrl: "https://jira.me.com", prefixes: ["ABC", "DEF"], stubsFolder: "JIRA" },
    );
    const keys = await collectAllKeys(d, "JIRA");
    expect([...keys]).toEqual([]);
  });

  it("returns empty set immediately when neither baseUrl nor prefixes are configured", async () => {
    const d = deps(
      { "a.md": "ABC-1 and DEF-2 in the body\n" },
      { baseUrl: "", prefixes: [], stubsFolder: "JIRA" },
    );
    const keys = await collectAllKeys(d, "JIRA");
    expect([...keys]).toEqual([]);
  });

  it("normalises leading slashes on stubsFolder so stubs are still excluded", async () => {
    const d = deps({
      "user.md": "body [t](https://jira.me.com/browse/ABC-1)\n",
      "JIRA/ABC-1 stub.md":
        "body [t](https://jira.me.com/browse/ABC-1)\n",
    });
    // Leading slash should be stripped; stub must still be excluded.
    const keys = await collectAllKeys(d, "/JIRA");
    expect([...keys]).toEqual(["ABC-1"]);
  });
});

describe("findOrphanedStubs", () => {
  it("returns stubs whose key is no longer referenced anywhere in the vault", async () => {
    const d = deps({
      "a.md": "body [t](https://jira.me.com/browse/ABC-1)\n",
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
