export interface BareKeyHit {
  key: string;
  lineStart: number;
  start: number;
  end: number;
}

const LINK_RE = /\[[^\]\n]*\]\([^)\n]*\)|\[\[[^\]\n]+\]\]/g;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find bare JIRA keys in `line` that match one of `prefixes`, skipping any key
 * that falls inside a markdown link `[..](..)` / wikilink, or overlaps the
 * cursor (user may still be typing). `cursorCol` is the column within the line
 * (pass -1 if the cursor is not on this line).
 */
export function findBareKeysInLine(
  line: string,
  prefixes: string[],
  cursorCol: number,
): BareKeyHit[] {
  const valid = prefixes.filter((p) => /^[A-Z][A-Z0-9]+$/.test(p));
  if (valid.length === 0) return [];

  const linkRanges: Array<[number, number]> = [];
  for (const m of line.matchAll(LINK_RE)) {
    const s = m.index ?? 0;
    linkRanges.push([s, s + m[0].length]);
  }

  const alt = valid.map(escapeRegex).join("|");
  const re = new RegExp(`\\b(?:${alt})-\\d+\\b`, "g");
  const out: BareKeyHit[] = [];
  for (const m of line.matchAll(re)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const insideLink = linkRanges.some(([a, b]) => start >= a && end <= b);
    if (insideLink) continue;
    if (cursorCol >= 0 && cursorCol >= start && cursorCol <= end) continue;
    out.push({ key: m[0], lineStart: 0, start, end });
  }
  return out;
}

/**
 * Scan `text` line-by-line for bare keys. `cursorLine`/`cursorCol` mark the
 * cursor's editor position (pass `cursorLine: -1` to disable cursor skipping).
 */
export function findBareKeysInText(
  text: string,
  prefixes: string[],
  cursorLine: number,
  cursorCol: number,
): BareKeyHit[] {
  const out: BareKeyHit[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const col = i === cursorLine ? cursorCol : -1;
    for (const hit of findBareKeysInLine(lines[i], prefixes, col)) {
      out.push({ ...hit, lineStart: i });
    }
  }
  return out;
}

export type Timer = ReturnType<typeof setTimeout>;

export interface IdleSchedulerDeps {
  setTimeout: (fn: () => void, ms: number) => Timer;
  clearTimeout: (t: Timer) => void;
}

/**
 * Single-timer debounce scheduler. Each `bump()` resets the quiet window; when
 * the window elapses without another bump, `flush` fires once.
 */
const defaultTimerDeps: IdleSchedulerDeps = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (t) => clearTimeout(t),
};

export function createIdleScheduler(
  idleMs: number,
  flush: () => void,
  deps: IdleSchedulerDeps = defaultTimerDeps,
) {
  let t: Timer | null = null;
  return {
    bump() {
      if (t) deps.clearTimeout(t);
      t = deps.setTimeout(() => {
        t = null;
        flush();
      }, idleMs);
    },
    cancel() {
      if (t) deps.clearTimeout(t);
      t = null;
    },
    get pending() {
      return t !== null;
    },
  };
}
