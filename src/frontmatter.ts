export type Frontmatter = Record<string, unknown>;

const FM_BOUND = /^---\r?\n([\s\S]*?)(?:\r?\n)?---\r?\n?/;

export function readFrontmatter(content: string): {
  frontmatter: Frontmatter;
  body: string;
} {
  const match = content.match(FM_BOUND);
  if (!match) return { frontmatter: {}, body: content };
  const parsed = parseYamlSubset(match[1]);
  if (parsed === null) {
    return { frontmatter: {}, body: content.slice(match[0].length) };
  }
  return { frontmatter: parsed, body: content.slice(match[0].length) };
}

export function writeFrontmatter(
  content: string,
  patch: Frontmatter,
): string | null {
  const match = content.match(FM_BOUND);
  let base: Frontmatter = {};
  let body = content;
  if (match) {
    const parsed = parseYamlSubset(match[1]);
    if (parsed === null) return null;
    base = parsed;
    body = content.slice(match[0].length);
  }
  const merged: Frontmatter = { ...base, ...patch };
  const yaml = emitYamlSubset(merged);
  if (yaml === null) return null;
  if (yaml.length === 0) {
    return `---\n---\n${body}`;
  }
  return `---\n${yaml}---\n${body}`;
}

// --- YAML subset parser ---
// Supports: top-level scalar keys, string values (plain or quoted),
// and list-of-scalars values (either `[a, b]` inline or block `-` items).
// Returns null for any unsupported construct (nested maps, multi-line strings, etc.).

function parseYamlSubset(src: string): Frontmatter | null {
  const lines = src.split(/\r?\n/);
  const out: Frontmatter = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (/^\s/.test(line)) return null; // unexpected indent at top level
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!m) return null;
    const key = m[1];
    const rest = m[2];
    if (rest === "") {
      // Block list follows, or empty string value
      const items: string[] = [];
      let j = i + 1;
      while (j < lines.length && /^\s+-\s+/.test(lines[j])) {
        const itemMatch = lines[j].match(/^\s+-\s+(.*)$/);
        if (!itemMatch) return null;
        const v = parseScalar(itemMatch[1]);
        if (v === null) return null;
        items.push(v);
        j++;
      }
      if (j === i + 1) {
        out[key] = "";
      } else {
        out[key] = items;
      }
      i = j;
      continue;
    }
    if (rest.startsWith("[") && rest.endsWith("]")) {
      const inner = rest.slice(1, -1).trim();
      if (inner === "") {
        out[key] = [];
      } else {
        const parts = inner.split(",").map((s) => s.trim());
        const items: string[] = [];
        for (const p of parts) {
          const v = parseScalar(p);
          if (v === null) return null;
          items.push(v);
        }
        out[key] = items;
      }
      i++;
      continue;
    }
    const scalar = parseScalar(rest);
    if (scalar === null) return null;
    out[key] = scalar;
    i++;
  }
  return out;
}

function parseScalar(s: string): string | null {
  if (s.length === 0) return "";
  const first = s[0];
  if (first === '"' || first === "'") {
    if (s.length < 2 || s[s.length - 1] !== first) return null;
    const inner = s.slice(1, -1);
    if (first === '"') {
      // Minimal unescape: \" and \\
      return inner.replace(/\\(["\\])/g, "$1");
    }
    return inner;
  }
  if (s.startsWith("{") || s.includes(": ") || s.includes(" #")) return null;
  return s;
}

// --- YAML subset emitter ---

function emitYamlSubset(fm: Frontmatter): string | null {
  const keys = Object.keys(fm);
  if (keys.length === 0) return "";
  const lines: string[] = [];
  for (const k of keys) {
    const v = fm[k];
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) return null;
    if (v === null || v === undefined) {
      lines.push(`${k}: null`);
      continue;
    }
    if (Array.isArray(v)) {
      if (v.length === 0) {
        lines.push(`${k}: []`);
        continue;
      }
      lines.push(`${k}:`);
      for (const item of v) {
        if (typeof item !== "string") return null;
        lines.push(`  - ${emitScalar(item)}`);
      }
      continue;
    }
    if (typeof v === "string") {
      lines.push(`${k}: ${emitScalar(v)}`);
      continue;
    }
    if (typeof v === "number" || typeof v === "boolean") {
      lines.push(`${k}: ${String(v)}`);
      continue;
    }
    return null;
  }
  return lines.join("\n") + "\n";
}

function emitScalar(s: string): string {
  // Quote if contains any YAML-significant character or leading/trailing space.
  if (
    s.length === 0 ||
    /[:#\[\]{}&*!|>'"%@`,]/.test(s) ||
    /^\s|\s$/.test(s) ||
    /^(true|false|null|~|yes|no)$/i.test(s) ||
    /^-?\d/.test(s)
  ) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}
