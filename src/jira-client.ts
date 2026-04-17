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
  | { kind: "parse"; message: string };

export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export interface JiraClient {
  getCurrentUser(): Promise<Result<CurrentUser, JiraError>>;
}

export interface JiraClientOptions {
  baseUrl: string;
  getToken: () => Promise<string | null>;
}

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, "");
}

export function createJiraClient(opts: JiraClientOptions): JiraClient {
  const base = normalizeBase(opts.baseUrl);

  return {
    async getCurrentUser() {
      const token = await opts.getToken();
      if (!token) return { ok: false, error: { kind: "no-token" } };

      let response: Response;
      try {
        response = await fetch(`${base}/rest/api/2/myself`, {
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
  };
}

async function safeText(r: Response): Promise<string> {
  try {
    return await r.text();
  } catch {
    return "";
  }
}
