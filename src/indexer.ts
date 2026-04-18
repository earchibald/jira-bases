import { findReferences } from "./ref-scanner";
import { readFrontmatter } from "./frontmatter";

export interface IndexerDeps {
  read(path: string): Promise<string | null>;
  listNotes(): Promise<string[]>;
  getSettings(): { baseUrl: string; prefixes: string[] };
  setJiraIssues(path: string, keys: string[]): Promise<void>;
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
  await deps.setJiraIssues(path, found);
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
