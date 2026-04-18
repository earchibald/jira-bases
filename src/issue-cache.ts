import type { IssueDetails } from "./jira-fields";
import type { JiraError, Result } from "./jira-client";

export const CACHE_TTL_MS = 5 * 60 * 1000;

type Entry = { issue: IssueDetails; fetchedAt: number };

export interface IssueCache {
  get(key: string): { issue: IssueDetails; fresh: boolean } | null;
  set(key: string, issue: IssueDetails): void;
  inflight(key: string): Promise<Result<IssueDetails, JiraError>> | null;
  trackInflight(key: string, p: Promise<Result<IssueDetails, JiraError>>): void;
}

export function createIssueCache(now: () => number = () => Date.now()): IssueCache {
  const entries = new Map<string, Entry>();
  const pending = new Map<string, Promise<Result<IssueDetails, JiraError>>>();

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
