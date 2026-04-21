import { describe, it, expect } from "vitest";
import {
  parseKeyOrUrl,
  extractKeyFromHref,
  findKeyInText,
  findKeyAtCol,
  findLinkAtCol,
  parseMarkdownLink,
} from "./jira-key";

describe("parseKeyOrUrl", () => {
  it("accepts a bare key", () => {
    expect(parseKeyOrUrl("ABC-123", "https://jira.me.com")).toBe("ABC-123");
  });
  it("accepts a key with surrounding whitespace", () => {
    expect(parseKeyOrUrl("  ABC-123  ", "https://jira.me.com")).toBe("ABC-123");
  });
  it("extracts a key from a browse URL on the configured host", () => {
    expect(
      parseKeyOrUrl("https://jira.me.com/browse/ABC-123", "https://jira.me.com"),
    ).toBe("ABC-123");
  });
  it("extracts a key from a browse URL with query/fragment", () => {
    expect(
      parseKeyOrUrl("https://jira.me.com/browse/ABC-123?focusedCommentId=1", "https://jira.me.com"),
    ).toBe("ABC-123");
  });
  it("rejects a URL on a different host", () => {
    expect(parseKeyOrUrl("https://other.com/browse/ABC-123", "https://jira.me.com")).toBeNull();
  });
  it("rejects garbage input", () => {
    expect(parseKeyOrUrl("hello world", "https://jira.me.com")).toBeNull();
    expect(parseKeyOrUrl("", "https://jira.me.com")).toBeNull();
    expect(parseKeyOrUrl("abc-123", "https://jira.me.com")).toBeNull(); // lowercase project
  });
  it("tolerates trailing slash on baseUrl", () => {
    expect(
      parseKeyOrUrl("https://jira.me.com/browse/ABC-1", "https://jira.me.com/"),
    ).toBe("ABC-1");
  });
});

describe("extractKeyFromHref", () => {
  it("returns key for matching href", () => {
    expect(
      extractKeyFromHref("https://jira.me.com/browse/PROJ-42", "https://jira.me.com"),
    ).toBe("PROJ-42");
  });
  it("returns null for non-matching host", () => {
    expect(
      extractKeyFromHref("https://elsewhere.com/browse/PROJ-42", "https://jira.me.com"),
    ).toBeNull();
  });
  it("returns null for matching host but non-browse path", () => {
    expect(
      extractKeyFromHref("https://jira.me.com/issues/PROJ-42", "https://jira.me.com"),
    ).toBeNull();
  });
});

describe("findKeyInText", () => {
  it("finds the first key in arbitrary text", () => {
    expect(findKeyInText("see ABC-123 and DEF-9 for details")).toBe("ABC-123");
  });
  it("returns null when no key", () => {
    expect(findKeyInText("nothing here")).toBeNull();
  });
});

describe("findKeyAtCol", () => {
  const line = "fix SRE-1235 today";
  // positions:    0123456789012345678
  //                   ^ start at 4    ^ end at 12

  it("matches when col is at the start of the key", () => {
    expect(findKeyAtCol(line, 4)).toEqual({ key: "SRE-1235", start: 4, end: 12 });
  });
  it("matches when col is inside the key", () => {
    expect(findKeyAtCol(line, 7)).toEqual({ key: "SRE-1235", start: 4, end: 12 });
  });
  it("matches when col is at the end of the key", () => {
    expect(findKeyAtCol(line, 12)).toEqual({ key: "SRE-1235", start: 4, end: 12 });
  });
  it("returns null when col is outside the key", () => {
    expect(findKeyAtCol(line, 2)).toBeNull();
    expect(findKeyAtCol(line, 13)).toBeNull();
  });
  it("returns null on lines without a key", () => {
    expect(findKeyAtCol("just text", 3)).toBeNull();
  });
  it("picks the key under the cursor when multiple are on the line", () => {
    const l = "ABC-1 and DEF-22 here";
    expect(findKeyAtCol(l, 12)).toEqual({ key: "DEF-22", start: 10, end: 16 });
  });
});

describe("parseMarkdownLink", () => {
  it("parses a well-formed link", () => {
    expect(
      parseMarkdownLink("[SRE-1234](https://jira.me.com/browse/SRE-1234)"),
    ).toEqual({ text: "SRE-1234", url: "https://jira.me.com/browse/SRE-1234" });
  });
  it("trims surrounding whitespace", () => {
    expect(parseMarkdownLink("  [x](https://y)  ")).toEqual({
      text: "x",
      url: "https://y",
    });
  });
  it("returns null for bare text", () => {
    expect(parseMarkdownLink("SRE-1234")).toBeNull();
  });
  it("returns null when link isn't the whole string", () => {
    expect(parseMarkdownLink("see [x](y) here")).toBeNull();
  });
});

describe("findLinkAtCol", () => {
  const line = "text [SRE-1](https://jira.me.com/browse/SRE-1) more";
  //            0123456789012345678901234567890123456789012345678901
  //                 ^5                                          ^46

  it("matches when col is inside the link", () => {
    const hit = findLinkAtCol(line, 10);
    expect(hit).toEqual({
      text: "SRE-1",
      url: "https://jira.me.com/browse/SRE-1",
      start: 5,
      end: 46,
    });
  });
  it("matches at start and end of link", () => {
    expect(findLinkAtCol(line, 5)?.start).toBe(5);
    expect(findLinkAtCol(line, 46)?.end).toBe(46);
  });
  it("returns null when col is outside any link", () => {
    expect(findLinkAtCol(line, 2)).toBeNull();
    expect(findLinkAtCol(line, 48)).toBeNull();
  });
  it("returns null when line has no link", () => {
    expect(findLinkAtCol("just SRE-1 bare", 7)).toBeNull();
  });
  it("picks the link under the cursor when multiple are on the line", () => {
    const l = "[a](u1) [b](u2)";
    const hit = findLinkAtCol(l, 10);
    expect(hit).toEqual({ text: "b", url: "u2", start: 8, end: 15 });
  });
});
