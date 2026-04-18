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
