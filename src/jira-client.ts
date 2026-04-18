import { escapeJqlText } from "./issue-suggest-modal";

export type CurrentUser = {
  displayName: string;
  accountId: string;
  emailAddress?: string;
};

export interface Issue {
  key: string;
  summary: string;
  status: string;
  type: string;
}

export interface HttpResponseLike {
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type HttpRequest = (req: {
  url: string;
  headers: Record<string, string>;
}) => Promise<HttpResponseLike>;

export type JiraError =
  | { kind: "no-token" }
  | { kind: "auth"; status: 401 | 403; message: string }
  | { kind: "http"; status: number; message: string }
  | { kind: "network"; message: string }
  | { kind: "parse"; message: string }
  | { kind: "not-found"; key: string };

export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export interface JiraClient {
  getCurrentUser(): Promise<Result<CurrentUser, JiraError>>;
  getIssue(key: string): Promise<Result<Issue, JiraError>>;
  searchIssues(query: string, limit: number): Promise<Result<Issue[], JiraError>>;
}

export interface JiraClientOptions {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  request?: HttpRequest;
}

const defaultRequest: HttpRequest = async ({ url, headers }) => {
  const r = await fetch(url, { headers });
  return {
    status: r.status,
    text: () => r.text(),
    json: () => r.json(),
  };
};

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, "");
}

export function createJiraClient(opts: JiraClientOptions): JiraClient {
  const base = normalizeBase(opts.baseUrl);
  const request = opts.request ?? defaultRequest;

  return {
    async getCurrentUser() {
      const token = await opts.getToken();
      if (!token) return { ok: false, error: { kind: "no-token" } };

      let response: HttpResponseLike;
      try {
        response = await request({
          url: `${base}/rest/api/2/myself`,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });
      } catch (e) {
        return {
          ok: false,
          error: { kind: "network", message: (e as Error).message },
        };
      }

      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          error: {
            kind: "auth",
            status: response.status,
            message: await safeText(response),
          },
        };
      }

      if (response.status < 200 || response.status >= 300) {
        return {
          ok: false,
          error: {
            kind: "http",
            status: response.status,
            message: await safeText(response),
          },
        };
      }

      try {
        const body = (await response.json()) as Record<string, unknown>;
        const accountId =
          typeof body.accountId === "string"
            ? body.accountId
            : typeof body.key === "string"
              ? body.key
              : typeof body.name === "string"
                ? body.name
                : undefined;
        if (typeof body.displayName !== "string" || !accountId) {
          return {
            ok: false,
            error: { kind: "parse", message: "missing displayName or account identifier" },
          };
        }
        const emailAddress =
          typeof body.emailAddress === "string" ? body.emailAddress : undefined;
        return {
          ok: true,
          value: {
            displayName: body.displayName,
            accountId,
            emailAddress,
          },
        };
      } catch (e) {
        return { ok: false, error: { kind: "parse", message: (e as Error).message } };
      }
    },
    async getIssue(key) {
      const token = await opts.getToken();
      if (!token) return { ok: false, error: { kind: "no-token" } };

      let response: HttpResponseLike;
      try {
        response = await request({
          url: `${base}/rest/api/2/issue/${encodeURIComponent(
            key,
          )}?fields=summary,status,issuetype`,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });
      } catch (e) {
        return {
          ok: false,
          error: { kind: "network", message: (e as Error).message },
        };
      }

      if (response.status === 404) {
        return { ok: false, error: { kind: "not-found", key } };
      }
      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          error: {
            kind: "auth",
            status: response.status,
            message: await safeText(response),
          },
        };
      }
      if (response.status < 200 || response.status >= 300) {
        return {
          ok: false,
          error: {
            kind: "http",
            status: response.status,
            message: await safeText(response),
          },
        };
      }

      try {
        const body = (await response.json()) as {
          key?: string;
          fields?: {
            summary?: string;
            status?: { name?: string };
            issuetype?: { name?: string };
          };
        };
        const issueKey = body.key ?? key;
        const summary = body.fields?.summary;
        const status = body.fields?.status?.name ?? "";
        const type = body.fields?.issuetype?.name ?? "";
        if (typeof summary !== "string") {
          return {
            ok: false,
            error: { kind: "parse", message: "missing summary" },
          };
        }
        return {
          ok: true,
          value: { key: issueKey, summary, status, type },
        };
      } catch (e) {
        return {
          ok: false,
          error: { kind: "parse", message: (e as Error).message },
        };
      }
    },
    async searchIssues(query, limit) {
      const token = await opts.getToken();
      if (!token) return { ok: false, error: { kind: "no-token" } };

      const jql = `text ~ "${escapeJqlText(query)}" ORDER BY updated DESC`;
      const url =
        `${base}/rest/api/2/search` +
        `?jql=${encodeURIComponent(jql)}` +
        `&fields=${encodeURIComponent("summary,status,issuetype")}` +
        `&maxResults=${limit}`;

      let response: HttpResponseLike;
      try {
        response = await request({
          url,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });
      } catch (e) {
        return {
          ok: false,
          error: { kind: "network", message: (e as Error).message },
        };
      }

      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          error: {
            kind: "auth",
            status: response.status,
            message: await safeText(response),
          },
        };
      }
      if (response.status < 200 || response.status >= 300) {
        return {
          ok: false,
          error: {
            kind: "http",
            status: response.status,
            message: await safeText(response),
          },
        };
      }

      try {
        const body = (await response.json()) as {
          issues?: Array<{
            key?: string;
            fields?: {
              summary?: string;
              status?: { name?: string };
              issuetype?: { name?: string };
            };
          }>;
        };
        const issues: Issue[] = (body.issues ?? []).flatMap((raw) => {
          if (typeof raw.key !== "string") return [];
          const summary = raw.fields?.summary;
          if (typeof summary !== "string") return [];
          return [{
            key: raw.key,
            summary,
            status: raw.fields?.status?.name ?? "",
            type: raw.fields?.issuetype?.name ?? "",
          }];
        });
        return { ok: true, value: issues };
      } catch (e) {
        return {
          ok: false,
          error: { kind: "parse", message: (e as Error).message },
        };
      }
    },
  };
}

async function safeText(r: HttpResponseLike): Promise<string> {
  try {
    return await r.text();
  } catch {
    return "";
  }
}
