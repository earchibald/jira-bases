import type { Issue } from "./jira-client";

const ISSUE_KEY_RE = /^[A-Za-z][A-Za-z0-9]+-\d+$/;
const JQL_FIELD_RE =
  /\b[A-Za-z][A-Za-z0-9_.-]*\s*(?:=|!=|~|!~|>=|<=|>|<)\s*(?:"[^"]*"|'[^']*'|[A-Za-z0-9_.-]+)/i;
const JQL_CLAUSE_RE =
  /\b(?:ORDER\s+BY|NOT\s+IN|IN|IS(?:\s+NOT)?|WAS|CHANGED)\b/i;
const ORDER_BY_RE = /\border\s+by\b/i;
const JQL_KEYWORDS = new Set([
  "and",
  "or",
  "not",
  "in",
  "is",
  "was",
  "changed",
  "order",
  "by",
  "asc",
  "desc",
  "text",
  "summary",
  "status",
  "project",
  "assignee",
  "reporter",
  "labels",
  "label",
  "priority",
  "issuetype",
  "type",
  "created",
  "updated",
  "empty",
  "null",
]);

export interface SearchIssue extends Issue {
  priority?: string | null;
  assignee?: string | null;
  reporter?: string | null;
  labels?: string[];
  updated?: string;
}

export interface SearchQueryPlan {
  mode: "empty" | "text" | "jql";
  trimmed: string;
  localTerms: string[];
}

export type SearchInputKeyAction =
  | "none"
  | "close"
  | "search-server"
  | "select-first"
  | "select-last"
  | "insert-first";

export type SearchResultKeyAction =
  | "none"
  | "focus-input"
  | "move-prev"
  | "move-next"
  | "insert"
  | "open";

type KeyLikeEvent = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey">;

export function isIssueKey(input: string): boolean {
  return ISSUE_KEY_RE.test(input);
}

export function escapeJqlText(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function looksLikeJql(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  return JQL_FIELD_RE.test(trimmed) || JQL_CLAUSE_RE.test(trimmed);
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter(Boolean);
}

export function extractLocalSearchTerms(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];
  const source = looksLikeJql(trimmed)
    ? trimmed
        .replace(/"([^"]*)"|'([^']*)'/g, (_match, dq: string, sq: string) => {
          const value = dq || sq;
          return value ? ` ${value} ` : " ";
        })
        .replace(/[()]/g, " ")
    : trimmed;

  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokenize(source)) {
    if (JQL_KEYWORDS.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

export function analyzeSearchQuery(input: string): SearchQueryPlan {
  const trimmed = input.trim();
  if (!trimmed) {
    return { mode: "empty", trimmed: "", localTerms: [] };
  }
  return {
    mode: looksLikeJql(trimmed) ? "jql" : "text",
    trimmed,
    localTerms: extractLocalSearchTerms(trimmed),
  };
}

export function buildSearchJql(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (looksLikeJql(trimmed)) {
    return ORDER_BY_RE.test(trimmed) ? trimmed : `${trimmed} ORDER BY updated DESC`;
  }
  return `text ~ "${escapeJqlText(trimmed)}" ORDER BY updated DESC`;
}

function scoreIssue(issue: SearchIssue, terms: string[], fullQuery: string): number | null {
  const key = issue.key.toLowerCase();
  const summary = issue.summary.toLowerCase();
  const status = issue.status.toLowerCase();
  const type = issue.type.toLowerCase();
  const priority = issue.priority?.toLowerCase() ?? "";
  const assignee = issue.assignee?.toLowerCase() ?? "";
  const reporter = issue.reporter?.toLowerCase() ?? "";
  const labels = (issue.labels ?? []).join(" ").toLowerCase();
  const updated = issue.updated?.toLowerCase() ?? "";
  const haystack = `${key} ${summary} ${status} ${type} ${priority} ${assignee} ${reporter} ${labels} ${updated}`;
  let score = 0;

  for (const term of terms) {
    let matched = false;

    if (key === term) {
      score += 500;
      matched = true;
    } else if (key.startsWith(term)) {
      score += 250;
      matched = true;
    } else if (key.includes(term)) {
      score += 175;
      matched = true;
    }

    if (summary.startsWith(term)) {
      score += 140;
      matched = true;
    } else if (summary.includes(term)) {
      score += 110;
      matched = true;
    }

    if (status.startsWith(term) || type.startsWith(term)) {
      score += 60;
      matched = true;
    } else if (status.includes(term) || type.includes(term)) {
      score += 40;
      matched = true;
    }

    if (priority.startsWith(term)) {
      score += 55;
      matched = true;
    } else if (priority.includes(term)) {
      score += 35;
      matched = true;
    }

    if (assignee.startsWith(term) || reporter.startsWith(term)) {
      score += 50;
      matched = true;
    } else if (assignee.includes(term) || reporter.includes(term)) {
      score += 30;
      matched = true;
    }

    if (labels.split(/\s+/).some((label) => label === term)) {
      score += 55;
      matched = true;
    } else if (labels.includes(term)) {
      score += 35;
      matched = true;
    }

    if (updated.includes(term)) {
      score += 15;
      matched = true;
    }

    if (!matched && haystack.includes(term)) {
      score += 10;
      matched = true;
    }

    if (!matched) return null;
  }

  if (fullQuery && (summary.includes(fullQuery) || key.includes(fullQuery))) {
    score += 80;
  }

  return score;
}

export function searchLocalIssues(
  issues: SearchIssue[],
  input: string,
  limit: number,
): SearchIssue[] {
  const plan = analyzeSearchQuery(input);
  if (plan.localTerms.length === 0) return [];

  const scored = issues.flatMap((issue) => {
    const score = scoreIssue(issue, plan.localTerms, plan.trimmed.toLowerCase());
    return score === null ? [] : [{ issue, score }];
  });

  scored.sort((a, b) => b.score - a.score || a.issue.key.localeCompare(b.issue.key));
  return scored.slice(0, limit).map(({ issue }) => issue);
}

function isModEnter(evt: KeyLikeEvent): boolean {
  return evt.key === "Enter" && (evt.metaKey || evt.ctrlKey);
}

export function getInputKeyAction(
  evt: KeyLikeEvent,
  opts: { hasResults: boolean },
): SearchInputKeyAction {
  if (evt.key === "Escape") return "close";
  if (isModEnter(evt)) return "search-server";
  if (!opts.hasResults) return "none";
  if (evt.key === "ArrowDown") return "select-first";
  if (evt.key === "ArrowUp") return "select-last";
  if (evt.key === "Enter") return "insert-first";
  return "none";
}

export function getResultKeyAction(evt: KeyLikeEvent): SearchResultKeyAction {
  if (evt.key === "Escape") return "focus-input";
  if (evt.key === "ArrowDown") return "move-next";
  if (evt.key === "ArrowUp") return "move-prev";
  if (isModEnter(evt)) return "open";
  if (evt.key === "Enter") return "insert";
  return "none";
}
