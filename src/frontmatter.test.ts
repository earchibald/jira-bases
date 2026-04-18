import { describe, it, expect } from "vitest";
import { readFrontmatter, writeFrontmatter } from "./frontmatter";

describe("readFrontmatter", () => {
  it("returns empty frontmatter and whole body when none present", () => {
    const { frontmatter, body } = readFrontmatter("hello world\n");
    expect(frontmatter).toEqual({});
    expect(body).toBe("hello world\n");
  });

  it("parses a simple frontmatter block", () => {
    const input = `---
jira_key: ABC-1
jira_status: "In Progress"
jira_labels:
  - frontend
  - auth
---
body here
`;
    const { frontmatter, body } = readFrontmatter(input);
    expect(frontmatter).toEqual({
      jira_key: "ABC-1",
      jira_status: "In Progress",
      jira_labels: ["frontend", "auth"],
    });
    expect(body).toBe("body here\n");
  });

  it("handles an empty frontmatter block", () => {
    const { frontmatter, body } = readFrontmatter(`---\n---\nhi\n`);
    expect(frontmatter).toEqual({});
    expect(body).toBe("hi\n");
  });
});

describe("writeFrontmatter", () => {
  it("adds a frontmatter block when the file has none", () => {
    const out = writeFrontmatter("hello\n", { jira_issues: ["ABC-1"] });
    expect(out).toBe(`---\njira_issues:\n  - ABC-1\n---\nhello\n`);
  });

  it("merges a patch into existing frontmatter, replacing list fields wholesale", () => {
    const input = `---
title: Daily
jira_issues:
  - OLD-1
---
body
`;
    const out = writeFrontmatter(input, { jira_issues: ["ABC-1", "ABC-2"] });
    expect(out).toBe(`---\ntitle: Daily\njira_issues:\n  - ABC-1\n  - ABC-2\n---\nbody\n`);
  });

  it("preserves body byte-for-byte", () => {
    const input = `---\ntitle: x\n---\nline1\n\nline2\n`;
    const out = writeFrontmatter(input, { title: "y" });
    expect(out).toBe(`---\ntitle: y\n---\nline1\n\nline2\n`);
  });

  it("is idempotent on repeated identical patches", () => {
    const input = `---\nk: v\n---\nbody\n`;
    const once = writeFrontmatter(input, { k: "v" });
    const twice = writeFrontmatter(once!, { k: "v" });
    expect(once).toBe(twice);
  });

  it("emits empty list as []", () => {
    const out = writeFrontmatter("hi\n", { jira_issues: [] });
    expect(out).toBe(`---\njira_issues: []\n---\nhi\n`);
  });

  it("quotes strings containing special characters", () => {
    const out = writeFrontmatter("x\n", { jira_summary: "Fix: the thing" });
    expect(out).toBe(`---\njira_summary: "Fix: the thing"\n---\nx\n`);
  });

  it("returns null when the existing frontmatter cannot be round-tripped", () => {
    const input = `---\nnested: { deeply: { a: 1 } }\n---\nbody\n`;
    expect(writeFrontmatter(input, { k: "v" })).toBeNull();
  });
});
