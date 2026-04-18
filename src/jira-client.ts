export type CurrentUser = {
  displayName: string;
  accountId: string;
  emailAddress?: string;
};

export type JiraError =
  | { kind: "no-token" }
  | { kind: "auth"; status: 401 | 403; message: string }
  | { kind: "not-found"; key: string }
  | { kind: "http"; status: number; message: string }
  | { kind: "network"; message: string }
  | { kind: "parse"; message: string };

export type Issue = {
  key: string;
  summary: string;
  status: { name: string; categoryColor: string };
  issueType: { name: string; iconUrl: string };
  priority: { name: string; iconUrl: string } | null;
  assignee: { displayName: string } | null;
  reporter: { displayName: string };
  updated: string;
};

export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export interface JiraClient {
  getCurrentUser(): Promise<Result<CurrentUser, JiraError>>;
  getIssue(key: string): Promise<Result<Issue, JiraError>>;
}

type HttpResponseLike = {
  status: number;
  ok: boolean;
  json(): Promise<unknown>;
  text(): Promise<string>;
};

type RequestFn = (opts: {
  url: string;
  headers: Record<string, string>;
}) => Promise<HttpResponseLike>;

export interface JiraClientOptions {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  request?: RequestFn;
}

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, "");
}

function defaultRequest(opts: { url: string; headers: Record<string, string> }): Promise<HttpResponseLike> {
  return fetch(opts.url, { headers: opts.headers });
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

      if (!response.ok) {
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
        if (typeof body.displayName !== "string" || typeof body.accountId !== "string") {
          return {
            ok: false,
            error: { kind: "parse", message: "missing displayName or accountId" },
          };
        }
        const emailAddress =
          typeof body.emailAddress === "string" ? body.emailAddress : undefined;
        return {
          ok: true,
          value: {
            displayName: body.displayName,
            accountId: body.accountId,
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

      const fields = "summary,status,issuetype,priority,assignee,reporter,updated";
      let response: HttpResponseLike;
      try {
        response = await request({
          url: `${base}/rest/api/2/issue/${encodeURIComponent(key)}?fields=${fields}`,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });
      } catch (e) {
        return { ok: false, error: { kind: "network", message: (e as Error).message } };
      }

      if (response.status === 404) {
        return { ok: false, error: { kind: "not-found", key } };
      }
      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          error: { kind: "auth", status: response.status, message: await safeText(response) },
        };
      }
      if (response.status < 200 || response.status >= 300) {
        return {
          ok: false,
          error: { kind: "http", status: response.status, message: await safeText(response) },
        };
      }

      try {
        const body = (await response.json()) as { key?: unknown; fields?: Record<string, unknown> };
        const f = body.fields;
        if (!f || typeof body.key !== "string") {
          return { ok: false, error: { kind: "parse", message: "missing key or fields" } };
        }
        const summary = typeof f.summary === "string" ? f.summary : null;
        const status = f.status as { name?: string; statusCategory?: { colorName?: string } } | undefined;
        const issuetype = f.issuetype as { name?: string; iconUrl?: string } | undefined;
        const reporter = f.reporter as { displayName?: string } | undefined;
        const updated = typeof f.updated === "string" ? f.updated : null;
        if (
          !summary ||
          !status?.name ||
          !status.statusCategory?.colorName ||
          !issuetype?.name ||
          !issuetype.iconUrl ||
          !reporter?.displayName ||
          !updated
        ) {
          return { ok: false, error: { kind: "parse", message: "missing required fields" } };
        }
        const priorityRaw = f.priority as { name?: string; iconUrl?: string } | null | undefined;
        const assigneeRaw = f.assignee as { displayName?: string } | null | undefined;
        return {
          ok: true,
          value: {
            key: body.key,
            summary,
            status: { name: status.name, categoryColor: status.statusCategory.colorName },
            issueType: { name: issuetype.name, iconUrl: issuetype.iconUrl },
            priority:
              priorityRaw && priorityRaw.name && priorityRaw.iconUrl
                ? { name: priorityRaw.name, iconUrl: priorityRaw.iconUrl }
                : null,
            assignee:
              assigneeRaw && assigneeRaw.displayName
                ? { displayName: assigneeRaw.displayName }
                : null,
            reporter: { displayName: reporter.displayName },
            updated,
          },
        };
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
