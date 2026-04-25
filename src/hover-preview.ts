import { Plugin } from "obsidian";
import type { IssueService } from "./issue-service";
import { extractKeyFromHref } from "./jira-key";
import { renderIssue } from "./issue-preview-view";

const POPOVER_CLASS = "jb-hover-popover";
const ATTR_BOUND = "data-jb-hover-bound";
const KEY_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/;

export function registerHoverPreview(
  plugin: Plugin,
  service: IssueService,
  getBaseUrl: () => string,
): void {
  plugin.registerDomEvent(document, "mouseover", (evt) => {
    const target = evt.target as HTMLElement | null;
    if (!target) return;
    const baseUrl = getBaseUrl();
    if (!baseUrl) return;

    const found = findKeyAt(target, baseUrl);
    if (!found) return;
    if (found.anchorEl.getAttribute(ATTR_BOUND) === "1") return;

    found.anchorEl.setAttribute(ATTR_BOUND, "1");
    found.anchorEl.addEventListener("mouseenter", () =>
      openPopover(found.anchorEl, found.key, service, baseUrl),
    );
    openPopover(found.anchorEl, found.key, service, baseUrl);
  });
}

function findKeyAt(
  target: HTMLElement,
  baseUrl: string,
): { key: string; anchorEl: HTMLElement } | null {
  // Reading view: real <a href="…/browse/KEY">
  const a = target.closest<HTMLAnchorElement>("a[href]");
  if (a) {
    const k = extractKeyFromHref(a.href, baseUrl);
    if (k) return { key: k, anchorEl: a };
  }
  // Live Preview: hover on a span.cm-link decoration. The URL is hidden;
  // extract a JIRA key from the visible link text.
  const linkSpan = target.closest<HTMLElement>("span.cm-link");
  if (linkSpan) {
    const m = (linkSpan.textContent ?? "").match(KEY_RE);
    if (m) return { key: m[1], anchorEl: linkSpan };
  }
  return null;
}

function openPopover(
  anchor: HTMLElement,
  key: string,
  service: IssueService,
  baseUrl: string,
): void {
  const existing = document.querySelector<HTMLElement>(
    `.${POPOVER_CLASS}[data-jb-anchor-key="${cssEscape(key)}"]`,
  );
  if (existing) return;

  const popover = document.createElement("div");
  popover.className = POPOVER_CLASS;
  popover.setAttribute("data-jb-anchor-key", key);

  const rect = anchor.getBoundingClientRect();
  popover.style.left = `${rect.left + window.scrollX}px`;
  popover.style.top = `${rect.bottom + window.scrollY + 4}px`;
  document.body.appendChild(popover);

  service.lookup(key, (state) => renderIssue(popover, state, { baseUrl }));

  let pendingClose: number | null = null;
  const cancelClose = () => {
    if (pendingClose !== null) {
      window.clearTimeout(pendingClose);
      pendingClose = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    pendingClose = window.setTimeout(() => {
      if (popover.matches(":hover") || anchor.matches(":hover")) return;
      popover.remove();
      anchor.removeAttribute(ATTR_BOUND);
      anchor.removeEventListener("mouseleave", scheduleClose);
      anchor.removeEventListener("mouseenter", cancelClose);
    }, 200);
  };
  anchor.addEventListener("mouseleave", scheduleClose);
  anchor.addEventListener("mouseenter", cancelClose);
  popover.addEventListener("mouseleave", scheduleClose);
  popover.addEventListener("mouseenter", cancelClose);
}

function cssEscape(s: string): string {
  return s.replace(/["\\]/g, "\\$&");
}
