import { describe, it, expect } from "vitest";
import { renderTemplate, IssueFields, escapeLinkText, escapeLinkUrl } from "./template";
import type { IssueDetails } from "./jira-fields";

const fields: IssueDetails = {
  key: "ABC-123",
  summary: "Fix login",
  status: "In Progress",
  type: "Bug",
  priority: "High",
  assignee: "John Doe",
  reporter: "Jane Smith",
  labels: ["backend", "authentication"],
  updated: "2024-01-15T10:30:00.000Z",
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

  it("supports new IssueDetails tokens: priority, assignee, reporter, updated", () => {
    expect(renderTemplate("{priority}/{assignee}", fields)).toBe(
      "High/John Doe",
    );
    expect(renderTemplate("Reporter: {reporter}", fields)).toBe(
      "Reporter: Jane Smith",
    );
    expect(renderTemplate("Updated: {updated}", fields)).toBe(
      "Updated: 2024-01-15T10:30:00.000Z",
    );
  });

  it("renders labels array as comma-separated string", () => {
    expect(renderTemplate("{key} - {labels}", fields)).toBe(
      "ABC-123 - backend, authentication",
    );
  });

  it("renders empty labels array as empty string", () => {
    const noLabels = { ...fields, labels: [] };
    expect(renderTemplate("{key} - {labels}", noLabels)).toBe(
      "ABC-123 - ",
    );
  });

  it("renders null optional fields as empty string", () => {
    const nullFields: IssueDetails = {
      ...fields,
      priority: null,
      assignee: null,
      reporter: null,
    };
    expect(renderTemplate("[{priority}] {assignee} / {reporter}", nullFields)).toBe(
      "[]  / ",
    );
  });
});

describe("escapeLinkText", () => {
  it("escapes brackets, backslashes, and angle brackets", () => {
    expect(escapeLinkText("Grant role deploy-runner-role-<env> to list [SNS]"))
      .toBe("Grant role deploy-runner-role-\\<env\\> to list \\[SNS\\]");
  });
  it("escapes backslash before other escapes so they're not double-escaped on a second pass", () => {
    const once = escapeLinkText("a\\b");
    expect(once).toBe("a\\\\b");
  });
  it("leaves unaffected text alone", () => {
    expect(escapeLinkText("hello world!")).toBe("hello world!");
  });
});

describe("escapeLinkUrl", () => {
  it("encodes spaces and parens", () => {
    expect(escapeLinkUrl("https://x.com/foo bar (baz)")).toBe(
      "https://x.com/foo%20bar%20%28baz%29",
    );
  });
  it("leaves clean URLs alone", () => {
    expect(escapeLinkUrl("https://jira.me.com/browse/ABC-1")).toBe(
      "https://jira.me.com/browse/ABC-1",
    );
  });
});
