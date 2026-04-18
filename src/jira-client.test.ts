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
  it("returns ok with issue fields on 200", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/issue/ABC-123`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("fields")).toBe(
          "summary,status,issuetype",
        );
        return HttpResponse.json({
          key: "ABC-123",
          fields: {
            summary: "Fix login",
            status: { name: "In Progress" },
            issuetype: { name: "Bug" },
          },
        });
      }),
    );
    const result = await client("tok").getIssue("ABC-123");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        key: "ABC-123",
        summary: "Fix login",
        status: "In Progress",
        type: "Bug",
      });
    }
  });

  it("returns not-found error on 404", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/issue/NOPE-1`, () =>
        HttpResponse.text("missing", { status: 404 }),
      ),
    );
    const result = await client("tok").getIssue("NOPE-1");
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "not-found") {
      expect(result.error.key).toBe("NOPE-1");
    } else {
      throw new Error("expected not-found");
    }
  });

  it("returns auth error on 401", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/issue/ABC-1`, () =>
        HttpResponse.text("nope", { status: 401 }),
      ),
    );
    const result = await client("tok").getIssue("ABC-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("auth");
  });

  it("returns parse error when summary is missing", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/issue/ABC-2`, () =>
        HttpResponse.json({ key: "ABC-2", fields: {} }),
      ),
    );
    const result = await client("tok").getIssue("ABC-2");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("parse");
  });
});

describe("JiraClient.searchIssues", () => {
  it("returns ok with mapped issues on 200", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/search`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("jql")).toBe(
          'text ~ "fix login" ORDER BY updated DESC',
        );
        expect(url.searchParams.get("fields")).toBe(
          "summary,status,issuetype",
        );
        expect(url.searchParams.get("maxResults")).toBe("20");
        return HttpResponse.json({
          issues: [
            {
              key: "ABC-1",
              fields: {
                summary: "Fix login",
                status: { name: "Open" },
                issuetype: { name: "Bug" },
              },
            },
          ],
        });
      }),
    );
    const result = await client("tok").searchIssues("fix login", 20);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([
        { key: "ABC-1", summary: "Fix login", status: "Open", type: "Bug" },
      ]);
    }
  });

  it("returns ok with empty list when no issues", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/search`, () =>
        HttpResponse.json({ issues: [] }),
      ),
    );
    const result = await client("tok").searchIssues("none", 20);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it("returns http error on 400", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/search`, () =>
        HttpResponse.text("bad jql", { status: 400 }),
      ),
    );
    const result = await client("tok").searchIssues("x", 20);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "http") {
      expect(result.error.status).toBe(400);
    } else {
      throw new Error("expected http/400");
    }
  });

  it("escapes quotes and backslashes in the JQL", async () => {
    server.use(
      http.get(`${BASE}/rest/api/2/search`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("jql")).toBe(
          'text ~ "he said \\"hi\\" \\\\ bye" ORDER BY updated DESC',
        );
        return HttpResponse.json({ issues: [] });
      }),
    );
    const result = await client("tok").searchIssues(
      'he said "hi" \\ bye',
      20,
    );
    expect(result.ok).toBe(true);
  });
});
