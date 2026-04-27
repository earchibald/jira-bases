import { describe, it, expect } from "vitest";
import { nextAvailablePath, splitExtension, type ExistsAdapter } from "./path-utils";

function fakeVault(existing: Set<string>): ExistsAdapter {
  return { async exists(p) { return existing.has(p); } };
}

describe("splitExtension", () => {
  it("splits at the last dot", () => {
    expect(splitExtension("JIRA Issues.base")).toEqual({
      stem: "JIRA Issues",
      ext: ".base",
    });
  });

  it("treats files without an extension as stem-only", () => {
    expect(splitExtension("README")).toEqual({ stem: "README", ext: "" });
  });

  it("does not split on dots in directory names", () => {
    expect(splitExtension("dir.name/file")).toEqual({
      stem: "dir.name/file",
      ext: "",
    });
  });

  it("preserves directory paths in stem", () => {
    expect(splitExtension("a/b/c.ext")).toEqual({ stem: "a/b/c", ext: ".ext" });
  });

  it("treats hidden dotfiles as having no extension", () => {
    expect(splitExtension(".gitignore")).toEqual({
      stem: ".gitignore",
      ext: "",
    });
  });
});

describe("nextAvailablePath", () => {
  it("returns the original path when nothing collides", async () => {
    const vault = fakeVault(new Set());
    expect(await nextAvailablePath(vault, "JIRA/JIRA Issues.base")).toBe(
      "JIRA/JIRA Issues.base",
    );
  });

  it("walks (1), (2), … until it finds an unused name", async () => {
    const vault = fakeVault(
      new Set([
        "JIRA/JIRA Issues.base",
        "JIRA/JIRA Issues (1).base",
        "JIRA/JIRA Issues (2).base",
      ]),
    );
    expect(await nextAvailablePath(vault, "JIRA/JIRA Issues.base")).toBe(
      "JIRA/JIRA Issues (3).base",
    );
  });

  it("returns (1) when only the original collides", async () => {
    const vault = fakeVault(new Set(["JIRA Issues.base"]));
    expect(await nextAvailablePath(vault, "JIRA Issues.base")).toBe(
      "JIRA Issues (1).base",
    );
  });

  it("preserves the extension in the disambiguated filename", async () => {
    const vault = fakeVault(new Set(["x/y.base"]));
    expect(await nextAvailablePath(vault, "x/y.base")).toBe("x/y (1).base");
  });

  it("handles extensionless paths", async () => {
    const vault = fakeVault(new Set(["dir/README", "dir/README (1)"]));
    expect(await nextAvailablePath(vault, "dir/README")).toBe(
      "dir/README (2)",
    );
  });

  it("throws after the disambiguation cap to avoid infinite loops", async () => {
    const vault: ExistsAdapter = { async exists() { return true; } };
    await expect(nextAvailablePath(vault, "x.base")).rejects.toThrow(
      /Could not find an available filename/,
    );
  });
});
