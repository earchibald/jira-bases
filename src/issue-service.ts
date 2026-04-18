import type { JiraClient, JiraError, Result } from "./jira-client";
import type { IssueDetails } from "./jira-fields";
import type { IssueCache } from "./issue-cache";

export type LookupResult =
  | { state: "loading" }
  | { state: "ok"; issue: IssueDetails; refreshing: false }
  | { state: "stale"; issue: IssueDetails; refreshing: true }
  | { state: "error"; error: JiraError };

export interface IssueService {
  lookup(key: string, onUpdate: (r: LookupResult) => void): void;
}

export function createIssueService(client: JiraClient, cache: IssueCache): IssueService {
  function fetchAndCache(key: string): Promise<Result<IssueDetails, JiraError>> {
    const existing = cache.inflight(key);
    if (existing) return existing;
    const p = client.getIssueDetails(key).then((r) => {
      if (r.ok) cache.set(key, r.value);
      return r;
    });
    cache.trackInflight(key, p);
    return p;
  }

  return {
    lookup(key, onUpdate) {
      const hit = cache.get(key);
      if (hit && hit.fresh) {
        onUpdate({ state: "ok", issue: hit.issue, refreshing: false });
        return;
      }
      if (hit && !hit.fresh) {
        onUpdate({ state: "stale", issue: hit.issue, refreshing: true });
        void fetchAndCache(key).then((r) => {
          if (r.ok) onUpdate({ state: "ok", issue: r.value, refreshing: false });
        });
        return;
      }
      onUpdate({ state: "loading" });
      void fetchAndCache(key).then((r) => {
        if (r.ok) onUpdate({ state: "ok", issue: r.value, refreshing: false });
        else onUpdate({ state: "error", error: r.error });
      });
    },
  };
}
