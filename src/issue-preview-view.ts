import type { JiraError } from "./jira-client";
import type { IssueDetails } from "./jira-fields";
import type { LookupResult } from "./issue-service";

export interface RenderCtx {
  baseUrl: string;
}

export function renderIssue(el: HTMLElement, state: LookupResult, ctx: RenderCtx): void {
  while (el.firstChild) el.removeChild(el.firstChild);
  el.classList.add("jb-issue-preview");

  switch (state.state) {
    case "loading":
      append(el, "div", "jb-loading", "Loading…");
      return;
    case "error":
      append(el, "div", "jb-error", errorMessage(state.error));
      return;
    case "ok":
    case "stale":
      renderOk(el, state.issue, ctx);
      if (state.state === "stale") {
        append(el, "div", "jb-refreshing", "Refreshing…");
      }
      return;
  }
}

function renderOk(el: HTMLElement, issue: IssueDetails, ctx: RenderCtx): void {
  const baseUrl = ctx.baseUrl.replace(/\/+$/, "");

  const header = append(el, "div", "jb-header");
  Object.assign(header.style, {
    display: "flex",
    alignItems: "baseline",
    gap: "8px",
    marginBottom: "4px",
  } as Partial<CSSStyleDeclaration>);

  const link = document.createElement("a");
  link.href = `${baseUrl}/browse/${issue.key}`;
  link.textContent = issue.key;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  Object.assign(link.style, {
    fontWeight: "600",
    textDecoration: "none",
  } as Partial<CSSStyleDeclaration>);
  const keyEl = append(header, "span", "jb-key");
  keyEl.appendChild(link);

  const statusEl = append(header, "span", "jb-status", issue.status);
  Object.assign(statusEl.style, {
    fontSize: "var(--font-ui-smaller)",
    padding: "1px 6px",
    borderRadius: "10px",
    background: "var(--background-modifier-hover)",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  } as Partial<CSSStyleDeclaration>);

  const updated = append(header, "span", "jb-updated", `Updated ${formatRelative(issue.updated)}`);
  Object.assign(updated.style, {
    marginLeft: "auto",
    fontSize: "var(--font-ui-smaller)",
    color: "var(--text-faint)",
  } as Partial<CSSStyleDeclaration>);

  const summary = append(el, "div", "jb-summary", issue.summary);
  Object.assign(summary.style, {
    fontSize: "var(--font-ui-medium)",
    fontWeight: "500",
    marginBottom: "6px",
    lineHeight: "1.3",
  } as Partial<CSSStyleDeclaration>);

  const meta = append(el, "div", "jb-meta");
  Object.assign(meta.style, {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    fontSize: "var(--font-ui-smaller)",
    color: "var(--text-muted)",
    marginBottom: "4px",
  } as Partial<CSSStyleDeclaration>);
  metaItem(meta, "Type", issue.type);
  metaItem(meta, "Priority", issue.priority ?? "—");
  metaItem(meta, "Assignee", issue.assignee ?? "Unassigned");
  metaItem(meta, "Reporter", issue.reporter ?? "—");
  metaItem(meta, "Labels", issue.labels.length > 0 ? issue.labels.join(", ") : "—");
}

function metaItem(parent: HTMLElement, label: string, value: string): void {
  const item = append(parent, "span", "jb-meta-item");
  const lab = append(item, "span", "jb-meta-label", `${label}: `);
  Object.assign(lab.style, { color: "var(--text-faint)" } as Partial<CSSStyleDeclaration>);
  const val = append(item, "span", "jb-meta-value", value);
  Object.assign(val.style, { color: "var(--text-normal)" } as Partial<CSSStyleDeclaration>);
}

function append(parent: HTMLElement, tag: string, cls: string, text?: string): HTMLElement {
  const el = document.createElement(tag);
  el.className = cls;
  if (text !== undefined) el.textContent = text;
  parent.appendChild(el);
  return el;
}

export function errorMessage(err: JiraError): string {
  switch (err.kind) {
    case "no-token":
      return "Set your JIRA Personal Access Token in plugin settings.";
    case "auth":
      return `Authentication failed (HTTP ${err.status}). Check your PAT.`;
    case "not-found":
      return `Issue ${err.key} not found.`;
    case "network":
      return "Couldn't reach JIRA.";
    case "http":
      return `JIRA returned HTTP ${err.status}.`;
    case "parse":
      return "Unexpected response from JIRA.";
  }
}

function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diffMs = Date.now() - t;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(t).toISOString().slice(0, 10);
}
