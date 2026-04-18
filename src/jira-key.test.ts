import { describe, it, expect } from "vitest";
import { parseKeyOrUrl, extractKeyFromHref } from "./jira-key";

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
