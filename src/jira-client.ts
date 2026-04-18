import { parseIssueDetails, IssueDetails } from "./jira-fields";

export type CurrentUser = {
  displayName: string;
  accountId: string;
  emailAddress?: string;
};

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

export interface HttpResponseLike {
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type HttpRequest = (opts: {
  url: string;
  headers: Record<string, string>;
}) => Promise<HttpResponseLike>;

export interface JiraClient {
  getCurrentUser(): Promise<Result<CurrentUser, JiraError>>;
  getIssueDetails(key: string): Promise<Result<IssueDetails, JiraError>>;
}

export interface JiraClientOptions {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  request?: HttpRequest;
}

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, "");
}

const defaultRequest: HttpRequest = async ({ url, headers }) => {
  const response = await fetch(url, { headers });
  return {
    status: response.status,
    text: () => response.text(),
    json: () => response.json() as Promise<unknown>,
  };
};

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
            status: response.status as 401 | 403,
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

    async getIssueDetails(key) {
      const token = await opts.getToken();
      if (!token) return { ok: false, error: { kind: "no-token" } };

      const fields =
        "summary,status,issuetype,priority,assignee,reporter,labels,updated";
      const url = `${base}/rest/api/2/issue/${encodeURIComponent(key)}?fields=${fields}`;

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

      if (response.status === 404) {
        return { ok: false, error: { kind: "not-found", key } };
      }
      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          error: {
            kind: "auth",
            status: response.status as 401 | 403,
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
        const body = (await response.json()) as unknown;
        const details = parseIssueDetails(body, base);
        if (!details) {
          return {
            ok: false,
            error: { kind: "parse", message: "malformed issue payload" },
          };
        }
        return { ok: true, value: details };
      } catch (e) {
        return { ok: false, error: { kind: "parse", message: (e as Error).message } };
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
