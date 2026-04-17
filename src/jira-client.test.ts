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
