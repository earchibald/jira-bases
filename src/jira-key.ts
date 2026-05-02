const KEY_RE = /^[A-Z][A-Z0-9]+-\d+$/;
const URL_KEY_RE = /\/browse\/([A-Z][A-Z0-9]+-\d+)(?:[/?#]|$)/;

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, "");
}

export function parseKeyOrUrl(input: string, baseUrl: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (KEY_RE.test(trimmed)) return trimmed;
  return extractKeyFromHref(trimmed, baseUrl);
}

export function extractKeyFromHref(href: string, baseUrl: string): string | null {
  const base = normalizeBase(baseUrl);
  if (!href.startsWith(base + "/")) return null;
  const m = href.match(URL_KEY_RE);
  return m ? m[1] : null;
}

const KEY_ANYWHERE_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/;

export function findKeyInText(text: string): string | null {
  const m = text.match(KEY_ANYWHERE_RE);
  return m ? m[1] : null;
}

const KEY_GLOBAL_RE = /\b[A-Z][A-Z0-9]+-\d+\b/g;

const MD_LINK_GLOBAL_RE = /\[([^\]\n]*)\]\(([^)\s]+)\)/g;
const MD_LINK_ANCHORED_RE = /^\[([^\]\n]*)\]\(([^)\s]+)\)$/;
const WIKILINK_GLOBAL_RE = /\[\[([^|\]\n]+)(?:\|([^\]\n]*))?\]\]/g;
const WIKILINK_ANCHORED_RE = /^\[\[([^|\]\n]+)(?:\|([^\]\n]*))?\]\]$/;

export function parseMarkdownLink(
  text: string,
): { text: string; url: string } | null {
  const m = text.trim().match(MD_LINK_ANCHORED_RE);
  return m ? { text: m[1], url: m[2] } : null;
}

export function parseWikilink(
  text: string,
): { target: string; alias: string | null } | null {
  const m = text.trim().match(WIKILINK_ANCHORED_RE);
  return m ? { target: m[1], alias: m[2] ?? null } : null;
}

export function extractKeyFromWikilink(link: {
  target: string;
  alias: string | null;
}): string | null {
  return findKeyInText(link.target) ?? (link.alias ? findKeyInText(link.alias) : null);
}

/**
 * Find a markdown link `[text](url)` whose span covers `col` in `line`.
 * Returns the link parts plus its [start, end) range within `line`.
 */
export function findLinkAtCol(
  line: string,
  col: number,
): { text: string; url: string; start: number; end: number } | null {
  MD_LINK_GLOBAL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MD_LINK_GLOBAL_RE.exec(line))) {
    const start = m.index;
    const end = start + m[0].length;
    if (col >= start && col <= end) {
      return { text: m[1], url: m[2], start, end };
    }
  }
  return null;
}

export function findLinkContainingRange(
  line: string,
  startCh: number,
  endCh: number,
): { text: string; url: string; start: number; end: number } | null {
  MD_LINK_GLOBAL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MD_LINK_GLOBAL_RE.exec(line))) {
    const start = m.index;
    const end = start + m[0].length;
    if (startCh >= start && endCh <= end) {
      return { text: m[1], url: m[2], start, end };
    }
  }
  return null;
}

export function findWikilinkAtCol(
  line: string,
  col: number,
): { target: string; alias: string | null; start: number; end: number } | null {
  WIKILINK_GLOBAL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WIKILINK_GLOBAL_RE.exec(line))) {
    const start = m.index;
    const end = start + m[0].length;
    if (col >= start && col <= end) {
      return { target: m[1], alias: m[2] ?? null, start, end };
    }
  }
  return null;
}

export function findWikilinkContainingRange(
  line: string,
  startCh: number,
  endCh: number,
): { target: string; alias: string | null; start: number; end: number } | null {
  WIKILINK_GLOBAL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WIKILINK_GLOBAL_RE.exec(line))) {
    const start = m.index;
    const end = start + m[0].length;
    if (startCh >= start && endCh <= end) {
      return { target: m[1], alias: m[2] ?? null, start, end };
    }
  }
  return null;
}

export function classifyIssueReference(
  text: string,
  baseUrl: string,
): { kind: "key" | "link"; key: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (KEY_RE.test(trimmed)) {
    return { kind: "key", key: trimmed };
  }

  const markdown = parseMarkdownLink(trimmed);
  if (markdown) {
    const key = extractKeyFromHref(markdown.url, baseUrl) ?? findKeyInText(markdown.text);
    if (key) return { kind: "link", key };
  }

  const wikilink = parseWikilink(trimmed);
  if (wikilink) {
    const key = extractKeyFromWikilink(wikilink);
    if (key) return { kind: "link", key };
  }

  return null;
}

export function classifyRewriteIssueReference(
  text: string,
  baseUrl: string,
): { kind: "key" | "link"; key: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (KEY_RE.test(trimmed)) {
    return { kind: "key", key: trimmed };
  }

  const markdown = parseMarkdownLink(trimmed);
  if (markdown) {
    const key = extractKeyFromHref(markdown.url, baseUrl);
    if (key) return { kind: "link", key };
    return null;
  }

  const wikilink = parseWikilink(trimmed);
  if (wikilink) {
    const key = extractKeyFromWikilink(wikilink);
    if (key) return { kind: "link", key };
  }

  return null;
}

/**
 * Find a JIRA key whose span covers `col` in `line`. The cursor is considered
 * "on" a key when it sits at the start, end, or anywhere inside the key. Returns
 * the matched key plus its [start, end) range within `line`.
 */
export function findKeyAtCol(
  line: string,
  col: number,
): { key: string; start: number; end: number } | null {
  KEY_GLOBAL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = KEY_GLOBAL_RE.exec(line))) {
    const start = m.index;
    const end = start + m[0].length;
    if (col >= start && col <= end) return { key: m[0], start, end };
  }
  return null;
}

export function findKeyContainingRange(
  line: string,
  startCh: number,
  endCh: number,
): { key: string; start: number; end: number } | null {
  KEY_GLOBAL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = KEY_GLOBAL_RE.exec(line))) {
    const start = m.index;
    const end = start + m[0].length;
    if (startCh >= start && endCh <= end) return { key: m[0], start, end };
  }
  return null;
}
