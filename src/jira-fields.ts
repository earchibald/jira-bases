export interface IssueDetails {
  key: string;
  summary: string;
  status: string;
  type: string;
  priority: string | null;
  assignee: string | null;
  reporter: string | null;
  labels: string[];
  updated: string;
  url: string;
}

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, "");
}

function stringOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function nestedName(obj: unknown): string | null {
  if (obj && typeof obj === "object" && "name" in obj) {
    const name = (obj as { name?: unknown }).name;
    return typeof name === "string" ? name : null;
  }
  return null;
}

function nestedDisplayName(obj: unknown): string | null {
  if (obj && typeof obj === "object" && "displayName" in obj) {
    const v = (obj as { displayName?: unknown }).displayName;
    return typeof v === "string" ? v : null;
  }
  return null;
}

export function parseIssueDetails(
  raw: unknown,
  baseUrl: string,
): IssueDetails | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const key = stringOrNull(obj.key);
  const fields = obj.fields;
  if (!key || !fields || typeof fields !== "object") return null;
  const f = fields as Record<string, unknown>;

  const summary = stringOrNull(f.summary);
  const status = nestedName(f.status);
  const type = nestedName(f.issuetype);
  const updated = stringOrNull(f.updated);
  if (!summary || !status || !type || !updated) return null;

  const labelsRaw = f.labels;
  const labels = Array.isArray(labelsRaw)
    ? labelsRaw.filter((l): l is string => typeof l === "string")
    : [];

  return {
    key,
    summary,
    status,
    type,
    priority: nestedName(f.priority),
    assignee: nestedDisplayName(f.assignee),
    reporter: nestedDisplayName(f.reporter),
    labels,
    updated,
    url: `${normalizeBase(baseUrl)}/browse/${key}`,
  };
}
