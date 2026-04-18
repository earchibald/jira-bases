import { describe, it, expect } from "vitest";
import { isIssueKey, escapeJqlText } from "./issue-suggest-helpers";

describe("isIssueKey", () => {
  it("accepts standard keys", () => {
    expect(isIssueKey("ABC-123")).toBe(true);
    expect(isIssueKey("abc-1")).toBe(true);
    expect(isIssueKey("AB2-99")).toBe(true);
  });

  it("rejects non-keys", () => {
    expect(isIssueKey("fix login")).toBe(false);
    expect(isIssueKey("ABC")).toBe(false);
    expect(isIssueKey("123")).toBe(false);
    expect(isIssueKey("ABC-")).toBe(false);
    expect(isIssueKey("ABC 123")).toBe(false);
  });
});

describe("escapeJqlText", () => {
  it("escapes backslashes and double quotes", () => {
    expect(escapeJqlText(`he said "hi" \\ there`)).toBe(
      `he said \\"hi\\" \\\\ there`,
    );
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeJqlText("fix login")).toBe("fix login");
  });
});
