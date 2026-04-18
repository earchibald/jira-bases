import { describe, it, expect } from "vitest";
import { renderTemplate, IssueFields } from "./template";

const fields: IssueFields = {
  key: "ABC-123",
  summary: "Fix login",
  status: "In Progress",
  type: "Bug",
  url: "https://jira.me.com/browse/ABC-123",
};

describe("renderTemplate", () => {
  it("substitutes all known tokens", () => {
    expect(
      renderTemplate("[{key} {summary}]({url})", fields),
    ).toBe("[ABC-123 Fix login](https://jira.me.com/browse/ABC-123)");
  });

  it("supports status and type tokens", () => {
    expect(renderTemplate("{type}/{status}: {key}", fields)).toBe(
      "Bug/In Progress: ABC-123",
    );
  });

  it("repeats a token as many times as it appears", () => {
    expect(renderTemplate("{key} {key}", fields)).toBe("ABC-123 ABC-123");
  });

  it("leaves unknown tokens as-is", () => {
    expect(renderTemplate("{key} {bogus}", fields)).toBe("ABC-123 {bogus}");
  });

  it("renders missing fields as empty string", () => {
    const partial = { ...fields, status: "" };
    expect(renderTemplate("[{status}] {key}", partial)).toBe("[] ABC-123");
  });

  it("handles an empty template", () => {
    expect(renderTemplate("", fields)).toBe("");
  });
});
