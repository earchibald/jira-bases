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
