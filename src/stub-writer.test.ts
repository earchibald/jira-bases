import { describe, it, expect } from "vitest";
import { writeStub, VaultAdapter } from "./stub-writer";
import type { IssueDetails } from "./jira-fields";

function inMemoryVault(initial: Record<string, string> = {}): VaultAdapter & {
  files: Map<string, string>;
  folders: Set<string>;
} {
  const files = new Map<string, string>(Object.entries(initial));
  const folders = new Set<string>();
  return {
    files,
    folders,
    async read(path) {
      return files.has(path) ? files.get(path)! : null;
    },
    async write(path, content) {
      files.set(path, content);
    },
    async exists(path) {
      return files.has(path);
    },
    async ensureFolder(path) {
      folders.add(path);
    },
  };
}

const details: IssueDetails = {
  key: "ABC-1",
  summary: "Fix login",
  status: "In Progress",
  type: "Bug",
  priority: "High",
  assignee: "Eugene",
  reporter: "Colleague",
  labels: ["frontend"],
  updated: "2026-04-15T09:22:00.000+0000",
  url: "https://jira.me.com/browse/ABC-1",
};

describe("writeStub", () => {
  it("creates a new stub with all managed frontmatter and a Notes section", async () => {
    const vault = inMemoryVault();
    await writeStub(vault, "JIRA", details);
    expect(vault.folders.has("JIRA")).toBe(true);
    const written = vault.files.get("JIRA/ABC-1.md")!;
    expect(written).toContain("jira_key: ABC-1");
    expect(written).toContain('jira_summary: "Fix login"');
    expect(written).toContain('jira_status: "In Progress"');
    expect(written).toContain("jira_type: Bug");
    expect(written).toContain("jira_priority: High");
    expect(written).toContain("jira_assignee: Eugene");
    expect(written).toContain("jira_reporter: Colleague");
    expect(written).toContain("jira_labels:\n  - frontend");
    expect(written).toContain("jira_url: https://jira.me.com/browse/ABC-1");
    expect(written).toContain("jira_synced_at:");
    expect(written).toContain("# ABC-1 — Fix login");
    expect(written).toContain("## Notes");
  });

  it("preserves user body below ## Notes on refresh", async () => {
    const vault = inMemoryVault({
      "JIRA/ABC-1.md": `---
jira_key: ABC-1
jira_summary: old
jira_status: To Do
jira_type: Bug
jira_priority: null
jira_assignee: null
jira_reporter: null
jira_labels: []
jira_updated: "2026-04-01T00:00:00.000+0000"
jira_url: https://jira.me.com/browse/ABC-1
jira_synced_at: "2026-04-01T00:00:00.000Z"
---
# ABC-1 — old

[Open in JIRA](https://jira.me.com/browse/ABC-1)

## Notes

my personal note about this issue
with multiple lines
`,
    });
    await writeStub(vault, "JIRA", details);
    const updated = vault.files.get("JIRA/ABC-1.md")!;
    expect(updated).toContain("my personal note about this issue");
    expect(updated).toContain("with multiple lines");
    expect(updated).toContain('jira_summary: "Fix login"');
  });

  it("preserves non-managed frontmatter keys", async () => {
    const vault = inMemoryVault({
      "JIRA/ABC-1.md": `---
jira_key: ABC-1
jira_summary: old
jira_status: To Do
jira_type: Bug
jira_priority: null
jira_assignee: null
jira_reporter: null
jira_labels: []
jira_updated: "2026-04-01T00:00:00.000+0000"
jira_url: https://jira.me.com/browse/ABC-1
jira_synced_at: "2026-04-01T00:00:00.000Z"
custom_tag: mine
---
body
`,
    });
    await writeStub(vault, "JIRA", details);
    const updated = vault.files.get("JIRA/ABC-1.md")!;
    expect(updated).toContain("custom_tag: mine");
  });

  it("updates jira_synced_at to a recent ISO timestamp", async () => {
    const vault = inMemoryVault();
    const before = Date.now();
    await writeStub(vault, "JIRA", details);
    const written = vault.files.get("JIRA/ABC-1.md")!;
    const match = written.match(/jira_synced_at: "([^"]+)"/);
    expect(match).not.toBeNull();
    const t = new Date(match![1]).getTime();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(Date.now() + 1000);
  });
});
