import { describe, it, expect } from "vitest";
import { generateBase, type BaseConfig } from "./base-generator";

describe("generateBase", () => {
  it("generates a minimal base with default view name", () => {
    const config: BaseConfig = {
      columns: ["key", "summary"],
      stubsFolder: "JIRA",
    };
    const base = generateBase(config);
    expect(base).toContain('file.inFolder("JIRA")');
    expect(base).toContain('name: "All issues"');
    expect(base).toContain("- file.name");
    expect(base).toContain("- jira_key");
    expect(base).toContain("- jira_summary");
  });

  it("uses custom view name when provided", () => {
    const config: BaseConfig = {
      columns: ["key"],
      stubsFolder: "JIRA",
      viewName: "My Custom View",
    };
    const base = generateBase(config);
    expect(base).toContain('name: "My Custom View"');
  });

  it("includes all mapped columns in the order list", () => {
    const config: BaseConfig = {
      columns: ["key", "summary", "status", "type", "priority", "assignee", "reporter", "labels", "updated", "url"],
      stubsFolder: "JIRA",
    };
    const base = generateBase(config);
    expect(base).toContain("- file.name");
    expect(base).toContain("- jira_key");
    expect(base).toContain("- jira_summary");
    expect(base).toContain("- jira_status");
    expect(base).toContain("- jira_type");
    expect(base).toContain("- jira_priority");
    expect(base).toContain("- jira_assignee");
    expect(base).toContain("- jira_reporter");
    expect(base).toContain("- jira_labels");
    expect(base).toContain("- jira_updated");
    expect(base).toContain("- jira_url");
  });

  it("skips unmapped columns", () => {
    const config: BaseConfig = {
      columns: ["key", "unknown_column", "summary"],
      stubsFolder: "JIRA",
    };
    const base = generateBase(config);
    expect(base).toContain("- file.name");
    expect(base).toContain("- jira_key");
    expect(base).toContain("- jira_summary");
    expect(base).not.toContain("unknown_column");
  });

  it("always includes file.name as the first order field", () => {
    const config: BaseConfig = {
      columns: ["summary"],
      stubsFolder: "JIRA",
    };
    const base = generateBase(config);
    const lines = base.split("\n");
    const orderIndex = lines.findIndex((l) => l.includes("order:"));
    expect(lines[orderIndex + 1]).toContain("- file.name");
  });

  it("normalizes folder path by removing leading slashes", () => {
    const config: BaseConfig = {
      columns: ["key"],
      stubsFolder: "/JIRA",
    };
    const base = generateBase(config);
    expect(base).toContain('file.inFolder("JIRA")');
  });

  it("normalizes folder path by removing trailing slashes", () => {
    const config: BaseConfig = {
      columns: ["key"],
      stubsFolder: "JIRA/",
    };
    const base = generateBase(config);
    expect(base).toContain('file.inFolder("JIRA")');
  });

  it("normalizes folder path by removing both leading and trailing slashes", () => {
    const config: BaseConfig = {
      columns: ["key"],
      stubsFolder: "/JIRA/",
    };
    const base = generateBase(config);
    expect(base).toContain('file.inFolder("JIRA")');
  });

  it("escapes double quotes in folder path", () => {
    const config: BaseConfig = {
      columns: ["key"],
      stubsFolder: 'My "JIRA" Folder',
    };
    const base = generateBase(config);
    expect(base).toContain('file.inFolder("My \\"JIRA\\" Folder")');
  });

  it("escapes backslashes in folder path", () => {
    const config: BaseConfig = {
      columns: ["key"],
      stubsFolder: "JIRA\\Subfolder",
    };
    const base = generateBase(config);
    expect(base).toContain('file.inFolder("JIRA\\\\Subfolder")');
  });

  it("generates well-formed YAML structure", () => {
    const config: BaseConfig = {
      columns: ["key", "summary", "status"],
      stubsFolder: "JIRA",
    };
    const base = generateBase(config);
    expect(base).toMatch(/^filters:\n  and:\n    - file\.inFolder/);
    expect(base).toContain("views:\n  - type: table");
    expect(base).toContain("order:\n      - file.name");
  });

  it("handles empty columns array by only including file.name", () => {
    const config: BaseConfig = {
      columns: [],
      stubsFolder: "JIRA",
    };
    const base = generateBase(config);
    expect(base).toContain("- file.name");
    expect(base).not.toContain("- jira_");
  });

  it("preserves column order in the output", () => {
    const config: BaseConfig = {
      columns: ["priority", "key", "summary"],
      stubsFolder: "JIRA",
    };
    const base = generateBase(config);
    const lines = base.split("\n");
    const fileNameIndex = lines.findIndex((l) => l.includes("- file.name"));
    const priorityIndex = lines.findIndex((l) => l.includes("- jira_priority"));
    const keyIndex = lines.findIndex((l) => l.includes("- jira_key"));
    const summaryIndex = lines.findIndex((l) => l.includes("- jira_summary"));

    expect(fileNameIndex).toBeLessThan(priorityIndex);
    expect(priorityIndex).toBeLessThan(keyIndex);
    expect(keyIndex).toBeLessThan(summaryIndex);
  });

  it("handles nested folder paths", () => {
    const config: BaseConfig = {
      columns: ["key"],
      stubsFolder: "Projects/JIRA/Active",
    };
    const base = generateBase(config);
    expect(base).toContain('file.inFolder("Projects/JIRA/Active")');
  });

  it("handles folder paths with spaces", () => {
    const config: BaseConfig = {
      columns: ["key"],
      stubsFolder: "My JIRA Issues",
    };
    const base = generateBase(config);
    expect(base).toContain('file.inFolder("My JIRA Issues")');
  });
});
