import { Plugin } from "obsidian";
import type { IssueService } from "./issue-service";
import { extractKeyFromHref, findKeyInText } from "./jira-key";
import { renderIssue } from "./issue-preview-view";

const POPOVER_CLASS = "jb-hover-popover";
const ATTR_BOUND = "data-jb-hover-bound";
const EXACT_KEY_RE = /^[A-Z][A-Z0-9]+-\d+$/;
const INTERNAL_LINK_SELECTOR = "a.internal-link[data-href], span.cm-link[data-href]";

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

    const found = findKeyAt(plugin, target, baseUrl);
    if (!found) return;
    if (found.anchorEl.getAttribute(ATTR_BOUND) === "1") return;

    found.anchorEl.setAttribute(ATTR_BOUND, "1");
    openPopover(found.anchorEl, found.key, service, baseUrl);
  });
}

function findKeyAt(
  plugin: Plugin,
  target: HTMLElement,
  baseUrl: string,
): { key: string; anchorEl: HTMLElement } | null {
  const internalLink = target.closest<HTMLElement>(INTERNAL_LINK_SELECTOR);
  if (internalLink) {
    const key = extractKeyFromInternalLink(plugin, internalLink);
    if (key) return { key, anchorEl: internalLink };
  }

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
    const key = findKeyInText(linkSpan.textContent ?? "");
    if (key) return { key, anchorEl: linkSpan };
  }
  return null;
}

function extractKeyFromInternalLink(plugin: Plugin, linkEl: HTMLElement): string | null {
  const linkTarget = linkEl.getAttribute("data-href")?.trim();
  if (!linkTarget) return null;

  const sourcePath = plugin.app.workspace.getActiveFile()?.path ?? "";
  const file = plugin.app.metadataCache.getFirstLinkpathDest(linkTarget, sourcePath);
  if (!file) return null;

  // Only trust explicit stub metadata here; guessing from filenames or alias
  // text misclassifies arbitrary note links as JIRA issues.
  const rawKey = plugin.app.metadataCache.getFileCache(file)?.frontmatter?.jira_key;
  if (typeof rawKey !== "string") return null;

  const key = rawKey.trim();
  return EXACT_KEY_RE.test(key) ? key : null;
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

  // Append to body first to measure dimensions
  document.body.appendChild(popover);
  const popoverRect = popover.getBoundingClientRect();

  // Calculate viewport boundaries
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  // Default position: below and to the left of anchor
  let left = rect.left;
  let top = rect.bottom + 4;

  // Check right boundary - if popover would overflow, position to the left of anchor
  if (rect.left + popoverRect.width > viewportWidth) {
    left = Math.max(0, rect.right - popoverRect.width);
  }

  // Check bottom boundary - if popover would overflow, position above anchor
  if (rect.bottom + popoverRect.height + 4 > viewportHeight) {
    top = rect.top - popoverRect.height - 4;
  }

  // Apply final position with scroll offsets
  popover.style.left = `${left + scrollX}px`;
  popover.style.top = `${top + scrollY}px`;

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
