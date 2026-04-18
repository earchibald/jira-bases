import type { Issue, JiraError } from "./jira-client";
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

function renderOk(el: HTMLElement, issue: Issue, ctx: RenderCtx): void {
  const baseUrl = ctx.baseUrl.replace(/\/+$/, "");

  const header = append(el, "div", "jb-header");
  const keyEl = append(header, "span", "jb-key");
  const link = document.createElement("a");
  link.href = `${baseUrl}/browse/${issue.key}`;
  link.textContent = issue.key;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  keyEl.appendChild(link);

  append(el, "div", "jb-summary", issue.summary);

  const meta = append(el, "div", "jb-meta");
  append(meta, "span", "jb-status", issue.status.name).dataset.color =
    issue.status.categoryColor;
  append(meta, "span", "jb-issuetype", issue.issueType.name);
  if (issue.priority) {
    append(meta, "span", "jb-priority", issue.priority.name);
  } else {
    append(meta, "span", "jb-priority", "No priority");
  }

  const people = append(el, "div", "jb-people");
  append(people, "span", "jb-assignee", issue.assignee?.displayName ?? "Unassigned");
  append(people, "span", "jb-reporter", `Reporter: ${issue.reporter.displayName}`);

  append(el, "div", "jb-updated", `Updated ${formatRelative(issue.updated)}`);
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
