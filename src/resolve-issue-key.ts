import {
  extractKeyFromHref,
  findKeyAtCol,
  findKeyInText,
  findLinkAtCol,
  parseKeyOrUrl,
} from "./jira-key";

export interface CursorEditor {
  getSelection(): string;
  getCursor(): { line: number; ch: number };
  getLine(line: number): string;
}

export interface ResolveIssueKeyDeps {
  editor: CursorEditor | null;
  activeFileFrontmatter: Record<string, unknown> | null;
  baseUrl: string;
}

const KEY_RE = /^[A-Z][A-Z0-9]+-\d+$/;

export function resolveIssueKey(deps: ResolveIssueKeyDeps): string | null {
  const { editor, activeFileFrontmatter, baseUrl } = deps;

  if (editor) {
    const selection = editor.getSelection();
    if (selection) {
      const fromSelection =
        parseKeyOrUrl(selection, baseUrl) ?? findKeyInText(selection);
      if (fromSelection) return fromSelection;
    }
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    const link = findLinkAtCol(line, cursor.ch);
    if (link) {
      const linkKey =
        extractKeyFromHref(link.url, baseUrl) ?? findKeyInText(link.text);
      if (linkKey) return linkKey;
    }
    const hit = findKeyAtCol(line, cursor.ch);
    if (hit) return hit.key;
  }

  if (activeFileFrontmatter) {
    const raw = activeFileFrontmatter["jira_key"];
    if (typeof raw === "string") {
      const k = raw.trim();
      if (k && KEY_RE.test(k)) return k;
    }
  }

  return null;
}
