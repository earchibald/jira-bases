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

export function parseMarkdownLink(
  text: string,
): { text: string; url: string } | null {
  const m = text.trim().match(MD_LINK_ANCHORED_RE);
  return m ? { text: m[1], url: m[2] } : null;
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
