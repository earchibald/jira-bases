import { describe, it, expect } from "vitest";
import { parseIssueDetails } from "./jira-fields";

const BASE = "https://jira.me.com";

const full = {
  key: "ABC-1",
  fields: {
    summary: "Fix login",
    status: { name: "In Progress" },
    issuetype: { name: "Bug" },
    priority: { name: "High" },
    assignee: { displayName: "Eugene" },
    reporter: { displayName: "Colleague" },
    labels: ["frontend", "auth"],
    updated: "2026-04-15T09:22:00.000+0000",
  },
};

describe("parseIssueDetails", () => {
  it("parses a full payload", () => {
    expect(parseIssueDetails(full, BASE)).toEqual({
      key: "ABC-1",
      summary: "Fix login",
      status: "In Progress",
      type: "Bug",
      priority: "High",
      assignee: "Eugene",
      reporter: "Colleague",
      labels: ["frontend", "auth"],
      updated: "2026-04-15T09:22:00.000+0000",
      url: "https://jira.me.com/browse/ABC-1",
    });
  });

  it("nulls missing optional fields", () => {
    const payload = JSON.parse(JSON.stringify(full));
    delete payload.fields.priority;
    delete payload.fields.assignee;
    delete payload.fields.reporter;
    payload.fields.labels = [];
    const result = parseIssueDetails(payload, BASE);
    expect(result).not.toBeNull();
    expect(result!.priority).toBeNull();
    expect(result!.assignee).toBeNull();
    expect(result!.reporter).toBeNull();
    expect(result!.labels).toEqual([]);
  });

  it("returns null when required fields missing", () => {
    const payload = JSON.parse(JSON.stringify(full));
    delete payload.fields.summary;
    expect(parseIssueDetails(payload, BASE)).toBeNull();
  });

  it("strips trailing slash in the derived URL", () => {
    const result = parseIssueDetails(full, `${BASE}/`);
    expect(result!.url).toBe(`${BASE}/browse/ABC-1`);
  });

  it("returns null when the key is not a string", () => {
    const payload = { ...full, key: 123 };
    expect(parseIssueDetails(payload, BASE)).toBeNull();
  });
});
