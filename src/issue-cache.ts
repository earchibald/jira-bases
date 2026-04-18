import type { Issue, JiraError, Result } from "./jira-client";

export const CACHE_TTL_MS = 5 * 60 * 1000;

type Entry = { issue: Issue; fetchedAt: number };

export interface IssueCache {
  get(key: string): { issue: Issue; fresh: boolean } | null;
  set(key: string, issue: Issue): void;
  inflight(key: string): Promise<Result<Issue, JiraError>> | null;
  trackInflight(key: string, p: Promise<Result<Issue, JiraError>>): void;
}

export function createIssueCache(now: () => number = () => Date.now()): IssueCache {
  const entries = new Map<string, Entry>();
  const pending = new Map<string, Promise<Result<Issue, JiraError>>>();

  return {
    get(key) {
      const e = entries.get(key);
      if (!e) return null;
      return { issue: e.issue, fresh: now() - e.fetchedAt < CACHE_TTL_MS };
    },
    set(key, issue) {
      entries.set(key, { issue, fetchedAt: now() });
    },
    inflight(key) {
      return pending.get(key) ?? null;
    },
    trackInflight(key, p) {
      pending.set(key, p);
      void p.finally(() => {
        if (pending.get(key) === p) pending.delete(key);
      });
    },
  };
}
