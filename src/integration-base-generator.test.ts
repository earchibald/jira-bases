import { describe, it, expect } from "vitest";
import { generateBase, type BaseConfig } from "./base-generator";
import { VaultAdapter } from "./stub-writer";

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

async function runEndToEndFlow(
  vault: VaultAdapter,
  columns: string[],
  stubsFolder: string,
  viewName?: string,
): Promise<{ success: boolean; error?: string }> {
  if (columns.length === 0) {
    return { success: false, error: "Select at least one column." };
  }
  const baseContent = generateBase({
    columns,
    stubsFolder,
    viewName,
  });
  const normalizedFolder = stubsFolder.replace(/\/+$/, "");
  const baseFilePath = `${normalizedFolder}/JIRA Issues.base`;
  try {
    await vault.write(baseFilePath, baseContent);
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

describe("integration: base generator end-to-end", () => {
  it("creates base file with selected columns", async () => {
    const vault = inMemoryVault();
    const result = await runEndToEndFlow(vault, ["key", "summary", "status"], "JIRA");

    expect(result.success).toBe(true);
    expect(vault.files.has("JIRA/JIRA Issues.base")).toBe(true);

    const baseContent = vault.files.get("JIRA/JIRA Issues.base")!;
    expect(baseContent).toContain('file.inFolder("JIRA")');
    expect(baseContent).toContain('name: "All issues"');
    expect(baseContent).toContain("- file.name");
    expect(baseContent).toContain("- jira_key");
    expect(baseContent).toContain("- jira_summary");
    expect(baseContent).toContain("- jira_status");
  });

  it("fails when no columns are selected", async () => {
    const vault = inMemoryVault();
    const result = await runEndToEndFlow(vault, [], "JIRA");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Select at least one column.");
    expect(vault.files.has("JIRA/JIRA Issues.base")).toBe(false);
  });

  it("overwrites existing base file", async () => {
    const vault = inMemoryVault({
      "JIRA/JIRA Issues.base": "old content",
    });
    const result = await runEndToEndFlow(vault, ["key", "summary"], "JIRA");

    expect(result.success).toBe(true);
    const baseContent = vault.files.get("JIRA/JIRA Issues.base")!;
    expect(baseContent).not.toContain("old content");
    expect(baseContent).toContain("- jira_key");
    expect(baseContent).toContain("- jira_summary");
  });

  it("uses custom view name when provided", async () => {
    const vault = inMemoryVault();
    const result = await runEndToEndFlow(vault, ["key"], "JIRA", "My Custom View");

    expect(result.success).toBe(true);
    const baseContent = vault.files.get("JIRA/JIRA Issues.base")!;
    expect(baseContent).toContain('name: "My Custom View"');
  });

  it("handles nested folder paths", async () => {
    const vault = inMemoryVault();
    const result = await runEndToEndFlow(vault, ["key", "summary"], "Projects/JIRA/Active");

    expect(result.success).toBe(true);
    expect(vault.files.has("Projects/JIRA/Active/JIRA Issues.base")).toBe(true);

    const baseContent = vault.files.get("Projects/JIRA/Active/JIRA Issues.base")!;
    expect(baseContent).toContain('file.inFolder("Projects/JIRA/Active")');
  });

  it("normalizes folder path with trailing slash", async () => {
    const vault = inMemoryVault();
    const result = await runEndToEndFlow(vault, ["key"], "JIRA/");

    expect(result.success).toBe(true);
    expect(vault.files.has("JIRA/JIRA Issues.base")).toBe(true);
  });

  it("creates base file with all available columns", async () => {
    const vault = inMemoryVault();
    const allColumns = ["key", "summary", "status", "type", "priority", "assignee", "reporter", "labels", "updated"];
    const result = await runEndToEndFlow(vault, allColumns, "JIRA");

    expect(result.success).toBe(true);
    const baseContent = vault.files.get("JIRA/JIRA Issues.base")!;
    expect(baseContent).toContain("- file.name");
    expect(baseContent).toContain("- jira_key");
    expect(baseContent).toContain("- jira_summary");
    expect(baseContent).toContain("- jira_status");
    expect(baseContent).toContain("- jira_type");
    expect(baseContent).toContain("- jira_priority");
    expect(baseContent).toContain("- jira_assignee");
    expect(baseContent).toContain("- jira_reporter");
    expect(baseContent).toContain("- jira_labels");
    expect(baseContent).toContain("- jira_updated");
  });

  it("maintains column order in generated base file", async () => {
    const vault = inMemoryVault();
    const result = await runEndToEndFlow(vault, ["priority", "key", "summary"], "JIRA");

    expect(result.success).toBe(true);
    const baseContent = vault.files.get("JIRA/JIRA Issues.base")!;
    const lines = baseContent.split("\n");

    const fileNameIndex = lines.findIndex((l) => l.includes("- file.name"));
    const priorityIndex = lines.findIndex((l) => l.includes("- jira_priority"));
    const keyIndex = lines.findIndex((l) => l.includes("- jira_key"));
    const summaryIndex = lines.findIndex((l) => l.includes("- jira_summary"));

    expect(fileNameIndex).toBeLessThan(priorityIndex);
    expect(priorityIndex).toBeLessThan(keyIndex);
    expect(keyIndex).toBeLessThan(summaryIndex);
  });

  it("handles folder paths with special characters", async () => {
    const vault = inMemoryVault();
    const result = await runEndToEndFlow(vault, ["key"], 'My "JIRA" Folder');

    expect(result.success).toBe(true);
    expect(vault.files.has('My "JIRA" Folder/JIRA Issues.base')).toBe(true);

    const baseContent = vault.files.get('My "JIRA" Folder/JIRA Issues.base')!;
    expect(baseContent).toContain('file.inFolder("My \\"JIRA\\" Folder")');
  });

  it("generates valid YAML structure", async () => {
    const vault = inMemoryVault();
    const result = await runEndToEndFlow(vault, ["key", "summary", "status"], "JIRA");

    expect(result.success).toBe(true);
    const baseContent = vault.files.get("JIRA/JIRA Issues.base")!;

    expect(baseContent).toMatch(/^filters:\n  and:\n    - file\.inFolder/);
    expect(baseContent).toContain("views:\n  - type: table");
    expect(baseContent).toContain("order:\n      - file.name");
  });

  it("handles folder paths with spaces", async () => {
    const vault = inMemoryVault();
    const result = await runEndToEndFlow(vault, ["key", "summary"], "My JIRA Issues");

    expect(result.success).toBe(true);
    expect(vault.files.has("My JIRA Issues/JIRA Issues.base")).toBe(true);

    const baseContent = vault.files.get("My JIRA Issues/JIRA Issues.base")!;
    expect(baseContent).toContain('file.inFolder("My JIRA Issues")');
  });

  it("includes url column when selected", async () => {
    const vault = inMemoryVault();
    const result = await runEndToEndFlow(vault, ["key", "url"], "JIRA");

    expect(result.success).toBe(true);
    const baseContent = vault.files.get("JIRA/JIRA Issues.base")!;
    expect(baseContent).toContain("- jira_url");
  });

  it("only includes file.name when single column is selected", async () => {
    const vault = inMemoryVault();
    const result = await runEndToEndFlow(vault, ["key"], "JIRA");

    expect(result.success).toBe(true);
    const baseContent = vault.files.get("JIRA/JIRA Issues.base")!;
    expect(baseContent).toContain("- file.name");
    expect(baseContent).toContain("- jira_key");
    expect(baseContent).not.toContain("- jira_summary");
    expect(baseContent).not.toContain("- jira_status");
  });
});
