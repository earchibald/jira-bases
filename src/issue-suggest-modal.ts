import { App, SuggestModal, Notice } from "obsidian";
import type { Issue, JiraClient, JiraError } from "./jira-client";
import { isIssueKey } from "./issue-suggest-helpers";

const DEBOUNCE_MS = 250;
const RESULT_LIMIT = 20;

export interface IssueSuggestModalOptions {
  app: App;
  client: JiraClient;
  onChoose: (issue: Issue) => void;
}

export class IssueSuggestModal extends SuggestModal<Issue> {
  private readonly client: JiraClient;
  private readonly onChooseIssue: (issue: Issue) => void;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private requestSeq = 0;
  private reportedKinds = new Set<string>();

  constructor(opts: IssueSuggestModalOptions) {
    super(opts.app);
    this.client = opts.client;
    this.onChooseIssue = opts.onChoose;
    this.setPlaceholder("Type an issue key or text to search");
    this.emptyStateText = "No results.";
  }

  getSuggestions(query: string): Promise<Issue[]> {
    if (!query.trim()) return Promise.resolve([]);
    const seq = ++this.requestSeq;

    if (isIssueKey(query.trim())) {
      return this.fetchByKey(query.trim(), seq);
    }
    return this.fetchByText(query, seq);
  }

  private async fetchByKey(key: string, seq: number): Promise<Issue[]> {
    const result = await this.client.getIssue(key);
    if (seq !== this.requestSeq) return [];
    if (result.ok) return [result.value];
    this.reportError(result.error);
    return [];
  }

  private fetchByText(query: string, seq: number): Promise<Issue[]> {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    return new Promise((resolve) => {
      this.debounceTimer = setTimeout(async () => {
        if (seq !== this.requestSeq) return resolve([]);
        const result = await this.client.searchIssues(query, RESULT_LIMIT);
        if (seq !== this.requestSeq) return resolve([]);
        if (result.ok) return resolve(result.value);
        this.reportError(result.error);
        resolve([]);
      }, DEBOUNCE_MS);
    });
  }

  renderSuggestion(issue: Issue, el: HTMLElement): void {
    el.createEl("div", { text: `${issue.key} — ${issue.summary}` });
    const meta = [issue.type, issue.status].filter(Boolean).join(" · ");
    if (meta) {
      el.createEl("small", { text: meta });
    }
  }

  onChooseSuggestion(issue: Issue): void {
    this.onChooseIssue(issue);
  }

  private reportError(err: JiraError): void {
    const dedupKey = err.kind === "not-found" ? `not-found:${err.key}` : err.kind;
    if (this.reportedKinds.has(dedupKey)) return;
    this.reportedKinds.add(dedupKey);
    switch (err.kind) {
      case "no-token":
        new Notice("Set your JIRA Personal Access Token in plugin settings.");
        return;
      case "auth":
        new Notice(`Authentication failed (HTTP ${err.status}). Check your PAT.`);
        return;
      case "network":
        new Notice(`Could not reach JIRA: ${err.message}.`);
        return;
      case "not-found":
        new Notice(`Issue ${err.key} not found.`);
        return;
      case "http":
        if (err.status === 400) {
          new Notice("JIRA search failed (HTTP 400). Check that your query is valid.");
        } else {
          new Notice(`JIRA returned HTTP ${err.status}: ${err.message}.`);
        }
        return;
      case "parse":
        new Notice("Unexpected response from JIRA.");
        return;
    }
  }
}
