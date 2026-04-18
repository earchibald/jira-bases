import { App, HoverPopover, Plugin } from "obsidian";
import type { IssueService } from "./issue-service";
import { extractKeyFromHref } from "./jira-key";
import { renderIssue } from "./issue-preview-view";

export function registerHoverPreview(
  plugin: Plugin,
  service: IssueService,
  getBaseUrl: () => string,
): void {
  plugin.registerDomEvent(document, "mouseover", (evt) => {
    const target = evt.target as HTMLElement | null;
    if (!target) return;
    const anchor = target.closest("a") as HTMLAnchorElement | null;
    if (!anchor) return;
    if (anchor.dataset.jbHoverBound === "1") return;

    const baseUrl = getBaseUrl();
    if (!baseUrl) return;
    const key = extractKeyFromHref(anchor.href, baseUrl);
    if (!key) return;

    anchor.dataset.jbHoverBound = "1";
    anchor.addEventListener(
      "mouseenter",
      () => openPopover(plugin.app, anchor, key, service, baseUrl),
      { once: false },
    );
    // Trigger on the current event too — user is already hovering.
    openPopover(plugin.app, anchor, key, service, baseUrl);
  });
}

function openPopover(
  _app: App,
  anchor: HTMLAnchorElement,
  key: string,
  service: IssueService,
  baseUrl: string,
): void {
  // HoverPopover constructor signature: (parent, targetEl, waitTime?)
  // `parent` should be a Component; the anchor element works at runtime in
  // current Obsidian builds. If popover lifecycle issues appear during smoke
  // testing, switch to passing the active MarkdownView (resolve via
  // app.workspace.getActiveViewOfType(MarkdownView)).
  const popover = new HoverPopover(anchor as unknown as never, anchor);
  service.lookup(key, (state) => {
    renderIssue(popover.hoverEl, state, { baseUrl });
  });
}
