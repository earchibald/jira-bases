function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, "");
}

export function findReferences(
  content: string,
  baseUrl: string,
  prefixes: string[],
): Set<string> {
  const found = new Set<string>();
  const base = normalizeBase(baseUrl);

  if (base.length > 0) {
    const linkRe = new RegExp(
      `${escapeRegex(base)}/browse/([A-Za-z][A-Za-z0-9]+-\\d+)`,
      "g",
    );
    for (const m of content.matchAll(linkRe)) {
      found.add(m[1].toUpperCase());
    }
  }

  const valid = prefixes.filter((p) => /^[A-Z][A-Z0-9]+$/.test(p));
  if (valid.length > 0) {
    const alt = valid.map(escapeRegex).join("|");
    const bareRe = new RegExp(`\\b(?:${alt})-\\d+\\b`, "g");
    for (const m of content.matchAll(bareRe)) {
      found.add(m[0]);
    }
  }

  return found;
}
