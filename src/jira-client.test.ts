import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { createJiraClient } from "./jira-client";

const BASE = "https://jira.me.com";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function client(token: string | null) {
  return createJiraClient({ baseUrl: BASE, getToken: async () => token });
}

describe("JiraClient.getCurrentUser", () => {
  it("returns ok with user when auth succeeds", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/myself`, ({ request }) => {
        expect(request.headers.get("Authorization")).toBe("Bearer tok-abc");
        expect(request.headers.get("Accept")).toBe("application/json");
        return HttpResponse.json({
          displayName: "Eugene",
          accountId: "u-1",
          emailAddress: "e@me.com",
        });
      }),
    );
    const result = await client("tok-abc").getCurrentUser();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        displayName: "Eugene",
        accountId: "u-1",
        emailAddress: "e@me.com",
      });
    }
  });

  it("returns no-token error when getToken yields null", async () => {
    const result = await client(null).getCurrentUser();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("no-token");
  });

  it("returns auth error on 401", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/myself`, () =>
        HttpResponse.text("unauthorized", { status: 401 }),
      ),
    );
    const result = await client("bad").getCurrentUser();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("auth");
      if (result.error.kind === "auth") expect(result.error.status).toBe(401);
    }
  });

  it("returns auth error on 403", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/myself`, () =>
        HttpResponse.text("forbidden", { status: 403 }),
      ),
    );
    const result = await client("tok").getCurrentUser();
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "auth") {
      expect(result.error.status).toBe(403);
    } else {
      throw new Error("expected auth/403");
    }
  });

  it("returns http error on 500", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/myself`, () =>
        HttpResponse.text("boom", { status: 500 }),
      ),
    );
    const result = await client("tok").getCurrentUser();
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "http") {
      expect(result.error.status).toBe(500);
    } else {
      throw new Error("expected http/500");
    }
  });

  it("returns parse error on malformed JSON", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/myself`, () =>
        new HttpResponse("not json", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const result = await client("tok").getCurrentUser();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("parse");
  });

  it("returns parse error when required fields are missing", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/myself`, () =>
        HttpResponse.json({ displayName: "E" }),
      ),
    );
    const result = await client("tok").getCurrentUser();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("parse");
  });

  it("returns network error when fetch throws", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/myself`, () => HttpResponse.error()),
    );
    const result = await client("tok").getCurrentUser();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("network");
  });

  it("strips trailing slash from baseUrl", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/myself`, () =>
        HttpResponse.json({ displayName: "E", accountId: "u" }),
      ),
    );
    const c = createJiraClient({
      baseUrl: `${BASE}/`,
      getToken: async () => "tok",
    });
    const result = await c.getCurrentUser();
    expect(result.ok).toBe(true);
  });
});

describe("JiraClient.getIssue", () => {
  it("returns ok with mapped issue on 200", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/issue/ABC-123`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("fields")).toBe(
          "summary,status,issuetype,priority,assignee,reporter,updated",
        );
        expect(request.headers.get("Authorization")).toBe("Bearer tok-abc");
        return HttpResponse.json({
          key: "ABC-123",
          fields: {
            summary: "A sample issue",
            status: { name: "In Progress", statusCategory: { colorName: "yellow" } },
            issuetype: { name: "Task", iconUrl: "https://jira.me.com/it.png" },
            priority: { name: "High", iconUrl: "https://jira.me.com/p.png" },
            assignee: { displayName: "Alice" },
            reporter: { displayName: "Bob" },
            updated: "2026-04-15T10:00:00.000+0000",
          },
        });
      }),
    );
    const result = await client("tok-abc").getIssue("ABC-123");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        key: "ABC-123",
        summary: "A sample issue",
        status: { name: "In Progress", categoryColor: "yellow" },
        issueType: { name: "Task", iconUrl: "https://jira.me.com/it.png" },
        priority: { name: "High", iconUrl: "https://jira.me.com/p.png" },
        assignee: { displayName: "Alice" },
        reporter: { displayName: "Bob" },
        updated: "2026-04-15T10:00:00.000+0000",
      });
    }
  });

  it("maps null assignee and missing priority", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/issue/ABC-1`, () =>
        HttpResponse.json({
          key: "ABC-1",
          fields: {
            summary: "S",
            status: { name: "Open", statusCategory: { colorName: "blue-gray" } },
            issuetype: { name: "Bug", iconUrl: "u" },
            priority: null,
            assignee: null,
            reporter: { displayName: "Bob" },
            updated: "2026-04-15T10:00:00.000+0000",
          },
        }),
      ),
    );
    const result = await client("tok-abc").getIssue("ABC-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.assignee).toBeNull();
      expect(result.value.priority).toBeNull();
    }
  });

  it("returns not-found on 404", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/issue/XYZ-9`, () =>
        new HttpResponse(null, { status: 404 }),
      ),
    );
    const result = await client("tok-abc").getIssue("XYZ-9");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual({ kind: "not-found", key: "XYZ-9" });
  });

  it("returns auth on 401", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/issue/ABC-1`, () =>
        new HttpResponse("nope", { status: 401 }),
      ),
    );
    const result = await client("tok-abc").getIssue("ABC-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("auth");
  });

  it("returns network on fetch throw", async () => {
    const c = createJiraClient({
      baseUrl: BASE,
      getToken: async () => "tok",
      request: async () => {
        throw new Error("offline");
      },
    });
    const result = await c.getIssue("ABC-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual({ kind: "network", message: "offline" });
  });

  it("returns parse on malformed body", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/issue/ABC-1`, () =>
        HttpResponse.json({ key: "ABC-1" /* no fields */ }),
      ),
    );
    const result = await client("tok-abc").getIssue("ABC-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("parse");
  });

  it("returns no-token when token missing", async () => {
    const result = await client(null).getIssue("ABC-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual({ kind: "no-token" });
  });
});
