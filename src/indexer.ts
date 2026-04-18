import { findReferences } from "./ref-scanner";
import { readFrontmatter, writeFrontmatter } from "./frontmatter";

export interface IndexerDeps {
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;
  listNotes(): Promise<string[]>;
  getSettings(): { baseUrl: string; prefixes: string[] };
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
  return true;
}

function asStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

export async function rescanFile(
  deps: IndexerDeps,
  path: string,
): Promise<void> {
  const content = await deps.read(path);
  if (content === null) return;
  const { baseUrl, prefixes } = deps.getSettings();
  const found = [...findReferences(content, baseUrl, prefixes)].sort();

  const { frontmatter } = readFrontmatter(content);
  const existing = asStringList(frontmatter.jira_issues);
  if (found.length === 0 && existing.length === 0) return;
  if (sameSet(found, existing)) return;

  const updated = writeFrontmatter(content, { jira_issues: found });
  if (updated === null) return; // unparseable frontmatter — skip silently
  await deps.write(path, updated);
}

export async function collectAllKeys(
  deps: IndexerDeps,
  stubsFolder: string,
): Promise<Set<string>> {
  const keys = new Set<string>();
  const notes = await deps.listNotes();
  const prefix = stubsFolder.replace(/\/+$/, "") + "/";
  for (const path of notes) {
    if (path.startsWith(prefix)) continue;
    const content = await deps.read(path);
    if (content === null) continue;
    const { frontmatter } = readFrontmatter(content);
    for (const k of asStringList(frontmatter.jira_issues)) keys.add(k);
  }
  return keys;
}

export async function findOrphanedStubs(
  deps: IndexerDeps,
  stubsFolder: string,
): Promise<string[]> {
  const referenced = await collectAllKeys(deps, stubsFolder);
  const prefix = stubsFolder.replace(/\/+$/, "") + "/";
  const notes = await deps.listNotes();
  const orphans: string[] = [];
  for (const path of notes) {
    if (!path.startsWith(prefix)) continue;
    const name = path.slice(prefix.length).replace(/\.md$/, "");
    if (!referenced.has(name)) orphans.push(name);
  }
  return orphans;
}
