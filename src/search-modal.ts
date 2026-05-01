import { App, Modal, Notice } from "obsidian";
import type { Issue, JiraClient, JiraError } from "./jira-client";
import {
  getInputKeyAction,
  getResultKeyAction,
  isIssueKey,
  searchLocalIssues,
  type SearchIssue,
} from "./search-helpers";

const RESULT_LIMIT = 20;

export interface SearchModalOptions {
  app: App;
  client: JiraClient;
  loadLocalIssues: () => SearchIssue[];
  onInsert: (issue: Issue) => void | Promise<void>;
  onOpenIssue: (issue: Issue) => void | Promise<void>;
}

export class SearchModal extends Modal {
  private readonly client: JiraClient;
  private readonly loadLocalIssues: () => Issue[];
  private readonly onInsertIssue: (issue: Issue) => void | Promise<void>;
  private readonly onOpenIssueInBrowser: (issue: Issue) => void | Promise<void>;
  private inputEl!: HTMLInputElement;
  private resultsEl!: HTMLElement;
  private helperEl!: HTMLElement;
  private serverHintEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private searchButtonEl!: HTMLButtonElement;
  private localIssues: SearchIssue[] = [];
  private results: Issue[] = [];
  private resultButtons: HTMLButtonElement[] = [];
  private selectedIndex = -1;
  private mode: "local" | "server" = "local";
  private requestSeq = 0;
  private loading = false;
  private reportedKinds = new Set<string>();
  private sizeClassEl: HTMLElement | null = null;

  constructor(opts: SearchModalOptions) {
    super(opts.app);
    this.client = opts.client;
    this.loadLocalIssues = opts.loadLocalIssues;
    this.onInsertIssue = opts.onInsert;
    this.onOpenIssueInBrowser = opts.onOpenIssue;
  }

  onOpen(): void {
    this.titleEl.setText("JIRA: Search issues");
    this.sizeClassEl = this.modalEl instanceof HTMLElement ? this.modalEl : this.contentEl;
    this.sizeClassEl.classList.add("jb-search-modal");
    this.localIssues = this.loadLocalIssues();

    const controlsEl = this.contentEl.createDiv({ cls: "jb-search-controls" });
    this.inputEl = controlsEl.createEl("input", {
      cls: "jb-search-input",
      attr: { type: "text", placeholder: "Issue key, text, or JQL" },
    });
    this.searchButtonEl = controlsEl.createEl("button", {
      cls: "mod-cta",
      text: "Search on server",
      attr: { type: "button" },
    });

    this.helperEl = this.contentEl.createDiv({
      cls: "jb-search-helper",
      text:
        "Search local stubs instantly. Press Cmd-Enter or click Search on server for live JIRA results. JQL is passed through when detected.",
    });
    this.serverHintEl = this.contentEl.createDiv({ cls: "jb-search-server-hint" });
    this.statusEl = this.contentEl.createDiv({ cls: "jb-search-status" });
    this.resultsEl = this.contentEl.createDiv({ cls: "jb-search-results" });

    this.inputEl.addEventListener("input", () => this.renderLocalResults());
    this.inputEl.addEventListener("keydown", (evt) => this.onInputKeydown(evt));
    this.searchButtonEl.addEventListener("click", () => {
      void this.runServerSearch();
    });

    this.renderLocalResults();
    this.inputEl.focus();
  }

  onClose(): void {
    this.sizeClassEl?.classList.remove("jb-search-modal");
    this.sizeClassEl = null;
    this.contentEl.empty();
  }

  private renderLocalResults(): void {
    this.mode = "local";
    this.loading = false;
    this.results = searchLocalIssues(this.localIssues, this.inputEl.value, RESULT_LIMIT);
    this.selectedIndex = this.results.length > 0 ? 0 : -1;
    this.renderResults();
  }

  private async runServerSearch(): Promise<void> {
    const query = this.inputEl.value.trim();
    if (!query || this.loading) return;

    const seq = ++this.requestSeq;
    this.mode = "server";
    this.loading = true;
    this.results = [];
    this.selectedIndex = -1;
    this.renderResults();

    const result = isIssueKey(query)
      ? await this.client.getIssue(query).then((r) =>
          r.ok ? ({ ok: true as const, value: [r.value] }) : r,
        )
      : await this.client.searchIssues(query, RESULT_LIMIT);

    if (seq !== this.requestSeq) return;

    this.loading = false;
    if (!result.ok) {
      this.reportError(result.error);
      this.results = [];
      this.selectedIndex = -1;
      this.renderResults();
      return;
    }

    this.results = result.value;
    this.selectedIndex = this.results.length > 0 ? 0 : -1;
    this.renderResults();
  }

  private renderResults(): void {
    const query = this.inputEl.value.trim();
    this.searchButtonEl.disabled = this.loading || query.length === 0;
    this.serverHintEl.setText(
      query && this.mode === "local" ? "Cmd-Enter to search on server" : "",
    );

    this.statusEl.empty();
    if (this.loading) {
      this.statusEl.setText("Searching JIRA...");
    } else if (!query) {
      this.statusEl.setText("Type to search local stubs.");
    } else if (this.results.length === 0) {
      this.statusEl.setText(
        this.mode === "server" ? "No server results." : "No local stub matches.",
      );
    } else {
      this.statusEl.setText(
        this.mode === "server"
          ? "Showing live JIRA server results."
          : "Showing local stub matches.",
      );
    }

    this.resultsEl.empty();
    this.resultButtons = [];

    this.results.forEach((issue, index) => {
      const button = this.resultsEl.createEl("button", {
        cls: "jb-search-result",
        attr: { type: "button" },
      });
      button.createEl("div", {
        cls: "jb-search-result-title",
        text: `${issue.key} — ${issue.summary}`,
      });
      const meta = [issue.type, issue.status].filter(Boolean).join(" · ");
      if (meta) {
        button.createEl("small", { cls: "jb-search-result-meta", text: meta });
      }
      button.addEventListener("click", () => {
        void this.insertIssue(issue);
      });
      button.addEventListener("keydown", (evt) => this.onResultKeydown(evt, index));
      this.resultButtons.push(button);
    });

    this.updateSelectedButton(false);
  }

  private updateSelectedButton(shouldFocus: boolean): void {
    this.resultButtons.forEach((button, index) => {
      button.classList.toggle("is-selected", index === this.selectedIndex);
      button.setAttribute("aria-selected", index === this.selectedIndex ? "true" : "false");
    });

    if (shouldFocus && this.selectedIndex >= 0) {
      this.resultButtons[this.selectedIndex]?.focus();
    }
  }

  private onInputKeydown(evt: KeyboardEvent): void {
    const action = getInputKeyAction(evt, { hasResults: this.results.length > 0 });
    if (action === "none") return;
    evt.preventDefault();

    switch (action) {
      case "close":
        this.close();
        return;
      case "search-server":
        void this.runServerSearch();
        return;
      case "select-first":
        this.selectedIndex = 0;
        this.updateSelectedButton(true);
        return;
      case "select-last":
        this.selectedIndex = this.results.length - 1;
        this.updateSelectedButton(true);
        return;
      case "insert-first":
        if (this.selectedIndex < 0) return;
        void this.insertIssue(this.results[this.selectedIndex]);
        return;
    }
  }

  private onResultKeydown(evt: KeyboardEvent, index: number): void {
    const action = getResultKeyAction(evt);
    if (action === "none") return;
    evt.preventDefault();

    switch (action) {
      case "focus-input":
        this.inputEl.focus();
        this.inputEl.select();
        return;
      case "move-next":
        this.selectedIndex = Math.min(index + 1, this.results.length - 1);
        this.updateSelectedButton(true);
        return;
      case "move-prev":
        this.selectedIndex = Math.max(index - 1, 0);
        this.updateSelectedButton(true);
        return;
      case "insert":
        void this.insertIssue(this.results[index]);
        return;
      case "open":
        void this.openIssue(this.results[index]);
        return;
    }
  }

  private async insertIssue(issue: Issue): Promise<void> {
    await this.onInsertIssue(issue);
    this.close();
  }

  private async openIssue(issue: Issue): Promise<void> {
    await this.onOpenIssueInBrowser(issue);
    this.close();
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
