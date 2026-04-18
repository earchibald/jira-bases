import { findReferences } from "./ref-scanner";
import { readFrontmatter } from "./frontmatter";

export interface IndexerDeps {
  read(path: string): Promise<string | null>;
  listNotes(): Promise<string[]>;
  getSettings(): {
    baseUrl: string;
    prefixes: string[];
    stubsFolder: string;
  };
  setReferences(
    path: string,
    keys: string[],
    links: string[],
  ): Promise<void>;
}

function asStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function stubWikilink(path: string): string {
  const withoutExt = path.replace(/\.md$/, "");
  return `[[${withoutExt}]]`;
}

export async function rescanFile(
  deps: IndexerDeps,
  path: string,
): Promise<void> {
  const content = await deps.read(path);
  if (content === null) return;
  const { baseUrl, prefixes, stubsFolder } = deps.getSettings();
  const { body } = readFrontmatter(content);
  const found = [...findReferences(body, baseUrl, prefixes)].sort();
  const stubs = await listStubPaths(deps, stubsFolder);
  const links = found
    .map((k) => stubs.get(k))
    .filter((p): p is string => typeof p === "string")
    .map(stubWikilink);
  await deps.setReferences(path, found, links);
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

export async function listStubPaths(
  deps: IndexerDeps,
  stubsFolder: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const prefix = stubsFolder.replace(/\/+$/, "") + "/";
  const notes = await deps.listNotes();
  for (const path of notes) {
    if (!path.startsWith(prefix)) continue;
    const content = await deps.read(path);
    if (content === null) continue;
    const { frontmatter } = readFrontmatter(content);
    const key = frontmatter.jira_key;
    if (typeof key === "string") map.set(key, path);
  }
  return map;
}

export interface OrphanStub {
  key: string;
  path: string;
}

export async function findOrphanedStubs(
  deps: IndexerDeps,
  stubsFolder: string,
): Promise<OrphanStub[]> {
  const referenced = await collectAllKeys(deps, stubsFolder);
  const stubs = await listStubPaths(deps, stubsFolder);
  const orphans: OrphanStub[] = [];
  for (const [key, path] of stubs) {
    if (!referenced.has(key)) orphans.push({ key, path });
  }
  return orphans;
}
