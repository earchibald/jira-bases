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

describe("JiraClient.addComment", () => {
  it("returns ok on successful POST (201)", async () => {
    server.use(
      http.post(`${BASE}/rest/api/2/issue/ABC-123/comment`, async ({ request }) => {
        expect(request.headers.get("Authorization")).toBe("Bearer tok-abc");
        expect(request.headers.get("Accept")).toBe("application/json");
        expect(request.headers.get("Content-Type")).toBe("application/json");
        const body = await request.json();
        expect(body).toEqual({ body: "This is a comment" });
        return HttpResponse.json({ id: "10001" }, { status: 201 });
      }),
    );
    const result = await client("tok-abc").addComment("ABC-123", "This is a comment");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeUndefined();
    }
  });

  it("returns no-token error when getToken yields null", async () => {
    const result = await client(null).addComment("ABC-123", "comment");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("no-token");
  });

  it("returns auth error on 401", async () => {
    server.use(
      http.post(`${BASE}/rest/api/2/issue/ABC-123/comment`, () =>
        HttpResponse.text("unauthorized", { status: 401 }),
      ),
    );
    const result = await client("bad").addComment("ABC-123", "comment");
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "auth") {
      expect(result.error.status).toBe(401);
    } else {
      throw new Error("expected auth/401");
    }
  });

  it("returns not-found error on 404", async () => {
    server.use(
      http.post(`${BASE}/rest/api/2/issue/NOPE-1/comment`, () =>
        HttpResponse.text("missing", { status: 404 }),
      ),
    );
    const result = await client("tok").addComment("NOPE-1", "comment");
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "not-found") {
      expect(result.error.key).toBe("NOPE-1");
    } else {
      throw new Error("expected not-found");
    }
  });

  it("returns network error when fetch throws", async () => {
    server.use(
      http.post(`${BASE}/rest/api/2/issue/ABC-123/comment`, () =>
        HttpResponse.error(),
      ),
    );
    const result = await client("tok").addComment("ABC-123", "comment");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("network");
  });

  it("returns http error on 500", async () => {
    server.use(
      http.post(`${BASE}/rest/api/2/issue/ABC-123/comment`, () =>
        HttpResponse.text("boom", { status: 500 }),
      ),
    );
    const result = await client("tok").addComment("ABC-123", "comment");
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "http") {
      expect(result.error.status).toBe(500);
    } else {
      throw new Error("expected http/500");
    }
  });
});
